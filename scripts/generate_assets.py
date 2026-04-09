#!/usr/bin/env python3
"""
Generate all map assets for a given bounding box using the DTCC Platform.

This script downloads and processes geospatial data for any area in Sweden,
producing all the assets required by the interactive map visualisation:
  - building-footprints.geojson  (WGS84)
  - street-network.geojson       (WGS84)
  - clipped_dem.geotiff.tif      (GeoTIFF, SWEREF99 TM)
  - mesh.stl                     (LOD1 city mesh)

Usage:
  # With WGS84 bounding box (west, south, east, north):
  python scripts/generate_assets.py --bbox 11.936224 57.677523 12.018278 57.699659

  # With SWEREF99 TM bounding box (xmin, ymin, xmax, ymax):
  python scripts/generate_assets.py --bbox-sweref 319891 6399790 321891 6401790

  # With a named location (uses geocoding):
  python scripts/generate_assets.py --location "Lindholmen, Göteborg" --size 2000

  # Override output directory:
  python scripts/generate_assets.py --bbox 11.93 57.67 12.02 57.70 --output media

  # Skip specific assets:
  python scripts/generate_assets.py --bbox 11.93 57.67 12.02 57.70 --skip mesh

  # Update map_config.json with new bounds:
  python scripts/generate_assets.py --bbox 11.93 57.67 12.02 57.70 --update-config
"""

import argparse
import json
import sys
import time
from pathlib import Path

import dtcc
import numpy as np
from pyproj import Transformer
from scipy import ndimage

# CRS transformers
TO_SWEREF = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
TO_WGS84 = Transformer.from_crs("EPSG:3006", "EPSG:4326", always_xy=True)


def wgs84_to_sweref(west, south, east, north):
    """Convert a WGS84 bounding box to SWEREF99 TM."""
    xmin, ymin = TO_SWEREF.transform(west, south)
    xmax, ymax = TO_SWEREF.transform(east, north)
    return xmin, ymin, xmax, ymax


def sweref_to_wgs84(xmin, ymin, xmax, ymax):
    """Convert a SWEREF99 TM bounding box to WGS84."""
    west, south = TO_WGS84.transform(xmin, ymin)
    east, north = TO_WGS84.transform(xmax, ymax)
    return west, south, east, north


def log(msg):
    print(f"[generate_assets] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Asset generators
# ---------------------------------------------------------------------------

def generate_footprints(bounds, output_dir, wgs84_bbox):
    """Download building footprints and save as WGS84 GeoJSON."""
    log("Downloading building footprints...")
    buildings = dtcc.download_footprints(bounds=bounds)
    log(f"  Downloaded {len(buildings)} buildings")

    # Convert to GeoDataFrame via a temporary City, then reproject to WGS84
    city = dtcc.City()
    city.add_buildings(buildings)

    # Save in native CRS first
    tmp_path = output_dir / "_footprints_sweref.geojson"
    dtcc.save_footprints(city, str(tmp_path))

    # Reproject to WGS84
    try:
        import geopandas as gpd
        gdf = gpd.read_file(str(tmp_path))
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:3006")
        gdf = gdf.to_crs("EPSG:4326")
        out_path = output_dir / "building-footprints.geojson"
        gdf.to_file(str(out_path), driver="GeoJSON")
        tmp_path.unlink(missing_ok=True)
        log(f"  Saved {out_path} ({len(gdf)} features, WGS84)")
    except ImportError:
        # Fallback: keep in native CRS
        out_path = output_dir / "building-footprints.geojson"
        tmp_path.rename(out_path)
        log(f"  Saved {out_path} (geopandas not available, CRS may be SWEREF99)")

    return buildings


def generate_road_network(bounds, output_dir):
    """Download road network from OSM and save as WGS84 GeoJSON."""
    log("Downloading road network from OSM...")
    roadnetwork = dtcc.download_roadnetwork(bounds=bounds, provider="OSM")
    log(f"  Downloaded road network: {len(roadnetwork.edges)} edges, "
        f"{len(roadnetwork.vertices)} vertices")

    try:
        import geopandas as gpd
        # to_df can accept a CRS string
        gdf = roadnetwork.to_df(crs="EPSG:3006")
        gdf = gdf.to_crs("EPSG:4326")
        out_path = output_dir / "street-network.geojson"
        gdf.to_file(str(out_path), driver="GeoJSON")
        log(f"  Saved {out_path} ({len(gdf)} road segments, WGS84)")
    except ImportError:
        # Manual fallback: convert vertices/edges to GeoJSON
        log("  geopandas not available, building GeoJSON manually...")
        out_path = output_dir / "street-network.geojson"
        _roadnetwork_to_geojson(roadnetwork, out_path)
        log(f"  Saved {out_path}")

    return roadnetwork


def _roadnetwork_to_geojson(roadnetwork, out_path):
    """Manually convert a DTCC RoadNetwork to GeoJSON (WGS84)."""
    features = []
    verts = roadnetwork.vertices  # shape [n, 2] or [n, 3]
    edges = roadnetwork.edges  # shape [m, 2]

    for i, (start_idx, end_idx) in enumerate(edges):
        start = verts[start_idx]
        end = verts[end_idx]
        # Convert from SWEREF99 to WGS84
        lon1, lat1 = TO_WGS84.transform(start[0], start[1])
        lon2, lat2 = TO_WGS84.transform(end[0], end[1])
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[lon1, lat1], [lon2, lat2]],
            },
            "properties": {
                "id": int(i),
                "length": float(roadnetwork.length[i]) if i < len(roadnetwork.length) else None,
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}
    with open(out_path, "w") as f:
        json.dump(geojson, f)


