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
    if roadnetwork is None:
        # DTCC sometimes fails to parse its GPKG; fall back to querying
        # Overpass directly so we get the highway tag.
        log("  Warning: dtcc returned None, querying Overpass directly...")
        try:
            import geopandas as gpd
            import requests
            west, south, east, north = sweref_to_wgs84(
                bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax
            )
            query = (
                f"[out:json][timeout:60];"
                f"way[highway]({south},{west},{north},{east});"
                f"(._;>;);out body;"
            )
            resp = requests.get(
                "https://overpass-api.de/api/interpreter",
                params={"data": query},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            # Parse nodes and ways
            nodes = {e["id"]: (e["lon"], e["lat"])
                     for e in data["elements"] if e["type"] == "node"}
            features = []
            for e in data["elements"]:
                if e["type"] != "way":
                    continue
                coords = [nodes[n] for n in e.get("nodes", []) if n in nodes]
                if len(coords) < 2:
                    continue
                tags = e.get("tags", {})
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": coords},
                    "properties": {
                        "osm_id": e["id"],
                        "highway": tags.get("highway", "unclassified"),
                        "name": tags.get("name", ""),
                    },
                })
            out_path = output_dir / "street-network.geojson"
            geojson = {"type": "FeatureCollection", "features": features}
            with open(out_path, "w") as f:
                json.dump(geojson, f)
            log(f"  Saved {out_path} ({len(features)} road segments from Overpass fallback, WGS84)")
            return None
        except Exception as e:
            log(f"  Overpass fallback also failed: {e}")
        log("  Skipping road network")
        return None
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


def generate_water_bodies(bounds, output_dir):
    """Download water body polygons from OSM and save as WGS84 GeoJSON.

    Queries Overpass for:
      - natural=water (lakes, ponds, reservoirs)
      - waterway=riverbank / waterway=dock
      - natural=coastline (converted to polygons)
      - landuse=reservoir
      - water=* (all water types)
    """
    log("Downloading water bodies from OSM...")
    try:
        import requests

        west, south, east, north = sweref_to_wgs84(
            bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax
        )

        # Query Overpass for water-related features (ways and relations)
        query = (
            f"[out:json][timeout:60];"
            f"("
            f"  way[\"natural\"=\"water\"]({south},{west},{north},{east});"
            f"  way[\"waterway\"=\"riverbank\"]({south},{west},{north},{east});"
            f"  way[\"waterway\"=\"dock\"]({south},{west},{north},{east});"
            f"  way[\"landuse\"=\"reservoir\"]({south},{west},{north},{east});"
            f"  way[\"natural\"=\"wetland\"]({south},{west},{north},{east});"
            f"  way[\"water\"]({south},{west},{north},{east});"
            f"  relation[\"natural\"=\"water\"]({south},{west},{north},{east});"
            f"  relation[\"water\"]({south},{west},{north},{east});"
            f"  relation[\"waterway\"=\"riverbank\"]({south},{west},{north},{east});"
            f");"
            f"(._;>;);"
            f"out body;"
        )

        resp = requests.get(
            "https://overpass-api.de/api/interpreter",
            params={"data": query},
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()

        # Parse nodes
        nodes = {e["id"]: (e["lon"], e["lat"])
                 for e in data["elements"] if e["type"] == "node"}

        # Parse ways into coordinate rings
        ways = {}
        for e in data["elements"]:
            if e["type"] == "way":
                coords = [nodes[n] for n in e.get("nodes", []) if n in nodes]
                if len(coords) >= 3:
                    ways[e["id"]] = {
                        "coords": coords,
                        "tags": e.get("tags", {}),
                    }

        features = []

        # Process relations (multipolygons)
        for e in data["elements"]:
            if e["type"] != "relation":
                continue
            tags = e.get("tags", {})
            members = e.get("members", [])
            outer_rings = []
            for m in members:
                if m["type"] == "way" and m.get("role") == "outer" and m["ref"] in ways:
                    outer_rings.append(ways[m["ref"]]["coords"])

            for ring in outer_rings:
                if len(ring) >= 4:
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                        "properties": {
                            "water_type": tags.get("water", tags.get("natural", "water")),
                            "name": tags.get("name", ""),
                        },
                    })

        # Process standalone ways (closed polygons not part of relations)
        relation_way_ids = set()
        for e in data["elements"]:
            if e["type"] == "relation":
                for m in e.get("members", []):
                    if m["type"] == "way":
                        relation_way_ids.add(m["ref"])

        for way_id, way_data in ways.items():
            if way_id in relation_way_ids:
                continue
            coords = way_data["coords"]
            tags = way_data["tags"]
            # Must be a closed polygon (first == last coord)
            if len(coords) >= 4 and coords[0] == coords[-1]:
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [coords]},
                    "properties": {
                        "water_type": tags.get("water", tags.get("natural", "water")),
                        "name": tags.get("name", ""),
                    },
                })
            elif len(coords) >= 4:
                # Close the ring
                coords.append(coords[0])
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [coords]},
                    "properties": {
                        "water_type": tags.get("water", tags.get("natural", "water")),
                        "name": tags.get("name", ""),
                    },
                })

        out_path = output_dir / "water-bodies.geojson"
        geojson_out = {"type": "FeatureCollection", "features": features}
        with open(out_path, "w") as f:
            json.dump(geojson_out, f)
        log(f"  Saved {out_path} ({len(features)} water body polygons, WGS84)")
        return features
    except Exception as e:
        log(f"  Warning: could not download water bodies: {e}")
        return []


