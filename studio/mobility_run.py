"""Checkpointed Universeum routing preparation; never imported by exhibit startup.

Run with .studio/routing-env/bin/python -m studio.mobility_run.
The benchmark and full run share one transport network. --benchmark-only is
useful for measuring feasibility without starting the full grid calculation.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import importlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import urllib.request
import warnings

import geopandas as gpd
import numpy as np
import pandas as pd
import psutil

from . import locations as loc
from .mobility import SOURCE_COMMIT, SOURCE_URL, footprint, routing_grid

DATE = '2026-09-22'
DEPARTURES = ['06:25', '06:49', '07:15', '07:38', '08:09', '08:31', '09:02', '09:30']
INPUTS = ['config.py', 'grids.py', 'gtfs_dates.py', 'compute_delays.py', 'race_csa.py',
          'data/vt.zip', 'data/goteborg.osm.pbf', 'data/regso_goteborg.gpkg',
          'output/synthpop_delays.csv']


def digest(path):
    return loc.digest(path)


def save_npz(path, **arrays):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('wb', dir=path.parent, delete=False) as file:
        np.savez_compressed(file, **arrays)
        temporary = file.name
    os.replace(temporary, path)


def pinned_inputs(source):
    """Verify Git blob identities before recording SHA256 input provenance."""
    source.mkdir(parents=True, exist_ok=True)
    tree_url = f'https://api.github.com/repos/SaraAboebeid/slow_walkers/git/trees/{SOURCE_COMMIT}?recursive=1'
    request = urllib.request.Request(tree_url, headers={'User-Agent': 'Universeum-mobility-preparation'})
    with urllib.request.urlopen(request, timeout=120) as response:
        entries = {e['path']: e for e in json.load(response)['tree'] if e['type'] == 'blob'}
    checksums = {}
    for name in INPUTS:
        entry = entries[name]; target = source/name
        good = False
        if target.exists():
            data = target.read_bytes()
            good = hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest() == entry['sha']
        if not good:
            target.parent.mkdir(parents=True, exist_ok=True)
            url = f'https://raw.githubusercontent.com/SaraAboebeid/slow_walkers/{SOURCE_COMMIT}/{name}'
            temporary = target.with_suffix(target.suffix+'.download')
            offset = temporary.stat().st_size if temporary.exists() else 0
            request = urllib.request.Request(url, headers={'Range':f'bytes={offset}-'} if offset else {})
            with urllib.request.urlopen(request, timeout=180) as response:
                resumed = offset and response.status == 206 and response.headers.get('Content-Range','').startswith(f'bytes {offset}-')
                if not resumed: offset = 0
                with temporary.open('ab' if resumed else 'wb') as file:
                    reported = offset//(8*1024**2)
                    while chunk := response.read(1024**2):
                        file.write(chunk); offset += len(chunk)
                        if offset//(8*1024**2) > reported:
                            reported = offset//(8*1024**2)
                            print(f'Downloading {name}: {offset/1024**2:.0f}/{entry["size"]/1024**2:.0f} MiB',flush=True)
            data = temporary.read_bytes()
            if len(data) != entry['size'] or hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest() != entry['sha']:
                raise ValueError('Pinned Git blob mismatch: '+name)
            temporary.replace(target)
            print('Pinned input:', name, flush=True)
        checksums[name] = hashlib.sha256(data).hexdigest()
    loc.write_json(source/'upstream.json', {'commit': SOURCE_COMMIT, 'upstreamSha256': checksums})
    return checksums


def scientific_settings(manifest, checksums):
    return {'schemaVersion': 2, 'routingDate': DATE, 'departures': DEPARTURES,
            'originSpacingMetres': 100, 'displaySpacingMetres': 50,
            'interpolation': {'neighbours': 4, 'maximumMetres': 150},
            'sourceCommit': SOURCE_COMMIT, 'upstreamSha256': checksums,
            'recipe': {k: manifest['recipe'][k] for k in ('sourceBounds', 'sourceCrs')},
            'speedsKmh': {'medium': 4.8, 'slow': 4.235}, 'maxTimeMinutes': 180,
            'departureWindowMinutes': 1, 'roundingToleranceMinutes': 1,
            'syntheticWindow': ['07:00', '15:00'], 'syntheticDestination': [11.9605, 57.6832],
            'syntheticWalkDetour': 1.3, 'r5py': '1.1.7', 'adapterVersion': 1}


def fingerprint(settings):
    return hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()


def spatial_sample(origins, count=32):
    xy = np.c_[origins.geometry.x, origins.geometry.y]
    selected = [int(np.argmin(((xy-xy.mean(0))**2).sum(1)))]; distances = np.full(len(xy), np.inf)
    while len(selected) < min(count, len(xy)):
        distances = np.minimum(distances, ((xy-xy[selected[-1]])**2).sum(1)); distances[selected] = -1
        selected.append(int(np.argmax(distances)))
    return origins.iloc[sorted(selected)].copy()


def batch_totals(slow, medium, origin_ids, origin_xy, destination_xy):
    """Match actual locations, never confuse independently numbered grids."""
    rows = {f'o{int(i)}': j for j, i in enumerate(origin_ids)}
    for frame in (slow, medium):
        if not set(frame.from_id) <= set(rows): raise ValueError('Unknown routing origin')
        if not set(frame.to_id) <= set(destination_xy): raise ValueError('Unknown routing destination')
        if frame.duplicated(['from_id','to_id']).any(): raise ValueError('Duplicate routing pairs')
        if len(frame) != len(rows)*len(destination_xy): raise ValueError('Incomplete routing matrix')
    joined = medium.merge(slow, on=['from_id', 'to_id'], suffixes=('_medium', '_slow'), validate='one_to_one')
    same = np.array([np.linalg.norm(origin_xy[a]-destination_xy[b]) < .01
                     for a, b in zip(joined.from_id, joined.to_id)], dtype=bool)
    joined = joined[~same & joined.travel_time_medium.notna()].copy()
    unreachable = int(joined.travel_time_slow.isna().sum())
    joined = joined.dropna(subset=['travel_time_medium', 'travel_time_slow'])
    medium_minutes = joined.travel_time_medium.to_numpy(dtype=float)
    slow_minutes = joined.travel_time_slow.to_numpy(dtype=float)
    if not np.isfinite(medium_minutes).all() or not np.isfinite(slow_minutes).all():
        raise ValueError('Nonfinite routed times')
    delay = np.maximum(0, slow_minutes-medium_minutes)
    missed = delay > (4.8/4.235-1)*medium_minutes+1
    indices = np.array([rows[i] for i in joined.from_id], dtype=int); n = len(origin_ids)
    return {'trips': np.bincount(indices, minlength=n),
            'missed': np.bincount(indices[missed], minlength=n),
            'missed_delay': np.bincount(indices[missed], weights=delay[missed], minlength=n),
            'unreachable_slow': unreachable}


def checkpoint(path, ids, run_fingerprint):
    if not path.exists(): return None
    try:
        with np.load(path, allow_pickle=False) as data:
            if str(data['fingerprint']) != run_fingerprint or not np.array_equal(data['point_id'], ids): return None
            arrays = {name: data[name].copy() for name in ('trips', 'missed', 'missed_delay')}
            if any(a.shape != (len(ids),) or not np.isfinite(a).all() or (a < 0).any() for a in arrays.values()): return None
            if (arrays['missed'] > arrays['trips']).any() or ((arrays['missed'] == 0) & (arrays['missed_delay'] != 0)).any(): return None
            if any(not np.equal(arrays[name], np.floor(arrays[name])).all() for name in ('trips','missed')): return None
            unreachable = int(data['unreachable_slow'])
            if unreachable < 0 or unreachable != float(data['unreachable_slow']): return None
            return {**arrays, 'unreachable_slow': unreachable,
                    '_runtimeSeconds': float(data['runtime_seconds']) if 'runtime_seconds' in data else 0}
    except (OSError, ValueError, KeyError): return None


def memory_mb():
    process = psutil.Process()
    return round((process.memory_info().rss+sum(c.memory_info().rss for c in process.children(recursive=True) if c.is_running()))/2**20, 1)


def routing(source, output, run, origins, destinations, benchmark_only=False):
    # r5py stores its verified R5 JAR and OSM network cache under XDG_CACHE_HOME.
    # Keep those generated artifacts in the ignored project cache on managed hosts
    # where the user's global ~/.cache directory is not writable.
    os.environ['XDG_CACHE_HOME'] = str(loc.HOME/'cache'/'routing')
    sys.path.insert(0, str(source)); config = importlib.import_module('config')
    config.JAVA_MAX_MEMORY = '12G'; sys.argv = [sys.argv[0]]
    model = importlib.import_module('compute_delays')
    if importlib.metadata.version('r5py') != '1.1.7': raise ValueError('Use the isolated r5py 1.1.7 environment')
    warnings.filterwarnings('once', message='The provided departure time window is below 5 minutes.*')
    feed = model.prepare_gtfs(source/'data/vt.zip', source/'data/vt_r5.zip')
    network_started = time.monotonic()
    print('Building shared Gothenburg transport network', flush=True)
    network = model.r5py.TransportNetwork(source/'data/goteborg.osm.pbf', [feed])
    run['networkBuildSeconds'] = round(time.monotonic()-network_started, 2)
    target = destinations[['id', 'geometry']].to_crs(4326); target['id'] = ['d'+str(i) for i in target.id]
    metric_targets = target.to_crs(3006)
    dest_xy = {i: np.array([g.x, g.y]) for i, g in zip(metric_targets.id, metric_targets.geometry)}
    peak = memory_mb()

    def calculate(frame, index, folder):
        nonlocal peak
        ids = frame.id.to_numpy(); file = folder/DEPARTURES[index].replace(':', '')/(str(int(ids[0]))+'.npz')
        cached = checkpoint(file, ids, run['fingerprint'])
        if cached is not None: return cached, cached.pop('_runtimeSeconds', 0)
        route_origins = frame[['id', 'geometry']].to_crs(4326); route_origins['id'] = ['o'+str(i) for i in ids]
        departure = dt.datetime.fromisoformat(DATE+'T'+DEPARTURES[index])
        metric_origins = frame.to_crs(3006)
        xy = {f'o{int(i)}': np.array([g.x, g.y]) for i, g in zip(metric_origins.id, metric_origins.geometry)}
        started = time.monotonic()
        medium = model.travel_times(network, route_origins, target, 4.8, departure)
        peak = max(peak, memory_mb())
        slow = model.travel_times(network, route_origins, target, 4.235, departure)
        peak = max(peak, memory_mb())
        values = batch_totals(slow, medium, ids, xy, dest_xy)
        seconds = time.monotonic()-started
        save_npz(file, fingerprint=np.array(run['fingerprint']), point_id=ids, runtime_seconds=seconds, **values)
        return values, seconds

    benchmark_file = output/'benchmark.json'
    existing = json.loads(benchmark_file.read_text()) if benchmark_file.exists() else {}
    if existing.get('fingerprint') != run['fingerprint'] or len(existing.get('samples', [])) < len(DEPARTURES):
        subset = spatial_sample(origins)
        rows = existing.get('samples', []) if existing.get('fingerprint') == run['fingerprint'] else []
        peak = max(peak, existing.get('peakRssMiB', 0))
        for index in range(len(rows), len(DEPARTURES)):
            label = DEPARTURES[index]
            values, seconds = calculate(subset, index, output/'benchmark-batches')
            rows.append({'departure': label, 'seconds': round(seconds, 2),
                         'routedPairs': int(values['trips'].sum()), 'unreachableSlow': values['unreachable_slow']})
            report = {'fingerprint': run['fingerprint'], 'originIds': subset.id.tolist(), 'samples': rows,
                      'peakRssMiB': peak, 'networkBuildSeconds': run['networkBuildSeconds'],
                      'estimatedFullSeconds': round(sum(x['seconds'] for x in rows)*len(origins)/len(subset))}
            loc.write_json(benchmark_file, report)
            print('Benchmark:', json.dumps(rows[-1]), 'peak RSS', peak, 'MiB', flush=True)
    benchmark = json.loads(benchmark_file.read_text())
    if len(benchmark['samples']) != len(DEPARTURES): raise ValueError('Benchmark is incomplete')
    print('Benchmark projected full routing:', round(benchmark['estimatedFullSeconds']/3600, 2), 'hours', flush=True)
    if benchmark_only: return
    shape = (len(DEPARTURES), len(origins)); totals = {k: np.zeros(shape) for k in ('trips', 'missed', 'missed_delay')}
    unreachable = 0; began = time.monotonic()
    for index, label in enumerate(DEPARTURES):
        for start in range(0, len(origins), 128):
            frame = origins.iloc[start:start+128]; values, seconds = calculate(frame, index, output/'batches')
            ids = frame.id.to_numpy()
            for key in totals: totals[key][index, ids] = values[key]
            unreachable += values['unreachable_slow']
            run.update({'state': 'routing', 'currentDeparture': label, 'currentOrigin': start+len(frame), 'peakRssMiB': peak})
            loc.write_json(output/'run.json', run)
            print(f'Routing {label}: {start+len(frame)}/{len(origins)} origins; batch {seconds:.1f}s; RSS {peak:.0f} MiB', flush=True)
        save_npz(output/'output/delays_by_departure.npz', **totals, point_id=origins.id.to_numpy(),
                 departures=np.array(DEPARTURES), done=index+1, unreachable_slow=unreachable)
        run['completedDepartures'] = index+1; loc.write_json(output/'run.json', run)
    run['routingSeconds'] = round(time.monotonic()-began, 2)


def synthetic(source, output, run, visible):
    sys.path.insert(0, str(source)); model = importlib.import_module('race_csa')
    original = pd.read_csv(source/'output/synthpop_delays.csv')
    homes = gpd.GeoSeries(gpd.points_from_xy(original.lon, original.lat), crs=4326).to_crs(3006)
    cohort = original.loc[homes.within(visible)].copy(); cohort['source_row'] = cohort.index
    if len(cohort) != 1018: raise ValueError('Pinned Universeum cohort has changed')
    cohort['resident_id'] = [hashlib.sha256(str(i).encode()).hexdigest()[:20] for i in cohort.uuid_person]
    cohort['trip_id'] = [hashlib.sha256(json.dumps([str(r.uuid_person), int(r.source_row), int(r.hour), int(r.minute), float(r.lon), float(r.lat)]).encode()).hexdigest()[:24] for r in cohort.itertuples()]
    if not cohort.trip_id.is_unique: raise ValueError('Synthetic trip keys are not unique')
    if (cohort.age < 75).any() or not np.isfinite(cohort[['hour', 'minute', 'lon', 'lat']]).all().all(): raise ValueError('Invalid synthetic cohort')
    print('Loading synthetic-trip timetable; local cohort', len(cohort), flush=True)
    stops, connections, trips, shapes = model.load_timetable(dt.date.fromisoformat(DATE), 7*3600, hours=10)
    destination = gpd.GeoSeries(gpd.points_from_xy([11.9605], [57.6832]), crs=4326).to_crs(3006).iloc[0]
    records, all_legs = [], []; began = time.monotonic()
    for number, row in enumerate(cohort.itertuples(), 1):
        file = output/'synthetic-batches'/(row.trip_id+'.json')
        if file.exists():
            cached = json.loads(file.read_text())
            if cached.get('fingerprint') != run['fingerprint']: raise ValueError('Synthetic checkpoint settings changed')
        else:
            origin = homes.loc[row.Index]; t0 = int(row.hour)*3600+int(row.minute)*60
            itineraries, elapsed = {}, {}
            for walker, speed in [('medium', 4.8), ('slow', 4.235)]:
                legs = model.plan(stops, connections[connections.dep >= t0], np.array([origin.x, origin.y]), np.array([destination.x, destination.y]), t0, speed)
                elapsed[walker] = (legs[-1][4]-t0)/60 if legs else None
                itineraries[walker] = model.to_rows(legs, walker, stops, trips, shapes, (row.lon, row.lat), (11.9605,57.6832), dt.date.fromisoformat(DATE)) if legs else []
            delay = elapsed['slow']-elapsed['medium'] if all(v is not None for v in elapsed.values()) else None
            record = {name: getattr(row, name) for name in ['trip_id','resident_id','age','hour','minute','lon','lat']}
            record.update(medium_min=elapsed['medium'], slow_min=elapsed['slow'], delay_min=delay,
                          route_status='paired' if delay is not None else 'unreachable')
            exported = []
            if delay is not None and delay > 1:
                for walker, rows in itineraries.items():
                    for segment, leg in enumerate(rows):
                        start = dt.datetime.fromisoformat(leg['departure_time']); midnight = dt.datetime.fromisoformat(DATE)
                        if leg['travel_time_s'] <= 0: continue
                        exported.append({'trip_id':row.trip_id,'walker':walker,'segment':segment,'mode':leg['mode'],
                                         'start_s':(start-midnight).total_seconds()-t0,'travel_time_s':leg['travel_time_s'],
                                         'coordinates':list(leg['geometry'].coords)})
            cached = {'fingerprint':run['fingerprint'],'record':record,'legs':exported}
            loc.write_json(file, cached)
        records.append(cached['record']); all_legs.extend(cached['legs'])
        if number%50 == 0 or number == len(cohort):
            run.update(state='synthetic', syntheticCompleted=number); loc.write_json(output/'run.json', run)
            print(f'Synthetic: {number}/{len(cohort)}; {(time.monotonic()-began)/60:.1f} min', flush=True)
    csv = pd.DataFrame(records); csv.to_csv(output/'synthetic.csv', index=False)
    from shapely.geometry import LineString
    if all_legs:
        frame = gpd.GeoDataFrame([{k:v for k,v in row.items() if k!='coordinates'} for row in all_legs],
                                geometry=[LineString(row['coordinates']) for row in all_legs],crs=4326)
    else:
        frame = gpd.GeoDataFrame({'trip_id':pd.Series(dtype=str),'walker':pd.Series(dtype=str),'segment':pd.Series(dtype=int),
                                 'mode':pd.Series(dtype=str),'start_s':pd.Series(dtype=float),'travel_time_s':pd.Series(dtype=float)},geometry=[],crs=4326)
    target = output/'legs.gpkg'; target.unlink(missing_ok=True); frame.to_file(target,driver='GPKG')
    run['syntheticSeconds'] = round(time.monotonic()-began,2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--location', default='universeum')
    parser.add_argument('--source', type=Path, default=loc.HOME/'cache/mobility'/SOURCE_COMMIT)
    parser.add_argument('--output', type=Path, default=loc.HOME/'cache/mobility/universeum-100m-20260922')
    parser.add_argument('--benchmark-only', action='store_true')
    args = parser.parse_args(); source=args.source.resolve(); output=args.output.resolve(); output.mkdir(parents=True, exist_ok=True)
    with (output/'.run.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        manifest = loc.load(args.location); checksums = pinned_inputs(source)
        settings = scientific_settings(manifest, checksums); identity = fingerprint(settings)
        run_file = output/'run.json'
        previous = json.loads(run_file.read_text()) if run_file.exists() else {}
        if previous and previous.get('fingerprint') != identity: raise ValueError('Existing run has different inputs/settings; choose a new output directory')
        run = {**settings, **previous, 'fingerprint':identity, 'plannedDepartures':8,
               'completedDepartures':previous.get('completedDepartures',0), 'districtScope':'Origins within the table area',
               'dataPath':str(source/'data'), 'source':{'repository':SOURCE_URL,'commit':SOURCE_COMMIT,'path':str(source),
               'upstreamSha256':checksums}, 'dependencies':{m:importlib.metadata.version(m) for m in ('r5py','geopandas','numpy','pandas','scipy','shapely')},
               'python':sys.version.split()[0], 'javaHeap':'12G', 'batchSize':128}
        visible = footprint(manifest); districts = gpd.read_file(source/'data/regso_goteborg.gpkg').rename(columns={'regsokod':'district'}).to_crs(3006)
        origins = routing_grid(districts,visible.bounds,100); origins=origins[origins.geometry.within(visible)].reset_index(drop=True)
        origins['id'] = np.arange(len(origins)); origins=origins[['id','district','geometry']]
        origin_file=output/'origins.gpkg'
        if not origin_file.exists(): origins.to_file(origin_file,driver='GPKG')
        else:
            saved=gpd.read_file(origin_file).to_crs(3006)
            if not np.array_equal(saved.id,origins.id) or saved.geometry.distance(origins.geometry).max()>.001: raise ValueError('Stored origins differ from settings')
        sys.path.insert(0,str(source)); grid=importlib.import_module('grids')
        destinations=grid.make_grid(districts,500); run.update(originCount=len(origins),destinationCount=len(destinations))
        loc.write_json(run_file,run)
        print('Run:',len(origins),'100 m origins;',len(destinations),'citywide destinations;',len(DEPARTURES),'departures',flush=True)
        routing(source,output,run,origins,destinations,args.benchmark_only)
        if args.benchmark_only: return
        synthetic(source,output,run,visible)
        names=['origins.gpkg','output/delays_by_departure.npz','synthetic.csv','legs.gpkg']
        run.update(state='complete',outputSha256={name:digest(output/name) for name in names})
        loc.write_json(run_file,run)
        print('Complete validated routing inputs:',output,flush=True)


if __name__=='__main__': main()