def generate_dem(bounds, output_dir, pointcloud=None):
    """Build a terrain raster (DEM) from LiDAR data and save as GeoTIFF."""
    if pointcloud is None:
        log("Downloading point cloud for DEM...")
        pointcloud = dtcc.download_pointcloud(bounds=bounds)
        log(f"  Downloaded {len(pointcloud.points)} points")

    log("Removing outliers from point cloud...")
    pointcloud = pointcloud.remove_global_outliers(3.0)

    log("Building terrain raster (DEM)...")
    raster = dtcc.build_terrain_raster(
        pointcloud, cell_size=2, radius=3, ground_only=True
    )

    out_path = output_dir / "clipped_dem.geotiff.tif"
    dtcc.save_raster(raster, str(out_path))
    log(f"  Saved {out_path} ({raster.width}x{raster.height}, "
        f"cell_size={raster.cell_size})")

    return pointcloud, raster


def generate_mesh(bounds, output_dir, buildings=None, pointcloud=None, raster=None):
    """Build a LOD1 city mesh and save as STL."""
    if pointcloud is None:
        log("Downloading point cloud for mesh...")
        pointcloud = dtcc.download_pointcloud(bounds=bounds)
        pointcloud = pointcloud.remove_global_outliers(3.0)

    if buildings is None:
        log("Downloading footprints for mesh...")
        buildings = dtcc.download_footprints(bounds=bounds)

    if raster is None:
        log("Building terrain raster for mesh...")
        raster = dtcc.build_terrain_raster(
            pointcloud, cell_size=2, radius=3, ground_only=True
        )

    log("Extracting roof points and computing building heights...")
    buildings = dtcc.extract_roof_points(buildings, pointcloud)
    buildings = dtcc.compute_building_heights(buildings, raster, overwrite=True)

    log("Creating city model...")
    city = dtcc.City()
    city.add_terrain(raster)
    city.add_buildings(buildings, remove_outside_terrain=True)

    log("Building LOD1 city mesh...")
    mesh = dtcc.build_city_mesh(city, lod=dtcc.GeometryType.LOD1)

    out_path = output_dir / "mesh.stl"
    dtcc.save_mesh(mesh, str(out_path))
    log(f"  Saved {out_path}")

    # Also save as GLB for potential web use
    glb_path = output_dir / "mesh.glb"
    try:
        dtcc.save_mesh(mesh, str(glb_path))
        log(f"  Saved {glb_path}")
    except Exception as e:
        log(f"  Could not save GLB: {e}")

    return mesh