def burn_buildings_into_dem(dem_path, footprints_path):
    """Burn building footprints into a DEM as elevated barriers.

    Rasterizes building polygons onto the DEM grid and raises those cells
    so the D8 flow algorithm in the stormwater animation routes water
    around buildings instead of through them.

    The in-memory dtcc raster (used by mesh/tree steps) is unaffected;
    only the saved GeoTIFF is modified.
    """
    import geopandas as gpd
    import rasterio
    from rasterio.features import rasterize

    gdf = gpd.read_file(str(footprints_path))
    if gdf.crs and gdf.crs.to_epsg() != 3006:
        gdf = gdf.to_crs("EPSG:3006")

    with rasterio.open(str(dem_path), "r+") as src:
        dem = src.read(1)

        building_mask = rasterize(
            [(geom, 1) for geom in gdf.geometry],
            out_shape=dem.shape,
            transform=src.transform,
            fill=0,
            dtype=np.uint8,
        )

        barrier_elev = float(np.nanmax(dem)) + 10.0
        cell_count = int(np.sum(building_mask > 0))
        dem[building_mask == 1] = barrier_elev
        src.write(dem, 1)

    log(f"  Burned {len(gdf)} building footprints into DEM "
        f"({cell_count} cells → {barrier_elev:.1f} m)")


