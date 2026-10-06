"""Prepare static, reproducible mobility exhibits; no routing runs at playback time."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from shapely.geometry import box, mapping

SOURCE_COMMIT = '530a93530baf450041075a9c0dd28b6f4787d890'
SOURCE_URL = 'https://github.com/SaraAboebeid/slow_walkers'
# Immutable upstream checksums must not be read from a generated exhibit manifest.
# A locally rerouted package has different outputs and is never a download recipe.
PINNED_SOURCE_SHA256 = {
    'README.md': 'dd37606ceddc233ce1f700759373fc0189d78cebb85e0d7f959cfabb60e7c533',
    'config.py': '3cae23e89250f197de18f0a46a188d53b3db7de57a682394308d502ff8985b24',
    'data/regso_goteborg.gpkg': '57c4ed4205afc3f7177a0ec57c515a314443fc763984babe28ac6f66c5fdd608',
    'grids.py': '9e77cc5846c01c151db2040834db67f812de5bc9fd42622e5f7f54aa3a7c9e15',
    'output/compute_delays.log': '0e0f88852f9830c77b47336ebe36376f663efa18e4ab01f9ac70b7c62d4f6592',
    'output/delays_by_departure.npz': '86a495c04be18c74ca4bc5a2ab022cb472543994408ce38f9c7ee64572f7c88b',
    'output/district_delays.gpkg': '518ae85d6ef53c0ecd8b53c06531de0c817a53f5d922a967ff09ef2bc9838782',
    'output/point_delays.gpkg': '64152b2f7a3e315895704014c2dc99b8bd12a6b70349627e9fa02567b0b012d7',
    'output/synthpop_delays.csv': 'd56af3294b4d36e73402e6266b2f10befd1cd65e2e01a4695b3c4c1446fb96c0',
    'output/synthpop_legs.gpkg': '048ec56c6431dfd6057cfc984eeb4b654948a1d3c69460f5bc015ea28e178ff0',
    'output/synthpop_routes.gpkg': '96a21820abaa8bbdecfbcaa99d36a8c85eb0d4b740e189db436cdedaf41b44e6',
}
NEW_DEPARTURES = ['06:25', '06:49', '07:15', '07:38', '08:09', '08:31', '09:02', '09:30']
COLORS = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026']
SYNTH_BINS = [0, .5, 1, 2, 5, 10]

def download(source):
    """Fetch only the pinned research inputs; never run routing or execute code."""
    import urllib.request
    expected = PINNED_SOURCE_SHA256
    source=Path(source);source.mkdir(parents=True,exist_ok=True)
    for relative,checksum in expected.items():
        target=source/relative
        if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest()==checksum:continue
        target.parent.mkdir(parents=True,exist_ok=True)
        with urllib.request.urlopen(f'https://raw.githubusercontent.com/SaraAboebeid/slow_walkers/{SOURCE_COMMIT}/{relative}',timeout=120) as response:
            data=response.read()
        if hashlib.sha256(data).hexdigest()!=checksum:raise ValueError('Pinned input checksum mismatch: '+relative)
        temp=target.with_suffix(target.suffix+'.tmp');temp.write_bytes(data);temp.replace(target)
        print('Downloaded',relative,flush=True)
    return source


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False), encoding='utf-8')


def footprint(manifest, crs=3006):
    recipe = manifest['recipe']
    if recipe.get('sourceBounds'):
        geometry = box(*recipe['sourceBounds'])
        source = recipe['sourceCrs']
    else:
        geometry = box(*manifest['bounds'])
        source = 4326
    return gpd.GeoSeries([geometry], crs=source).to_crs(crs).iloc[0]


def routing_grid(districts, bounds, spacing):
    xmin, ymin, xmax, ymax = bounds
    xx, yy = np.meshgrid(np.arange(xmin + spacing / 2, xmax, spacing),
                         np.arange(ymin + spacing / 2, ymax, spacing))
    points = gpd.GeoDataFrame(geometry=gpd.points_from_xy(xx.ravel(), yy.ravel()), crs=3006)
    return gpd.sjoin(points, districts[['district', 'geometry']], predicate='within').drop(columns='index_right')


def point_values(trips, missed, delay):
    """No missed connections is zero; no routed trips is missing, never zero."""
    out = np.zeros_like(delay, dtype=float)
    np.divide(delay, missed, out=out, where=missed > 0)
    out[trips <= 0] = np.nan
    return out


def blended_cells(points, values, area, spacing, neighbours, maximum):
    if area.is_empty:
        return [], []
    xmin, ymin, xmax, ymax = area.bounds
    xx, yy = np.meshgrid(np.arange(xmin + spacing / 2, xmax, spacing),
                         np.arange(ymin + spacing / 2, ymax, spacing))
    centres = gpd.GeoSeries(gpd.points_from_xy(xx.ravel(), yy.ravel()), crs=3006)
    centres = centres[centres.within(area)].reset_index(drop=True)
    if not len(centres):
        return [], []
    distances, indices = cKDTree(np.c_[points.geometry.x, points.geometry.y]).query(
        np.c_[centres.x, centres.y], k=min(neighbours, len(points)))
    if distances.ndim == 1:
        distances, indices = distances[:, None], indices[:, None]
    keep = distances[:, 0] < maximum
    centres, distances, indices = centres[keep], distances[keep], indices[keep]
    neighbours_values = values[indices]
    weights = (1 / np.maximum(distances, 1) ** 2)[..., None] * np.isfinite(neighbours_values)
    denominator = weights.sum(1)
    blended = np.full(denominator.shape, np.nan)
    np.divide((weights * np.nan_to_num(neighbours_values)).sum(1), denominator,
              out=blended, where=denominator > 0)
    half = spacing / 2
    return [box(p.x-half, p.y-half, p.x+half, p.y+half).intersection(area) for p in centres], blended


def finite_values(values):
    return [round(float(v), 3) if np.isfinite(v) else None for v in values]


def features(geometries, properties, crs=3006):
    wgs = gpd.GeoSeries(geometries, crs=crs).to_crs(4326)
    return [{'type': 'Feature', 'geometry': mapping(geom), 'properties': props}
            for geom, props in zip(wgs, properties)]


def prepare(source: Path, output: Path, manifest: dict, commit=SOURCE_COMMIT):
    source, output = Path(source), Path(output)
    if (source/'run.json').is_file():
        return prepare_run(source, output, manifest)
    districts = gpd.read_file(source/'data/regso_goteborg.gpkg').rename(columns={'regsokod': 'district'}).to_crs(3006)
    if districts.district.duplicated().any() or not districts.geometry.is_valid.all() or districts.geometry.is_empty.any() or not districts.geometry.geom_type.isin(['Polygon','MultiPolygon']).all():
        raise ValueError('Invalid RegSO geometry or duplicate district IDs')
    city = routing_grid(districts, districts.total_bounds, 500)
    missing = districts[~districts.district.isin(city.district)]
    city = gpd.GeoDataFrame(pd.concat([city, gpd.GeoDataFrame({'district': missing.district},
        geometry=missing.representative_point(), crs=3006)], ignore_index=True), crs=3006)
    city['id'] = np.arange(len(city))
    # The pinned run uses 50 m, despite the README's older 100 m description.
    centre = gpd.GeoSeries(gpd.points_from_xy([11.9778], [57.6884]), crs=4326).to_crs(3006).iloc[0]
    campus_area = box(centre.x-500, centre.y-700, centre.x+500, centre.y+700)
    campus = routing_grid(districts, campus_area.bounds, 50).reset_index(drop=True)
    campus['id'] = np.arange(len(city), len(city)+len(campus))
    points = pd.concat([city, campus], ignore_index=True)
    published = gpd.read_file(source/'output/point_delays.gpkg').to_crs(3006).set_index('id')
    if not published.index.is_unique or not published.geometry.geom_type.eq('Point').all() or not published.geometry.is_valid.all():
        raise ValueError('Invalid routing-point geometry or duplicate point IDs')
    if len(published) != len(city) or city.geometry.distance(published.loc[city.id].geometry.reset_index(drop=True)).max() > .01:
        raise ValueError('Published city coordinates do not match the reconstructed routing grid')
    with np.load(source/'output/delays_by_departure.npz', allow_pickle=False) as data:
        done = int(data['done'])
        if not 0 < done <= len(data['departures']) or not np.array_equal(points.id, data['point_id']):
            raise ValueError('Routing point IDs or completed-departure count are inconsistent')
        trips, missed, delay = [data[k][:done].copy() for k in ('trips', 'missed', 'missed_delay')]
        if any(a.shape != (done, len(points)) or not np.isfinite(a).all() or (a < 0).any() for a in (trips, missed, delay)) or (missed > trips).any():
            raise ValueError('Invalid routing totals')
        if ((missed==0)&(delay!=0)).any():raise ValueError('Delay totals without missed trips')
        departures = [str(t) for t in data['departures'][:done]]
        planned = len(data['departures'])
    all_day = point_values(trips.sum(0), missed.sum(0), delay.sum(0))
    values = np.column_stack([all_day, point_values(trips, missed, delay).T])
    visible = footprint(manifest)
    land = districts.geometry.union_all().intersection(visible)
    geometries, properties = [], []
    for group, pts, vals, area, spacing, neighbours, maximum in (
            ('city', city, values[:len(city)], land.difference(campus_area), 200, 6, 500),
            ('campus', campus, values[len(city):], land.intersection(campus_area), 25, 4, 75)):
        cells, blended = blended_cells(pts, vals, area, spacing, neighbours, maximum)
        geometries.extend(cells)
        properties.extend({'grid': group, 'values': finite_values(row)} for row in blended)
    area_geometry, area_properties = [], []
    for row in districts.itertuples():
        clipped = row.geometry.intersection(visible)
        if clipped.is_empty:
            continue
        selection = city.district.to_numpy() == row.district
        t, m, d = [a[:, :len(city)][:, selection].sum(1) for a in (trips, missed, delay)]
        averages = np.r_[point_values(np.array([t.sum()]), np.array([m.sum()]), np.array([d.sum()])), point_values(t, m, d)]
        area_geometry.append(clipped)
        area_properties.append({'id': row.district, 'name': row.regsonamn, 'values': finite_values(averages)})
    provenance = {'repository': SOURCE_URL, 'commit': commit,
        'syntheticPopulation': 'https://zenodo.org/records/10801936',
        'speedsKmh': {'medium': 4.8, 'slow': 4.235},
        'sha256': {str(p.relative_to(source)): hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in sorted(source.rglob('*')) if p.is_file()}}
    grid_meta = {'title': 'Time Lost by Slow Walkers', 'departures': departures,
        'completedDepartures': done, 'plannedDepartures': planned, 'routingDate': '2026-09-22',
        'bins': [0, 5, 10, 15, 20, 25, 30], 'colors': COLORS,
        'measure': 'Average extra minutes on modelled trips classified as missed connections',
        'sampling': f'{done} morning departures · {departures[0]}–{departures[-1]}',
        'districtScope': 'Whole RegSO areas intersecting the table; trip-weighted city origins',
        'provenance': provenance}
    write(output/'slow-walkers.geojson', {'type': 'FeatureCollection', 'metadata': grid_meta,
          'features': features(geometries, properties)})
    write(output/'districts.geojson', {'type': 'FeatureCollection', 'features': features(area_geometry, area_properties)})

    csv = pd.read_csv(source/'output/synthpop_delays.csv')
    if not {'lon', 'lat', 'age', 'uuid_person', 'delay_min', 'medium_min', 'slow_min'} <= set(csv):
        raise ValueError('Synthetic-trip columns are missing')
    valid = csv.dropna(subset=['delay_min']).reset_index(drop=True)
    if (valid.age < 75).any() or not np.isfinite(valid[['lon','lat','delay_min','medium_min','slow_min']]).all().all():
        raise ValueError('Invalid synthetic trip')
    lose = valid[valid.delay_min > 1].reset_index(drop=True)
    residents = gpd.GeoDataFrame(csv, geometry=gpd.points_from_xy(csv.lon, csv.lat), crs=4326).to_crs(3006)
    local_all = residents[residents.within(visible)].copy()
    local = local_all.dropna(subset=['delay_min']).copy()
    local['cell_x'], local['cell_y'] = np.floor(local.geometry.x/200).astype(int), np.floor(local.geometry.y/200).astype(int)
    cells, props = [], []
    for (x, y), rows in local.groupby(['cell_x', 'cell_y']):
        cells.append(box(x*200, y*200, (x+1)*200, (y+1)*200).intersection(visible))
        props.append({'delay': round(float(rows.delay_min.mean()), 3), 'trips': len(rows), 'residents': rows.uuid_person.nunique()})
    metadata = {'title': 'Synth Pop Heatmap', 'bins': SYNTH_BINS, 'colors': COLORS[1:],
        'measure': 'Average extra minutes per routed synthetic healthcare trip in each occupied 200 m cell',
        'localTrips': len(local_all), 'localRoutedTrips': len(local), 'localResidents': local_all.uuid_person.nunique(),
        'qualifyingTrips': int((local.delay_min > 1).sum()), 'cityTrips': len(csv),
        'cityRoutedTrips': len(valid), 'cityQualifyingTrips': len(lose),
        'meanExtraMinutes': round(float(local.delay_min.mean()), 3),
        'destination': {'name': 'Sahlgrenska', 'coordinates': [11.9605, 57.6832]},
        'provenance': provenance}
    write(output/'synthpop.geojson', {'type': 'FeatureCollection', 'metadata': metadata,
          'features': features(cells, props)})
    legs = gpd.read_file(source/'output/synthpop_legs.gpkg').to_crs(4326)
    local_ids = gpd.GeoSeries(gpd.points_from_xy(lose.lon, lose.lat), crs=4326).to_crs(3006).within(visible)
    selected = set(np.flatnonzero(local_ids))
    if set(legs.person.unique()) != set(range(len(lose))):
        raise ValueError('Leg person IDs do not match the source CSV filtering order')
    tracks = []
    for (person, walker), rows in legs[legs.person.isin(selected)].groupby(['person', 'walker']):
        rows = rows.sort_values('segment')
        origin = np.array(rows.iloc[0].geometry.coords[0])
        if not np.allclose(origin, lose.loc[person, ['lon', 'lat']].to_numpy(dtype=float), atol=2e-6, rtol=0):
            raise ValueError('Journey origin does not match the corresponding synthetic trip')
        if walker not in ('medium', 'slow') or (rows.travel_time_s <= 0).any() or (rows.start_s < 0).any():
            raise ValueError('Invalid journey timing')
        track = {'id': int(person), 'walker': walker, 'delayMinutes': round(float(lose.loc[person,'delay_min']), 3), 'legs': []}
        last_end = 0
        metric = rows.to_crs(3006)
        for row, projected in zip(rows.itertuples(), metric.geometry):
            if row.start_s < last_end - .01 or row.geometry.geom_type != 'LineString':
                raise ValueError('Overlapping legs or unsupported route geometry')
            coords = np.array(row.geometry.coords)[:, :2]
            xy = np.array(projected.coords)[:, :2]
            if len(coords)<2 or not np.isfinite(coords).all():raise ValueError('Invalid journey coordinates')
            lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))]
            stations = lengths/lengths[-1] if lengths[-1] else np.zeros(len(lengths))
            track['legs'].append({'start': float(row.start_s), 'duration': float(row.travel_time_s),
                'mode': row.mode, 'coordinates': np.round(coords, 6).tolist(), 'stations': np.round(stations, 7).tolist()})
            last_end = float(row.start_s + row.travel_time_s)
        track['finish'] = last_end
        tracks.append(track)
    if len(tracks) != 2*len(selected):
        raise ValueError('Every local qualifying trip must have both walking-speed itineraries')
    write(output/'journeys.json', {'metadata': metadata, 'duration': max((t['finish'] for t in tracks), default=0), 'tracks': tracks})
    write(output/'manifest.json', {'schemaVersion': 1, 'source': provenance,
        'synthetic': metadata, 'slowWalkers': grid_meta, 'assets': ['synthpop.geojson','journeys.json','slow-walkers.geojson','districts.geojson']})
    return {'syntheticTrips': len(local), 'journeys': len(selected), 'heatmapCells': len(cells),
            'routingCells': len(geometries), 'completedDepartures': done}


def bounded_cells(points, values, area, spacing=50, neighbours=4, maximum=150):
    """Interpolate each sample from its nearest valid points, all within the radius.

    Missing points must not take a neighbour slot. The legacy source exporter is
    retained above; local uniform-grid runs use this stricter interpolation.
    """
    if area.is_empty:
        return [], np.empty((0, np.asarray(values).shape[-1]))
    values = np.asarray(values, dtype=float)
    if values.ndim != 2 or values.shape[0] != len(points):
        raise ValueError('Point values do not match the explicit origin order')
    xmin, ymin, xmax, ymax = area.bounds
    xx, yy = np.meshgrid(np.arange(xmin+spacing/2, xmax, spacing),
                         np.arange(ymin+spacing/2, ymax, spacing))
    centres = gpd.GeoSeries(gpd.points_from_xy(xx.ravel(), yy.ravel()), crs=3006)
    centres = centres[centres.within(area)].reset_index(drop=True)
    xy = np.c_[centres.x, centres.y]
    point_xy = np.c_[points.geometry.x, points.geometry.y]
    blended = np.full((len(centres), values.shape[1]), np.nan)
    for column in range(values.shape[1]):
        valid = np.isfinite(values[:, column])
        if not valid.any() or not len(centres):
            continue
        samples = values[valid, column]
        distances, indices = cKDTree(point_xy[valid]).query(xy, k=min(neighbours, len(samples)))
        if distances.ndim == 1:
            distances, indices = distances[:, None], indices[:, None]
        weights = np.where(distances <= maximum, 1/np.maximum(distances, 1)**2, 0)
        denominator = weights.sum(1)
        np.divide((weights*samples[indices]).sum(1), denominator,
                  out=blended[:, column], where=denominator > 0)
    # A cell with no available samples in any view is transparent space.
    keep = np.isfinite(blended).any(1)
    centres, blended = centres[keep], blended[keep]
    half = spacing/2
    cells = [box(p.x-half, p.y-half, p.x+half, p.y+half).intersection(area) for p in centres]
    return cells, blended


def _run_checksums(source, run):
    checksums = run.get('outputSha256') or run.get('source', {}).get('outputSha256', {})
    required = {'origins.gpkg', 'output/delays_by_departure.npz', 'synthetic.csv', 'legs.gpkg'}
    if not required <= set(checksums):
        raise ValueError('Completed run is missing required output checksums')
    for relative, checksum in checksums.items():
        path = Path(relative)
        if path.is_absolute() or '..' in path.parts or not (source/path).is_file():
            raise ValueError('Invalid run output checksum path: '+relative)
        if hashlib.sha256((source/path).read_bytes()).hexdigest() != checksum:
            raise ValueError('Run output checksum mismatch: '+relative)
    return checksums


def _run_districts(source, run):
    data = Path(run.get('dataPath') or run.get('source', {}).get('path') or source)
    if not data.is_absolute():
        data = source/data
    path = data if data.suffix == '.gpkg' else data/'data/regso_goteborg.gpkg'
    if not path.is_file() and (data/'regso_goteborg.gpkg').is_file():
        path = data/'regso_goteborg.gpkg'
    upstream = run.get('source', {}).get('upstreamSha256', {})
    expected = upstream.get('data/regso_goteborg.gpkg')
    if expected and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('RegSO source checksum mismatch')
    districts = gpd.read_file(path).rename(columns={'regsokod': 'district'}).to_crs(3006)
    if ('district' not in districts or districts.district.isna().any() or
            districts.district.duplicated().any() or not districts.geometry.is_valid.all() or
            districts.geometry.is_empty.any() or
            not districts.geometry.geom_type.isin(['Polygon', 'MultiPolygon']).all()):
        raise ValueError('Invalid RegSO geometry or duplicate district IDs')
    districts['district'] = districts.district.astype(str)
    return districts


def _paired_tracks(csv, legs):
    """Return only validated pairs, with one stable trip ID across delay and legs."""
    required = {'trip_id', 'walker', 'segment', 'mode', 'start_s', 'travel_time_s', 'geometry'}
    if not required <= set(legs):
        raise ValueError('New-run leg columns are missing')
    legs = legs.to_crs(4326)
    legs['trip_id'] = legs.trip_id.astype(str)
    if not set(legs.trip_id) <= set(csv.trip_id):
        raise ValueError('Journey trip IDs do not match synthetic trips')
    groups = {str(trip): rows for trip, rows in legs.groupby('trip_id')}
    tracks, failures = [], 0
    for trip in csv.itertuples():
        rows = groups.get(str(trip.trip_id))
        pair = []
        try:
            if rows is None or set(rows.walker) != {'medium', 'slow'}:
                raise ValueError('Missing paired walking-speed itineraries')
            for walker in ('medium', 'slow'):
                selected = rows[rows.walker == walker].sort_values('segment')
                timing = selected[['segment', 'start_s', 'travel_time_s']].to_numpy(dtype=float)
                if (not np.isfinite(timing).all() or (selected.travel_time_s <= 0).any() or
                        (selected.start_s < 0).any() or selected.segment.duplicated().any()):
                    raise ValueError('Invalid journey timing')
                if (not selected.geometry.is_valid.all() or selected.geometry.is_empty.any() or
                        not selected.geometry.geom_type.eq('LineString').all()):
                    raise ValueError('Invalid journey geometry')
                origin = np.array(selected.iloc[0].geometry.coords[0])[:2]
                if not np.allclose(origin, [trip.lon, trip.lat], atol=2e-6, rtol=0):
                    raise ValueError('Journey origin does not match the trip')
                track = {'id': str(trip.trip_id), 'walker': walker,
                         'delayMinutes': round(float(trip.delay_min), 3), 'legs': []}
                last_end = 0
                projected = selected.to_crs(3006)
                for row, metric in zip(selected.itertuples(), projected.geometry):
                    coordinates = np.array(row.geometry.coords)[:, :2]
                    # GTFS shapes are snapped to the line near a stop. Their
                    # endpoints need not equal the stop's walking coordinate.
                    if row.start_s < last_end-.01 or not np.isfinite(coordinates).all():
                        raise ValueError('Overlapping or invalid journey legs')
                    xy = np.array(metric.coords)[:, :2]
                    lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))]
                    if not len(coordinates) >= 2 or lengths[-1] <= 0:
                        raise ValueError('Empty journey leg')
                    stations = lengths/lengths[-1]
                    track['legs'].append({'start': float(row.start_s), 'duration': float(row.travel_time_s),
                        'mode': str(row.mode), 'coordinates': np.round(coordinates, 6).tolist(),
                        'stations': np.round(stations, 7).tolist()})
                    last_end = float(row.start_s+row.travel_time_s)
                expected = float(getattr(trip, walker+'_min'))*60
                if abs(last_end-expected) > 1.5:
                    raise ValueError('Journey finish does not match the routed comparison')
                track['finish'] = last_end
                pair.append(track)
            if abs((pair[1]['finish']-pair[0]['finish'])/60-trip.delay_min) > .025:
                raise ValueError('Paired journey delay does not match the routed comparison')
            tracks.extend(pair)
        except (ValueError, TypeError, AttributeError, IndexError):
            failures += 1
    return tracks, failures


def prepare_run(source: Path, output: Path, manifest: dict):
    """Import a complete local rerouting run without mixing the legacy averages."""
    source, output = Path(source), Path(output)
    run = json.loads((source/'run.json').read_text())
    if (run.get('schemaVersion') != 2 or run.get('completedDepartures') != 8 or
            run.get('plannedDepartures') != 8 or run.get('routingDate') != '2026-09-22'):
        raise ValueError('The local run must complete all eight planned timetable departures')
    if run.get('source', {}).get('commit') != SOURCE_COMMIT:
        raise ValueError('Local routing must use the pinned upstream workflow')
    if (run.get('originSpacingMetres') != 100 or run.get('displaySpacingMetres') != 50 or
            run.get('interpolation') != {'neighbours': 4, 'maximumMetres': 150}):
        raise ValueError('Unexpected uniform-grid resolution or interpolation recipe')
    checksums = _run_checksums(source, run)
    if run.get('recipe'):
        prepared_area = footprint({'recipe': run['recipe'], 'bounds': manifest.get('bounds', [])})
        if prepared_area.symmetric_difference(footprint(manifest)).area > .01:
            raise ValueError('Routing footprint does not match the calibrated table')
    visible = footprint(manifest)
    districts = _run_districts(source, run)
    points = gpd.read_file(source/'origins.gpkg')
    if (points.crs is None or points.crs.to_epsg() != 3006 or not {'id', 'district'} <= set(points) or
            not np.array_equal(points.id, np.arange(len(points))) or not len(points) or
            not points.geometry.geom_type.eq('Point').all() or not points.geometry.is_valid.all() or
            points.geometry.is_empty.any() or not points.geometry.within(visible).all()):
        raise ValueError('Invalid explicit origin CRS, IDs, geometry or table footprint')
    xy = np.c_[points.geometry.x, points.geometry.y]
    if (not np.isfinite(xy).all() or len(np.unique(xy, axis=0)) != len(points) or
            not np.allclose((xy-xy[0])/100, np.round((xy-xy[0])/100), atol=1e-6)):
        raise ValueError('Origins do not lie on a unique 100 m routing grid')
    points['district'] = points.district.fillna('').astype(str)
    district_index = districts.set_index('district')
    for row in points.itertuples():
        if not row.district:
            continue
        if row.district not in district_index.index or not district_index.loc[row.district].geometry.buffer(.01).covers(row.geometry):
            raise ValueError('Origin district ID does not match its RegSO geometry')
    with np.load(source/'output/delays_by_departure.npz', allow_pickle=False) as data:
        done, departures = int(data['done']), [str(t) for t in data['departures']]
        if done != 8 or departures != NEW_DEPARTURES or not np.array_equal(data['point_id'], points.id):
            raise ValueError('Completed departures or explicit routing-point order are inconsistent')
        trips, missed, delay = [data[key].copy() for key in ('trips', 'missed', 'missed_delay')]
    if (any(a.shape != (8, len(points)) or not np.isfinite(a).all() or (a < 0).any()
            for a in (trips, missed, delay)) or (missed > trips).any() or
            ((missed == 0) & (delay != 0)).any() or
            not np.array_equal(trips, np.floor(trips)) or not np.array_equal(missed, np.floor(missed))):
        raise ValueError('Invalid local routing totals')
    # Aggregate numerators and denominators before spatial interpolation.
    combined = point_values(trips.sum(0), missed.sum(0), delay.sum(0))
    values = np.column_stack([combined, point_values(trips, missed, delay).T])
    cells, blended = bounded_cells(points, values, visible)
    grid_properties = [{'grid': 'uniform', 'values': finite_values(row)} for row in blended]
    district_geometries, district_properties = [], []
    for row in districts.itertuples():
        clipped = row.geometry.intersection(visible)
        if clipped.is_empty:
            continue
        selection = points.district.to_numpy() == str(row.district)
        t, m, d = [a[:, selection].sum(1) for a in (trips, missed, delay)]
        average = np.r_[point_values(np.array([t.sum()]), np.array([m.sum()]), np.array([d.sum()])),
                        point_values(t, m, d)]
        district_geometries.append(clipped)
        district_properties.append({'id': str(row.district), 'name': str(getattr(row, 'regsonamn', row.district)),
            'values': finite_values(average), 'origins': int(selection.sum())})
    provenance = {'repository': SOURCE_URL, 'commit': run.get('source', {}).get('commit', SOURCE_COMMIT),
        'syntheticPopulation': 'https://zenodo.org/records/10801936',
        'speedsKmh': {'medium': 4.8, 'slow': 4.235},
        'upstreamSha256': run.get('source', {}).get('upstreamSha256', {}),
        'outputSha256': checksums, 'dependencies': run.get('dependencies', {}),
        'routingDate': run['routingDate'],
        'recipe': {**{k: run.get('recipe', {}).get(k) for k in ('sourceBounds', 'sourceCrs')},
                   'originSpacingMetres': 100, 'displaySpacingMetres': 50,
                   'interpolation': {'neighbours': 4, 'maximumMetres': 150}},
        'pointOrder': {'idField': 'id', 'originCount': len(points), 'crs': 'EPSG:3006',
                       'sha256': checksums['origins.gpkg']}}
    if run.get('fingerprint'):
        provenance['runFingerprint'] = run['fingerprint']
    grid_meta = {'schemaVersion': 2, 'title': 'Time Lost by Slow Walkers', 'departures': departures,
        'completedDepartures': 8, 'plannedDepartures': 8, 'routingDate': run['routingDate'],
        'bins': [0, 5, 10, 15, 20, 25, 30], 'colors': COLORS, 'legendMode': 'continuous',
        'originSpacingMetres': 100, 'displaySpacingMetres': 50,
        'interpolation': {'neighbours': 4, 'maximumMetres': 150},
        'routingOrigins': len(points), 'routedOriginSamples': int((trips > 0).sum()),
        'missingOriginSamples': int((trips <= 0).sum()),
        'completeness': {'completedDepartures': 8, 'plannedDepartures': 8,
                         'routedOriginSamples': int((trips > 0).sum()), 'plannedOriginSamples': 8*len(points)},
        'measure': 'Average extra minutes on modelled trips classified as missed connections',
        'explanation': 'Walking at 4.235 instead of 4.8 km/h can mean missing a bus or tram. Colour shows average extra minutes for the modelled trips classified as missed connections.',
        'sampling': '8 morning departures · 06:25–09:30',
        'districtScope': 'Origins within the table area',
        'note': 'Morning timetable samples for 22 September 2026, not live transport or an all-day result. Routing origins are 100 m apart within the table. Smooth 50 m colour cells use up to four valid samples within 150 m; they do not add routing coverage.',
        'provenance': provenance}
    write(output/'slow-walkers.geojson', {'type': 'FeatureCollection', 'metadata': grid_meta,
                                        'features': features(cells, grid_properties)})
    write(output/'districts.geojson', {'type': 'FeatureCollection', 'metadata': {'districtScope': grid_meta['districtScope']},
                                     'features': features(district_geometries, district_properties)})

    csv = pd.read_csv(source/'synthetic.csv', dtype={'trip_id': str, 'resident_id': str})
    required = {'trip_id', 'resident_id', 'lon', 'lat', 'age', 'hour', 'minute', 'medium_min', 'slow_min', 'delay_min', 'route_status'}
    if not required <= set(csv) or csv.trip_id.isna().any() or csv.trip_id.duplicated().any() or csv.resident_id.isna().any():
        raise ValueError('Missing synthetic trip columns or invalid stable IDs')
    numeric = csv[['lon', 'lat', 'age', 'hour', 'minute']].to_numpy(dtype=float)
    if (not np.isfinite(numeric).all() or (csv.age < 75).any() or (csv.hour < 7).any() or
            (csv.hour > 15).any() or (csv.minute < 0).any() or (csv.minute >= 60).any() or
            (csv[['hour', 'minute']] != np.floor(csv[['hour', 'minute']])).any().any()):
        raise ValueError('Invalid local synthetic population or departure time')
    local_all = gpd.GeoDataFrame(csv, geometry=gpd.points_from_xy(csv.lon, csv.lat), crs=4326).to_crs(3006)
    if not local_all.geometry.within(visible).all():
        raise ValueError('Synthetic run contains origins outside the calibrated table')
    finite = np.isfinite(csv[['medium_min', 'slow_min', 'delay_min']]).all(axis=1)
    local = local_all[finite].copy()
    if ((local[['medium_min', 'slow_min']] < 0).any().any() or
            not np.allclose(local.slow_min-local.medium_min, local.delay_min, atol=.025, rtol=0)):
        raise ValueError('Invalid paired synthetic travel-time comparison')
    local['cell_x'] = np.floor(local.geometry.x/200).astype(int)
    local['cell_y'] = np.floor(local.geometry.y/200).astype(int)
    synth_cells, synth_properties = [], []
    for (x, y), rows in local.groupby(['cell_x', 'cell_y']):
        synth_cells.append(box(x*200, y*200, (x+1)*200, (y+1)*200).intersection(visible))
        synth_properties.append({'delay': round(float(rows.delay_min.mean()), 3), 'trips': len(rows),
                                 'residents': rows.resident_id.nunique()})
    qualifying = local[local.delay_min > 1]
    legs = gpd.read_file(source/'legs.gpkg')
    # Exporters may keep nonqualifying legs; select the qualifying cohort by ID.
    if 'trip_id' in legs:
        all_leg_ids = set(legs.trip_id.astype(str))
        if not all_leg_ids <= set(csv.trip_id):
            raise ValueError('Unknown synthetic trip ID in journey legs')
        legs = legs[legs.trip_id.astype(str).isin(qualifying.trip_id)].copy()
    tracks, failed_journeys = _paired_tracks(qualifying, legs)
    departures_synth = sorted({f'{int(row.hour):02}:{int(row.minute):02}' for row in csv.itertuples()})
    metadata = {'schemaVersion': 2, 'title': 'Synth Pop Heatmap', 'bins': SYNTH_BINS, 'colors': COLORS[1:],
        'displaySpacingMetres': 200, 'routingDate': run['routingDate'], 'departures': departures_synth,
        'sampling': ('Healthcare departures · '+departures_synth[0]+'–'+departures_synth[-1]) if departures_synth else 'No healthcare departures',
        'measure': 'Average extra minutes per routed synthetic healthcare trip in each occupied 200 m cell',
        'explanation': 'Synthetic residents aged 75+ travel from home to Sahlgrenska. Colour shows average extra travel minutes when walking at 4.235 instead of 4.8 km/h.',
        'note': 'Modelled healthcare trips for 22 September 2026, not tracked people. The original local departures are kept from 07:00–15:00. Each occupied 200 m cell averages all its complete routed comparisons; empty cells have no sampled homes.',
        'localTrips': len(local_all), 'localRoutedTrips': len(local), 'localResidents': int(local_all.resident_id.nunique()),
        'localRoutedResidents': int(local.resident_id.nunique()), 'qualifyingTrips': len(qualifying),
        'journeyTrips': len(tracks)//2, 'failedRoutingPairs': len(local_all)-len(local),
        'failedJourneyPairs': failed_journeys, 'failedPairs': len(local_all)-len(local)+failed_journeys,
        'meanExtraMinutes': round(float(local.delay_min.mean()), 3) if len(local) else None,
        'destination': {'name': 'Sahlgrenska', 'coordinates': [11.9605, 57.6832]}, 'provenance': provenance}
    write(output/'synthpop.geojson', {'type': 'FeatureCollection', 'metadata': metadata,
                                    'features': features(synth_cells, synth_properties)})
    write(output/'journeys.json', {'metadata': metadata, 'duration': max((t['finish'] for t in tracks), default=0), 'tracks': tracks})
    write(output/'manifest.json', {'schemaVersion': 2, 'source': provenance, 'synthetic': metadata,
        'slowWalkers': grid_meta, 'assets': ['synthpop.geojson', 'journeys.json', 'slow-walkers.geojson', 'districts.geojson']})
    return {'syntheticTrips': len(local), 'journeys': len(tracks)//2, 'heatmapCells': len(synth_cells),
            'routingCells': len(cells), 'routingOrigins': len(points), 'completedDepartures': 8,
            'failedPairs': metadata['failedPairs']}


if __name__=='__main__':
    import argparse
    from . import locations as loc
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download',action='store_true')
    parser.add_argument('--source',type=Path,default=loc.HOME/'cache/mobility'/SOURCE_COMMIT)
    args=parser.parse_args()
    if not args.download:parser.error('Use --download; prepare assets with python -m studio.exhibit')
    print(download(args.source))