def generate_trees(bounds, output_dir, pointcloud=None, raster=None):
    """Detect trees from LiDAR and save as WGS84 Point GeoJSON.

    Uses dtcc.tree_raster_from_pointcloud to build a canopy height raster,
    then finds local maxima to extract individual tree positions with heights.
    """
    if pointcloud is None:
        log("Downloading point cloud for tree detection...")
        pointcloud = dtcc.download_pointcloud(bounds=bounds)
        pointcloud = pointcloud.remove_global_outliers(3.0)

    log("Building tree height raster from point cloud...")
    tree_raster = dtcc.tree_raster_from_pointcloud(
        pointcloud,
        terrain_raster=raster,
        cell_size=0.5,
        shortest_tree=2.0,
        smallest_cluster=100,
        fill_hole_size=100,
        sigma=1.0,
    )
    log(f"  Tree raster: {tree_raster.width}x{tree_raster.height}, "
        f"cell_size={tree_raster.cell_size}")

    # Find local maxima in the tree height raster to identify individual trees.
    # Each local maximum represents one tree crown peak.
    data = tree_raster.data
    if data.ndim == 3:
        data = data[:, :, 0]

    # Use a neighbourhood roughly matching a tree crown (~5m radius → 10m diameter)
    crown_cells = max(3, int(5.0 / tree_raster.cell_size))
    neighbourhood_size = 2 * crown_cells + 1

    # Dilate (max filter) and compare to find local maxima
    local_max_val = ndimage.maximum_filter(data, size=neighbourhood_size)
    is_peak = (data == local_max_val) & (data > 0)

    peak_rows, peak_cols = np.where(is_peak)
    log(f"  Detected {len(peak_rows)} tree peaks")

    # Convert raster pixel coords → SWEREF99 → WGS84 point features
    georef = tree_raster.georef  # Affine transform
    features = []
    for i, (row, col) in enumerate(zip(peak_rows, peak_cols)):
        height = float(data[row, col])
        # Affine: x = georef.c + col * georef.a + row * georef.b
        #         y = georef.f + col * georef.d + row * georef.e
        x = georef.c + col * georef.a + row * georef.b
        y = georef.f + col * georef.d + row * georef.e
        lng, lat = TO_WGS84.transform(x, y)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "id": int(i),
                "height": round(height, 1),
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}
    out_path = output_dir / "trees.geojson"
    with open(out_path, "w") as f:
        json.dump(geojson, f)

    log(f"  Saved {out_path} ({len(features)} trees, WGS84)")
    return tree_raster


def update_map_config(config_path, wgs84_bbox):
    """Update map_config.json with the new bounding box and center."""
    west, south, east, north = wgs84_bbox
    center_lng = (west + east) / 2
    center_lat = (south + north) / 2

    with open(config_path) as f:
        config = json.load(f)

    config["calibration"]["center"]["lng"] = center_lng
    config["calibration"]["center"]["lat"] = center_lat
    config["table"]["boundingBox"] = [west, south, east, north]

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    log(f"Updated {config_path}")
    log(f"  Center: ({center_lng:.6f}, {center_lat:.6f})")
    log(f"  Bounding box: [{west}, {south}, {east}, {north}]")