def generate_water_mask(output_dir):
    """Fetch water bodies from Lantmäteriet INSPIRE WMS and save as a binary
    GeoTIFF mask aligned to the DEM grid.

    The mask is 1 where water exists, 0 elsewhere, at the same resolution
    and CRS as clipped_dem.geotiff.tif so the stormwater JS can use it
    directly via pixel-to-pixel correspondence.
    """
    import io
    import requests
    import rasterio
    from rasterio.transform import from_bounds

    dem_path = output_dir / "clipped_dem.geotiff.tif"
    if not dem_path.exists():
        log("  DEM not found, skipping water mask generation")
        return

    with rasterio.open(str(dem_path)) as src:
        dem_bounds = src.bounds
        dem_width = src.width
        dem_height = src.height
        dem_crs = src.crs

    # WMS endpoint (Lantmäteriet INSPIRE Hydrography via SLU)
    wms_url = "https://hades.slu.se/lm/inspire/hy/wms/v1"
    layers = "HY.PhysicalWaters.Waterbodies,HY.Network"

    # Request in EPSG:3006 matching the DEM grid exactly
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": layers,
        "SRS": "EPSG:3006",
        "BBOX": f"{dem_bounds.left},{dem_bounds.bottom},{dem_bounds.right},{dem_bounds.top}",
        "WIDTH": str(dem_width),
        "HEIGHT": str(dem_height),
        "FORMAT": "image/png",
        "TRANSPARENT": "TRUE",
        "STYLES": "",
    }

    log("Fetching water mask from WMS...")
    try:
        resp = requests.get(wms_url, params=params, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        log(f"  Warning: WMS fetch failed: {e}")
        return

    # Check we got an image (not an XML error)
    if b"<ServiceException" in resp.content[:500]:
        log("  Warning: WMS returned a service exception, skipping water mask")
        return

    # Parse the PNG into a numpy array
    from PIL import Image
    img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
    arr = np.array(img)

    # Any pixel with alpha > 0 is water (the WMS draws water features on
    # a transparent background)
    water_mask = (arr[:, :, 3] > 0).astype(np.uint8)
    water_count = int(np.sum(water_mask))
    log(f"  Water mask: {water_count} water cells out of {dem_width * dem_height} "
        f"({100 * water_count / (dem_width * dem_height):.1f}%)")

    # Save as a single-band GeoTIFF matching the DEM
    out_path = output_dir / "water_mask.tif"
    transform = from_bounds(
        dem_bounds.left, dem_bounds.bottom,
        dem_bounds.right, dem_bounds.top,
        dem_width, dem_height,
    )
    with rasterio.open(
        str(out_path), "w",
        driver="GTiff",
        height=dem_height,
        width=dem_width,
        count=1,
        dtype="uint8",
        crs=dem_crs,
        transform=transform,
    ) as dst:
        dst.write(water_mask, 1)

    log(f"  Saved {out_path}")


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

    # Burn building footprints into the saved DEM so stormwater flow
    # routes around buildings (the in-memory raster for mesh is unchanged)
    footprints_path = output_dir / "building-footprints.geojson"
    if footprints_path.exists():
        burn_buildings_into_dem(out_path, footprints_path)
    else:
        log("  No building footprints found, skipping DEM building burn")

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
    """Detect trees from WMS false-colour infrared imagery and save as
    WGS84 Point GeoJSON.

    Fetches Lantmäteriet's CIR orthophoto (``Ortofoto_IR``) at 0.5 m
    resolution, computes a vegetation index from the near-infrared band
    (red channel in CIR), masks out non-vegetation, and finds local
    maxima to locate individual tree crowns.

    Note: CIR imagery does not provide tree heights.  If a DEM is
    available in *output_dir* the function attempts a crude height
    estimate from surface roughness; otherwise a default height of 8 m
    is assigned to every tree.
    """
    import io
    import requests
    from PIL import Image

    # ------------------------------------------------------------------
    # 1. Determine raster extent in SWEREF99 TM (EPSG:3006)
    # ------------------------------------------------------------------
    # Prefer the DEM extent so the trees align pixel-perfectly with the
    # terrain raster and the water mask.  Fall back to the supplied bounds.
    dem_path = output_dir / "clipped_dem.geotiff.tif"
    have_dem = dem_path.exists()
    if have_dem:
        import rasterio
        with rasterio.open(str(dem_path)) as src:
            dem_bounds = src.bounds
            xmin, ymin = dem_bounds.left, dem_bounds.bottom
            xmax, ymax = dem_bounds.right, dem_bounds.top
    else:
        xmin, ymin, xmax, ymax = bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax

    # Target ~0.5 m per pixel (matches the WMS native resolution)
    cell_size = 0.5
    width = int(round((xmax - xmin) / cell_size))
    height = int(round((ymax - ymin) / cell_size))
    # Cap request size to avoid WMS server limits
    max_dim = 4096
    if width > max_dim or height > max_dim:
        scale = max_dim / max(width, height)
        width = int(width * scale)
        height = int(height * scale)
        cell_size = (xmax - xmin) / width

    # ------------------------------------------------------------------
    # 2. Fetch false-colour infrared ortho from Lantmäteriet WMS
    # ------------------------------------------------------------------
    wms_url = "https://hades.slu.se/lm/ortofoto/wms/v1.3"
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": "Ortofoto_IR",
        "SRS": "EPSG:3006",
        "BBOX": f"{xmin},{ymin},{xmax},{ymax}",
        "WIDTH": str(width),
        "HEIGHT": str(height),
        "FORMAT": "image/jpeg",
        "STYLES": "",
    }

    log("Fetching false-colour infrared ortho from WMS...")
    resp = requests.get(wms_url, params=params, timeout=60)
    resp.raise_for_status()
    if b"<ServiceException" in resp.content[:500]:
        raise RuntimeError("WMS returned a service exception for Ortofoto_IR")

    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    arr = np.array(img, dtype=np.float32)
    log(f"  CIR image: {arr.shape[1]}x{arr.shape[0]} px, cell_size≈{cell_size:.2f} m")

    # ------------------------------------------------------------------
    # 3. Compute vegetation index from CIR bands
    #    In CIR: R = NIR, G = visible-red, B = visible-green
    #    veg_idx ≈ (NIR − Red_vis) / (NIR + Red_vis)
    # ------------------------------------------------------------------
    nir = arr[:, :, 0]
    red = arr[:, :, 1]
    denom = nir + red
    veg_idx = np.where(denom > 0, (nir - red) / denom, 0.0)

    # Smooth to reduce noise from individual pixels
    veg_idx = ndimage.gaussian_filter(veg_idx, sigma=1.0)

    # ------------------------------------------------------------------
    # 4. Threshold → vegetation mask
    # ------------------------------------------------------------------
    veg_threshold = 0.15
    veg_mask = veg_idx > veg_threshold

    # Remove small blobs (grass patches, individual shrubs)
    # Keep only clusters ≥ min_cluster pixels (≈ 2.5 m² at 0.5 m resolution)
    min_cluster = 20
    labelled, n_labels = ndimage.label(veg_mask)
    component_sizes = ndimage.sum(veg_mask, labelled, range(1, n_labels + 1))
    for label_id, sz in enumerate(component_sizes, start=1):
        if sz < min_cluster:
            veg_mask[labelled == label_id] = False

    veg_count = int(np.sum(veg_mask))
    log(f"  Vegetation mask: {veg_count} cells "
        f"({100 * veg_count / (width * height):.1f}%)")

    # ------------------------------------------------------------------
    # 5. Find tree crown peaks via local maxima of the vegetation index
    # ------------------------------------------------------------------
    # Zero-out non-vegetation so peaks are only in green areas
    tree_signal = np.where(veg_mask, veg_idx, 0.0)

    # Neighbourhood ≈ 10 m diameter crown
    crown_cells = max(3, int(5.0 / cell_size))
    neighbourhood = 2 * crown_cells + 1

    local_max_val = ndimage.maximum_filter(tree_signal, size=neighbourhood)
    is_peak = (tree_signal == local_max_val) & (tree_signal > 0)

    peak_rows, peak_cols = np.where(is_peak)
    log(f"  Detected {len(peak_rows)} tree peaks")

    # ------------------------------------------------------------------
    # 6. Estimate crown radius via watershed segmentation
    # ------------------------------------------------------------------
    # Place a marker at each peak, then watershed-segment the vegetation
    # mask so every veg pixel is assigned to its nearest peak.  The area
    # of each segment gives us the crown footprint → radius.
    from scipy.ndimage import watershed_ift

    markers = np.zeros(tree_signal.shape, dtype=np.int32)
    for i, (r, c) in enumerate(zip(peak_rows, peak_cols)):
        markers[r, c] = i + 1  # labels start at 1

    # Invert the signal so watershed flows outward from peaks (high → low)
    cost = np.where(veg_mask, (tree_signal.max() - tree_signal), 0)
    # watershed_ift needs unsigned 16-bit integer costs
    cost_norm = cost / (cost.max() + 1e-9) * 65534  # scale to uint16 range
    cost_int = cost_norm.astype(np.uint16)
    # Mask non-vegetation as impassable (max cost)
    cost_int[~veg_mask] = np.iinfo(np.uint16).max

    segments = watershed_ift(cost_int, markers)

    # Compute area (in pixels) of each segment → radius in metres
    crown_radii = np.zeros(len(peak_rows))
    for i in range(len(peak_rows)):
        area_px = float(np.sum(segments == (i + 1)))
        area_m2 = area_px * cell_size * cell_size
        crown_radii[i] = max(1.5, min(8.0, np.sqrt(area_m2 / np.pi)))

    log(f"  Crown radii: min={crown_radii.min():.1f} m, "
        f"mean={crown_radii.mean():.1f} m, max={crown_radii.max():.1f} m")

    # ------------------------------------------------------------------
    # 7. Assign heights — crude estimate or default
    # ------------------------------------------------------------------
    default_height = 8.0
    heights = np.full(len(peak_rows), default_height)

    # ------------------------------------------------------------------
    # 8. Convert pixel coords → SWEREF99 TM → WGS84 and write GeoJSON
    # ------------------------------------------------------------------
    features = []
    for i, (row, col) in enumerate(zip(peak_rows, peak_cols)):
        # Pixel centre in SWEREF99 TM
        x = xmin + (col + 0.5) * cell_size
        # Rows are top-down in the image
        y = ymax - (row + 0.5) * cell_size
        lng, lat = TO_WGS84.transform(x, y)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "id": int(i),
                "height": round(float(heights[i]), 1),
                "crown_radius": round(float(crown_radii[i]), 1),
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}
    out_path = output_dir / "trees.geojson"
    with open(out_path, "w") as f:
        json.dump(geojson, f)

    log(f"  Saved {out_path} ({len(features)} trees, WGS84)")


