"""
Process DEM to calculate stormwater flow direction and accumulation.
Rasterizes building footprints as barriers, writes a three-band browser GeoTIFF,
and computes D8 flow direction and accumulation. Water at/below 0 m is an outlet.
Run from any directory; defaults resolve relative to this repository.
"""

import argparse
from collections import deque
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import xy as rio_xy
from rasterio.warp import transform_geom

# Same D8 order as the browser, including deterministic ties.
NEIGHBORS = [(-1, 1, 128), (0, 1, 1), (1, 1, 2), (1, 0, 4),
             (1, -1, 8), (0, -1, 16), (-1, -1, 32), (-1, 0, 64)]
OFFSETS = {code: (dr, dc) for dr, dc, code in NEIGHBORS}


def resolve_dem_crs(crs):
    # The original campus TIFF names SWEREF99 TM but omits its EPSG code.
    if crs and crs.to_epsg():
        return crs
    if crs and 'SWEREF99 TM' in crs.to_wkt():
        return rasterio.crs.CRS.from_epsg(3006)
    raise ValueError('DEM needs a recognized CRS to align building footprints')


def rasterize_buildings(footprints, shape, transform, crs):
    source_crs = footprints.get('crs', {}).get('properties', {}).get('name', 'EPSG:4326')
    geometries = [transform_geom(source_crs, crs, feature['geometry'])
                  for feature in footprints['features']
                  if feature.get('geometry', {}).get('type') in ('Polygon', 'MultiPolygon')]
    if not geometries:
        return np.zeros(shape, dtype=bool)
    # Preserve polygon holes and every component of MultiPolygons.
    return rasterize([(g, 1) for g in geometries], out_shape=shape,
                     transform=transform, fill=0, dtype='uint8').astype(bool)


def calculate_flow_direction_d8(dem, building_mask=None, water_mask=None, cell_size=(1, 1)):
    """Route strictly downhill, excluding buildings and stopping in water bodies."""
    rows, cols = dem.shape
    buildings = np.zeros(dem.shape, dtype=bool) if building_mask is None else building_mask
    water = np.zeros(dem.shape, dtype=bool) if water_mask is None else water_mask
    valid = np.isfinite(dem) & ~buildings
    flow_dir = np.zeros(dem.shape, dtype=np.uint8)
    for i, j in zip(*np.nonzero(valid & ~water)):
        max_slope = 0.0
        for dr, dc, code in NEIGHBORS:
            ni, nj = i + dr, j + dc
            if not (0 <= ni < rows and 0 <= nj < cols and valid[ni, nj]):
                continue
            # A diagonal must not cut across a building corner.
            if dr and dc and (buildings[i, nj] or buildings[ni, j]):
                continue
            distance = np.hypot(dr * cell_size[1], dc * cell_size[0])
            slope = (dem[i, j] - dem[ni, nj]) / distance
            if slope > max_slope:
                max_slope = slope
                flow_dir[i, j] = code
    return flow_dir


def calculate_flow_accumulation(flow_dir, valid_mask=None):
    """Count each upstream cell once, processing the drainage graph in order."""
    rows, cols = flow_dir.shape
    valid = np.ones(flow_dir.shape, dtype=bool) if valid_mask is None else valid_mask
    flow_acc = valid.astype(np.float32)
    incoming = np.zeros(flow_dir.shape, dtype=np.uint8)
    downstream = {}
    for i, j in zip(*np.nonzero(valid & (flow_dir != 0))):
        dr, dc = OFFSETS[int(flow_dir[i, j])]
        ni, nj = i + dr, j + dc
        if 0 <= ni < rows and 0 <= nj < cols and valid[ni, nj]:
            downstream[i, j] = (ni, nj)
            incoming[ni, nj] += 1
    queue = deque(zip(*np.nonzero(valid & (incoming == 0))))
    processed = 0
    while queue:
        cell = queue.popleft()
        processed += 1
        target = downstream.get(cell)
        if target is not None:
            flow_acc[target] += flow_acc[cell]
            incoming[target] -= 1
            if incoming[target] == 0:
                queue.append(target)
    if processed != np.count_nonzero(valid):
        raise ValueError('Flow direction contains a cycle')
    return flow_acc

def extract_flow_vectors(flow_dir, flow_acc, transform, dem_shape, threshold=10):
    """
    Extract flow vectors for visualization.
    Returns a list of flow lines with weights based on accumulation.
    """
    rows, cols = flow_dir.shape
    
    # Direction code to offset mapping
    dir_to_offset = {
        128: (-1, 1),   # NE
        1: (0, 1),      # E
        2: (1, 1),      # SE
        4: (1, 0),      # S
        8: (1, -1),     # SW
        16: (0, -1),    # W
        32: (-1, -1),   # NW
        64: (-1, 0)     # N
    }
    
    flow_lines = []
    
    # Only extract cells with significant flow accumulation
    for i in range(rows):
        for j in range(cols):
            if flow_dir[i, j] == 0 or flow_acc[i, j] < threshold:
                continue
            
            # Convert pixel coordinates to geographic coordinates
            x, y = rio_xy(transform, i, j)
            
            # Get flow direction
            if flow_dir[i, j] in dir_to_offset:
                dr, dc = dir_to_offset[flow_dir[i, j]]
                ni, nj = i + dr, j + dc
                
                if 0 <= ni < rows and 0 <= nj < cols:
                    nx, ny = rio_xy(transform, ni, nj)
                    
                    # Create flow vector
                    flow_lines.append({
                        'from': [x, y],
                        'to': [nx, ny],
                        'accumulation': float(flow_acc[i, j]),
                        'direction': int(flow_dir[i, j])
                    })
    
    return flow_lines