def update_slideshow_config(output_dir):
    """Update slideshow-config.json GeoJSON slide legends with actual feature counts."""
    slideshow_dir = output_dir / "slideshow"
    config_path = slideshow_dir / "slideshow-config.json"
    if not config_path.exists():
        log("  Slideshow config not found, skipping legend update")
        return

    with open(config_path) as f:
        config = json.load(f)

    for slide in config.get("slides", []):
        if slide.get("type") != "geojson" or "media" not in slide:
            continue

        # Resolve the media path the same way the app does
        media_path = slide["media"]
        if "/" not in media_path:
            geojson_path = slideshow_dir / media_path
        else:
            geojson_path = output_dir.parent / media_path

        if not geojson_path.exists():
            continue

        with open(geojson_path) as f:
            geojson = json.load(f)

        features = geojson.get("features", [])
        style = slide.get("metadata", {}).get("style", {})
        color_prop = style.get("colorProperty")

        if not color_prop:
            continue

        # Count features per category
        counts = {}
        for feat in features:
            val = feat.get("properties", {}).get(color_prop, "Unknown")
            counts[val] = counts.get(val, 0) + 1

        # Rebuild legend items from color map and actual counts
        color_map = style.get("colorMap", {})
        legend_items = []
        for category, count in sorted(counts.items(), key=lambda x: -x[1]):
            color = color_map.get(category, "#888888")
            label_suffix = "segment" if count == 1 else "segments"
            if "building" in config_path.stem or "footprint" in slide["media"].lower():
                label_suffix = "building" if count == 1 else "buildings"
            legend_items.append({
                "color": color,
                "label": f"{category} ({count} {label_suffix})",
            })

        if legend_items:
            slide.setdefault("metadata", {}).setdefault("legend", {})["items"] = legend_items

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    log("  Updated slideshow legend counts")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate interactive map assets from DTCC Platform data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    bbox_group = parser.add_mutually_exclusive_group(required=True)
    bbox_group.add_argument(
        "--bbox", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        help="WGS84 bounding box (lon/lat): west south east north",
    )
    bbox_group.add_argument(
        "--bbox-sweref", nargs=4, type=float, metavar=("XMIN", "YMIN", "XMAX", "YMAX"),
        help="SWEREF99 TM bounding box: xmin ymin xmax ymax",
    )
    bbox_group.add_argument(
        "--location", type=str,
        help="Place name to geocode (requires geopy)",
    )
    parser.add_argument(
        "--size", type=float, default=2000,
        help="Side length in meters when using --location (default: 2000)",
    )
    parser.add_argument(
        "--output", type=str, default="media",
        help="Output directory for generated assets (default: media)",
    )
    parser.add_argument(
        "--skip", nargs="*", default=[],
        choices=["footprints", "roads", "dem", "mesh", "trees"],
        help="Skip generating specific asset types",
    )
    parser.add_argument(
        "--update-config", action="store_true",
        help="Update map_config.json with new center and bounding box",
    )
    parser.add_argument(
        "--cell-size", type=float, default=2,
        help="DEM raster cell size in meters (default: 2)",
    )

    args = parser.parse_args()

    # Resolve bounding box
    if args.bbox:
        west, south, east, north = args.bbox
        xmin, ymin, xmax, ymax = wgs84_to_sweref(west, south, east, north)
        wgs84_bbox = (west, south, east, north)
    elif args.bbox_sweref:
        xmin, ymin, xmax, ymax = args.bbox_sweref
        wgs84_bbox = sweref_to_wgs84(xmin, ymin, xmax, ymax)
    elif args.location:
        try:
            from geopy.geocoders import Nominatim
            geolocator = Nominatim(user_agent="dtcc-map-assets")
            location = geolocator.geocode(args.location)
            if location is None:
                print(f"Error: Could not geocode '{args.location}'", file=sys.stderr)
                sys.exit(1)
            cx, cy = TO_SWEREF.transform(location.longitude, location.latitude)
            half = args.size / 2
            xmin, ymin = cx - half, cy - half
            xmax, ymax = cx + half, cy + half
            wgs84_bbox = sweref_to_wgs84(xmin, ymin, xmax, ymax)
            log(f"Geocoded '{args.location}' → ({location.latitude}, {location.longitude})")
        except ImportError:
            print("Error: --location requires geopy: pip install geopy", file=sys.stderr)
            sys.exit(1)

    # Create DTCC bounds
    bounds = dtcc.Bounds(xmin, ymin, xmax, ymax)
    log(f"SWEREF99 TM bounds: ({xmin:.0f}, {ymin:.0f}) → ({xmax:.0f}, {ymax:.0f})")
    log(f"WGS84 bounds: ({wgs84_bbox[0]:.6f}, {wgs84_bbox[1]:.6f}) → "
        f"({wgs84_bbox[2]:.6f}, {wgs84_bbox[3]:.6f})")
    log(f"Area: ~{(xmax - xmin):.0f} × {(ymax - ymin):.0f} m")

    # Resolve output directory
    project_root = Path(__file__).resolve().parent.parent
    output_dir = project_root / args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    log(f"Output directory: {output_dir}")

    skip = set(args.skip)
    t0 = time.time()

    # Download point cloud once (shared by DEM and mesh)
    pointcloud = None
    raster = None
    buildings = None

    need_pointcloud = ("dem" not in skip) or ("mesh" not in skip) or ("trees" not in skip)
    if need_pointcloud:
        log("Downloading point cloud (shared by DEM and mesh)...")
        pointcloud = dtcc.download_pointcloud(bounds=bounds)
        log(f"  Downloaded {len(pointcloud.points)} points")
        pointcloud = pointcloud.remove_global_outliers(3.0)
        log(f"  After outlier removal: {len(pointcloud.points)} points")

    # 1. Building footprints
    if "footprints" not in skip:
        buildings = generate_footprints(bounds, output_dir, wgs84_bbox)

    # 2. Road network
    if "roads" not in skip:
        generate_road_network(bounds, output_dir)

    # 3. DEM raster
    if "dem" not in skip:
        _, raster = generate_dem(bounds, output_dir, pointcloud=pointcloud)

    # 4. City mesh
    if "mesh" not in skip:
        generate_mesh(
            bounds, output_dir,
            buildings=buildings,
            pointcloud=pointcloud,
            raster=raster,
        )

    # 5. Trees
    if "trees" not in skip:
        generate_trees(bounds, output_dir, pointcloud=pointcloud, raster=raster)

    # 6. Update config
    if args.update_config:
        config_path = project_root / "map_config.json"
        if config_path.exists():
            update_map_config(config_path, wgs84_bbox)
        else:
            log(f"Warning: {config_path} not found, skipping config update")

        # Update slideshow legend counts from the freshly generated GeoJSON
        update_slideshow_config(output_dir)

    elapsed = time.time() - t0
    log(f"Done! Generated assets in {elapsed:.1f}s")

    # Clear DTCC cache
    dtcc.empty_cache()


if __name__ == "__main__":
    main()