def generate_trees_glb(output_dir):
    """Generate an instanced tree GLB from trees.geojson and the DEM.

    Uses a low-poly tree template instanced at every tree position,
    grounded on the DEM surface, in the same normalised coordinate
    system as mesh.stl so the sun-study aligns them automatically.
    """
    import subprocess
    script = Path(__file__).resolve().parent / "generate_trees_glb.py"
    trees_path = output_dir / "trees.geojson"
    dem_path = output_dir / "clipped_dem.geotiff.tif"
    out_path = output_dir / "trees_instanced.glb"

    if not trees_path.exists():
        log("  trees.geojson not found, skipping GLB generation")
        return
    if not dem_path.exists():
        log("  DEM not found, skipping GLB generation")
        return

    log("Generating instanced trees GLB...")
    subprocess.check_call([
        sys.executable, str(script),
        "--trees", str(trees_path),
        "--dem", str(dem_path),
        "--output", str(out_path),
    ])
    log(f"  Saved {out_path}")


def update_map_config(config_path, wgs84_bbox, sweref_bbox=None):
    """Update map_config.json with the new bounding box, center, and table corners."""
    west, south, east, north = wgs84_bbox
    center_lng = (west + east) / 2
    center_lat = (south + north) / 2

    with open(config_path) as f:
        config = json.load(f)

    config["calibration"]["center"]["lng"] = center_lng
    config["calibration"]["center"]["lat"] = center_lat
    config["table"]["boundingBox"] = [west, south, east, north]

    # Compute DEM corner polygon in WGS84 for table overlay
    # Corners: SE, NE, NW, SW (matching the existing convention)
    if sweref_bbox:
        xmin, ymin, xmax, ymax = sweref_bbox
        corners_sweref = [
            (xmax, ymin),  # SE
            (xmax, ymax),  # NE
            (xmin, ymax),  # NW
            (xmin, ymin),  # SW
        ]
        corners_wgs84 = []
        for e, n in corners_sweref:
            lon, lat = TO_WGS84.transform(e, n)
            corners_wgs84.append([lon, lat])
        config["table"]["corners"] = corners_wgs84

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    log(f"Updated {config_path}")
    log(f"  Center: ({center_lng:.6f}, {center_lat:.6f})")
    log(f"  Bounding box: [{west}, {south}, {east}, {north}]")
    if sweref_bbox:
        log(f"  Table corners: {config['table']['corners']}")


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
        choices=["footprints", "roads", "water", "dem", "mesh", "trees"],
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

    need_pointcloud = ("dem" not in skip) or ("mesh" not in skip)
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

    # 2b. Water bodies
    if "water" not in skip:
        generate_water_bodies(bounds, output_dir)

    # 3. DEM raster
    if "dem" not in skip:
        _, raster = generate_dem(bounds, output_dir, pointcloud=pointcloud)

    # 3b. Water mask (from WMS, aligned to DEM grid)
    if "dem" not in skip:
        generate_water_mask(output_dir)

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

    # 6. Trees instanced GLB (requires trees.geojson + DEM)
    if "trees" not in skip:
        generate_trees_glb(output_dir)

    # 7. Update config
    if args.update_config:
        config_path = project_root / "map_config.json"
        if config_path.exists():
            update_map_config(config_path, wgs84_bbox,
                              sweref_bbox=(xmin, ymin, xmax, ymax))
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