def create_flow_start_points(flow_acc, transform, spacing=5, min_accumulation=1):
    """
    Create starting points for particle animation.
    These are distributed across the DEM with density based on flow accumulation.
    """
    rows, cols = flow_acc.shape
    start_points = []
    
    # Sample points on a grid
    for i in range(0, rows, spacing):
        for j in range(0, cols, spacing):
            if flow_acc[i, j] >= min_accumulation and not np.isnan(flow_acc[i, j]):
                x, y = rio_xy(transform, i, j)
                
                # Add point with weight based on flow accumulation
                start_points.append({
                    'position': [x, y],
                    'weight': float(flow_acc[i, j])
                })
    
    return start_points

def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dem', type=Path, default=root / 'media/clipped_dem.geotiff.tif')
    parser.add_argument('--buildings', type=Path, default=root / 'media/building-footprints.geojson')
    parser.add_argument('--output', type=Path, default=root / 'media')
    parser.add_argument('--dem-crs', default='EPSG:3006', help='CRS for legacy Lindholmen rasters without CRS tags')
    parser.add_argument('--water-mask', type=Path, default=root / 'media/water_mask.tif', help='Optional water raster aligned to the source terrain')
    parser.add_argument('--browser-only', action='store_true', help='Only write the browser GeoTIFF')
    args = parser.parse_args()

    with rasterio.open(args.dem) as src:
        dem = src.read(1, masked=True).astype(np.float32).filled(np.nan)
        transform, bounds, profile = src.transform, src.bounds, src.profile
        crs = resolve_dem_crs(src.crs or rasterio.crs.CRS.from_string(args.dem_crs))
    if not np.isfinite(dem).any():
        raise ValueError('DEM contains no valid elevations')
    with args.buildings.open() as handle:
        footprints = json.load(handle)
    buildings = rasterize_buildings(footprints, dem.shape, transform, crs) & np.isfinite(dem)
    water = np.isfinite(dem) & (dem <= 0) & ~buildings
    if args.water_mask.exists():
        with rasterio.open(args.water_mask) as mask:
            if mask.shape != dem.shape or mask.transform != transform or resolve_dem_crs(mask.crs or rasterio.crs.CRS.from_string(args.dem_crs)) != crs:
                raise ValueError('Water mask must use the same grid and CRS as the terrain')
            water = (mask.read(1, masked=True).filled(0) > 0) & np.isfinite(dem) & ~buildings
    # Adapted from lindholmen's generate_assets.py. Keep the source terrain intact
    # for other layers and store an explicit mask rather than guessing from height.
    processed_dem = dem.copy()
    processed_dem[buildings] = float(np.nanmax(dem)) + 10.0
    args.output.mkdir(parents=True, exist_ok=True)
    profile.update(crs=crs, dtype='float32', count=3, nodata=np.nan, compress='deflate')
    browser_path = args.output / 'stormwater_dem.tif'
    with rasterio.open(browser_path, 'w', **profile) as dst:
        dst.write(processed_dem, 1)
        dst.write(buildings.astype(np.float32), 2)
        dst.write(water.astype(np.float32), 3)
        dst.set_band_description(3, "Water outlets from local mask")
        dst.set_band_description(1, 'Terrain with building barriers')
        dst.set_band_description(2, 'Building mask (1 = building, 0 = terrain)')
    print(f'Saved {browser_path}: {np.count_nonzero(buildings)} building cells')
    if args.browser_only:
        return

    flow_dir = calculate_flow_direction_d8(processed_dem, buildings, water,
                                           (abs(transform.a), abs(transform.e)))
    valid = np.isfinite(dem) & ~buildings
    flow_acc = calculate_flow_accumulation(flow_dir, valid)
    profile.update(count=1, dtype='uint8', nodata=None)
    with rasterio.open(args.output / 'flow_direction.tif', 'w', **profile) as dst:
        dst.write(flow_dir, 1)
    profile.update(dtype='float32', nodata=np.nan)
    with rasterio.open(args.output / 'flow_accumulation.tif', 'w', **profile) as dst:
        dst.write(np.where(valid, flow_acc, np.nan), 1)
    flow_lines = extract_flow_vectors(flow_dir, flow_acc, transform, dem.shape, threshold=10)
    start_points = create_flow_start_points(np.where(water, 0, flow_acc), transform, spacing=5)
    # Sample over the entire extent instead of truncating the north of the map.
    def sample(items, limit):
        return items if len(items) <= limit else [items[int(i * len(items) / limit)] for i in range(limit)]
    flow_data = {
        'bounds': dict(west=bounds.left, south=bounds.bottom, east=bounds.right, north=bounds.top),
        'crs': {'epsg': crs.to_epsg(), 'wkt': crs.to_wkt()},
        'transform': {key: getattr(transform, key) for key in 'abcdef'},
        'shape': {'rows': dem.shape[0], 'cols': dem.shape[1]},
        'elevation': {'min': float(np.nanmin(dem)), 'max': float(np.nanmax(dem))},
        'building_cells': int(np.count_nonzero(buildings)),
        'flow_lines': sample(flow_lines, 50000),
        'start_points': sample(start_points, 5000),
    }
    with (args.output / 'flow_data.json').open('w') as handle:
        json.dump(flow_data, handle, allow_nan=False)
    print(f'Max accumulation: {np.max(flow_acc):.0f}; {len(flow_lines)} flow lines; {len(start_points)} start points')


if __name__ == '__main__':
    main()
