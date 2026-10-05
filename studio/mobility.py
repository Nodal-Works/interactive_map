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
COLORS = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026']
SYNTH_BINS = [0, .5, 1, 2, 5, 10]

def download(source):
    """Fetch only the pinned research inputs; never run routing or execute code."""
    import urllib.request
    expected=json.loads((Path(__file__).resolve().parents[1]/'media/universeum/mobility/manifest.json').read_text())['source']['sha256']
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
    write(output/'journeys.json', {'metadata': metadata, 'duration': max(t['finish'] for t in tracks), 'tracks': tracks})
    write(output/'manifest.json', {'schemaVersion': 1, 'source': provenance,
        'synthetic': metadata, 'slowWalkers': grid_meta, 'assets': ['synthpop.geojson','journeys.json','slow-walkers.geojson','districts.geojson']})
    return {'syntheticTrips': len(local), 'journeys': len(selected), 'heatmapCells': len(cells),
            'routingCells': len(geometries), 'completedDepartures': done}


if __name__=='__main__':
    import argparse
    from . import locations as loc
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download',action='store_true')
    parser.add_argument('--source',type=Path,default=loc.HOME/'cache/mobility'/SOURCE_COMMIT)
    args=parser.parse_args()
    if not args.download:parser.error('Use --download; prepare assets with python -m studio.exhibit')
    print(download(args.source))
