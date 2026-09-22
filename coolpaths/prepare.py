"""Prepare the Gothenburg CoolPaths study from OSM, Earth Engine and NASA POWER.

Run with ``python -m coolpaths.prepare``. All large products stay in
``coolpaths/data``; the manifest is written last so the API never advertises a
partially processed study.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
import json
import logging
import math
import os
from pathlib import Path
from zoneinfo import ZoneInfo

import geopandas as gpd
import numpy as np
import osmnx as ox
from PIL import Image, PngImagePlugin
import pvlib
from pyproj import Transformer
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin, rowcol
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform_bounds
import requests
from scipy.ndimage import distance_transform_edt
from shapely.geometry import LineString, box
from shapely.ops import transform as shape_transform

from .thermal import pet_memi, radiant_temperature, shadow_mask, sky_view_factor


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get("COOLPATHS_DATA_DIR", Path(__file__).resolve().parent / "data"))
STUDY_DATE = date(2026, 7, 15)
HOURS = range(8, 21)
TIMEZONE = ZoneInfo("Europe/Stockholm")
CRS = "EPSG:3006"
RESOLUTION_M = 2
LOG = logging.getLogger("coolpaths.prepare")


def project_id() -> str:
    value = os.environ.get("COOLPATHS_EE_PROJECT_ID")
    if value:
        return value
    config_path = ROOT / "trafik-config.json"
    if config_path.exists():
        config = json.loads(config_path.read_text())
        return config.get("coolpathsEarthEngineProject", {}).get("id", "")
    return ""


def study_bounds() -> tuple[float, float, float, float]:
    """Cover the map's committed street network with a 100 m data margin."""
    features = json.loads((ROOT / "media/street-network.geojson").read_text())["features"]
    coordinates = [p for feature in features for p in feature["geometry"]["coordinates"]]
    west, east = min(p[0] for p in coordinates), max(p[0] for p in coordinates)
    south, north = min(p[1] for p in coordinates), max(p[1] for p in coordinates)
    center_lat = (south + north) / 2
    lon_margin = 100 / (111_320 * math.cos(math.radians(center_lat)))
    lat_margin = 100 / 111_320
    return west - lon_margin, south - lat_margin, east + lon_margin, north + lat_margin


def template(bounds: tuple[float, float, float, float]):
    project = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    west, south, east, north = bounds
    corners = [project.transform(x, y) for x in (west, east) for y in (south, north)]
    x0 = math.floor(min(p[0] for p in corners) / RESOLUTION_M) * RESOLUTION_M
    x1 = math.ceil(max(p[0] for p in corners) / RESOLUTION_M) * RESOLUTION_M
    y0 = math.floor(min(p[1] for p in corners) / RESOLUTION_M) * RESOLUTION_M
    y1 = math.ceil(max(p[1] for p in corners) / RESOLUTION_M) * RESOLUTION_M
    width = int((x1 - x0) / RESOLUTION_M)
    height = int((y1 - y0) / RESOLUTION_M)
    return from_origin(x0, y1, RESOLUTION_M, RESOLUTION_M), (height, width)


def save_tif(path: Path, array: np.ndarray, affine) -> None:
    data = np.asarray(array, dtype=np.float32)
    source_by_product = {
        "dem": "Local DEM and NASA SRTM via Earth Engine",
        "alos_dsm": "JAXA ALOS AW3D30 via Earth Engine",
        "dsm": "DEM, local/OSM buildings, Meta canopy and local trees",
        "svf": "Local 2 m DSM horizon calculation",
        "albedo": "Sentinel-2 NDVI, ESA WorldCover, building geometry",
        "direct": "NASA POWER atmosphere, pvlib Ineichen, DSM shadows",
        "diffuse": "NASA POWER atmosphere and pvlib Ineichen",
        "shade": "DSM solar shadow calculation",
        "mrt": "Irradiance, sky view factor, albedo, NASA POWER air temperature",
        "pet": "MRT and NASA POWER air temperature, humidity and wind",
    }
    product = "alos_dsm" if path.stem == "alos_dsm" else path.stem.split("_")[0]
    with rasterio.open(path, "w", driver="GTiff", height=data.shape[0], width=data.shape[1],
                       count=1, crs=CRS, transform=affine, dtype="float32",
                       nodata=-9999, compress="deflate") as dst:
        dst.write(np.where(np.isfinite(data), data, -9999).astype(np.float32), 1)
        dst.update_tags(study_date=STUDY_DATE.isoformat(), product=path.stem,
                        source=source_by_product.get(product, "See manifest.json"),
                        processing="coolpaths.prepare; source details in manifest.json",
                        spatial_resolution_m=RESOLUTION_M)


def aligned_raster(path: Path, affine, shape, method=Resampling.bilinear,
                   source_crs=None) -> np.ndarray:
    result = np.full(shape, np.nan, dtype=np.float32)
    with rasterio.open(path) as src:
        source = src.read(1) if source_crs else rasterio.band(src, 1)
        reproject(source=source, destination=result,
                  src_transform=src.transform, src_crs=source_crs or src.crs,
                  src_nodata=src.nodata, dst_transform=affine, dst_crs=CRS,
                  dst_nodata=np.nan, resampling=method)
    return result


def earth_engine_inputs(folder: Path, bounds, affine, shape,
                        project: str, key_file: Path) -> dict[str, Path]:
    import ee

    if not key_file.is_file():
        raise FileNotFoundError(f"Earth Engine service-account key not found: {key_file}")
    email = json.loads(key_file.read_text()).get("client_email")
    if not email:
        raise ValueError("Service-account JSON has no client_email")
    ee.Initialize(ee.ServiceAccountCredentials(email, str(key_file)), project=project)
    region = ee.Geometry.Rectangle(list(bounds))
    since = (STUDY_DATE - timedelta(days=300)).isoformat()
    images = {
        "canopy": (ee.ImageCollection("projects/meta-forest-monitoring-okw37/assets/CanopyHeight")
                   .mosaic().clip(region)),
        "ndvi": (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                 .filterBounds(region).filterDate(since, STUDY_DATE.isoformat())
                 .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20)).median()
                 .normalizedDifference(["B8", "B4"]).rename("NDVI").clip(region)),
        "water": (ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
                  .eq(80).clip(region)),
        "dem": (ee.Image("USGS/SRTMGL1_003").select("elevation").clip(region)),
        "alos_dsm": (ee.ImageCollection("JAXA/ALOS/AW3D30/V4_1").mosaic()
                     .select("DSM").clip(region)),
    }
    grid = {
        "dimensions": {"width": shape[1], "height": shape[0]},
        "affineTransform": {
            "scaleX": affine.a, "shearX": affine.b, "translateX": affine.c,
            "shearY": affine.d, "scaleY": affine.e, "translateY": affine.f,
        },
        "crsCode": CRS,
    }
    result = {}
    for name, image in images.items():
        target = folder / f"ee_{name}.tif"
        if not target.exists():
            LOG.info("Downloading Earth Engine %s", name)
            pixels = ee.data.computePixels({"expression": image.toFloat(),
                                            "fileFormat": "GEO_TIFF", "grid": grid})
            target.write_bytes(pixels)
        result[name] = target
    return result


def walking_graph_and_buildings(bounds, existing_graph=None):
    region = box(*bounds)
    LOG.info("Downloading OSM walking graph and buildings")
    network = None if existing_graph else ox.graph_from_polygon(region, network_type="walk")
    osm_buildings = ox.features_from_polygon(region, {"building": True})
    osm_buildings = osm_buildings[osm_buildings.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    local = gpd.read_file(ROOT / "media/building-footprints.geojson")
    local = local.set_crs("EPSG:4326", allow_override=True).to_crs(CRS)
    osm_buildings = osm_buildings.to_crs(CRS)
    local_envelope = box(*local.total_bounds)
    outside = osm_buildings[~osm_buildings.geometry.centroid.within(local_envelope)]
    buildings = []
    for geometry in local.geometry:
        if geometry is not None and not geometry.is_empty:
            buildings.append((geometry, 6.0, "local footprint; inferred 2 levels"))
    for _, row in outside.iterrows():
        raw_height = row.get("height")
        raw_levels = row.get("building:levels")
        try:
            height = float(str(raw_height).replace("m", ""))
        except (ValueError, TypeError):
            try:
                height = float(raw_levels) * 3
            except (ValueError, TypeError):
                height = 6.0
        if np.isfinite(height) and height > 0:
            buildings.append((row.geometry, min(height, 100), "OSM/inferred"))

    if existing_graph:
        graph = existing_graph
    else:
        projector = Transformer.from_crs("EPSG:4326", CRS, always_xy=True).transform
        nodes = {str(node): [float(data["x"]), float(data["y"])]
                 for node, data in network.nodes(data=True)}
        edges = []
        for u, v, key, data in network.edges(keys=True, data=True):
            start, end = nodes[str(u)], nodes[str(v)]
            geometry = data.get("geometry") or LineString([start, end])
            line = [list(p) for p in geometry.coords]
            if math.hypot(line[0][0] - start[0], line[0][1] - start[1]) > 1e-5:
                line.reverse()
            metric = shape_transform(projector, LineString(line))
            if metric.length < 0.1:
                continue
            edges.append({"id": f"{u}-{v}-{key}", "u": str(u), "v": str(v),
                          "coordinates": line, "length_m": round(metric.length, 3),
                          "name": str(data.get("name", "Walking path")),
                          "highway": str(data.get("highway", "footway"))})
        graph = {"nodes": nodes, "edges": edges}
    if not graph["edges"] or not buildings:
        raise RuntimeError("OSM did not return walking paths and buildings for the study area")
    return graph, buildings


def prepared_geometry(folder: Path, bounds, force: bool):
    graph_path = folder / "graph.json"
    building_path = folder / "buildings.gpkg"
    if graph_path.exists() and building_path.exists() and not force:
        graph = json.loads(graph_path.read_text())
        saved = gpd.read_file(building_path)
        buildings = [(row.geometry, float(row.height_m), row.source)
                     for _, row in saved.iterrows()]
        return graph, buildings
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(folder / "osmnx_cache")
    existing_graph = json.loads(graph_path.read_text()) if graph_path.exists() and not force else None
    graph, buildings = walking_graph_and_buildings(bounds, existing_graph)
    graph_path.write_text(json.dumps(graph, separators=(",", ":")))
    gpd.GeoDataFrame({"height_m": [height for _, height, _ in buildings],
                      "source": [source for _, _, source in buildings]},
                     geometry=[geometry for geometry, _, _ in buildings],
                     crs=CRS).to_file(building_path, driver="GPKG")
    return graph, buildings


def local_tree_heights(affine, shape) -> np.ndarray:
    trees = gpd.read_file(ROOT / "media/trees.geojson").to_crs(CRS)
    circles = []
    for _, row in trees.iterrows():
        height = float(row.get("height") or 0)
        if height > 0 and np.isfinite(height):
            circles.append((row.geometry.buffer(max(1.5, min(5, height * 0.22))), height))
    return rasterize(circles, out_shape=shape, transform=affine,
                     fill=0, dtype="float32")


def fetch_power(bounds) -> dict:
    west, south, east, north = bounds
    params = {
        "parameters": "T2M,RH2M,WS10M",
        "community": "RE", "longitude": (west + east) / 2,
        "latitude": (south + north) / 2,
        "start": STUDY_DATE.strftime("%Y%m%d"),
        "end": (STUDY_DATE + timedelta(days=1)).strftime("%Y%m%d"),
        "format": "JSON", "time-standard": "UTC",
    }
    response = requests.get("https://power.larc.nasa.gov/api/temporal/hourly/point",
                            params=params, timeout=120)
    response.raise_for_status()
    values = response.json()["properties"]["parameter"]
    if not all(name in values for name in params["parameters"].split(",")):
        raise RuntimeError("NASA POWER did not return all required hourly fields")
    return values


def fetch_atmosphere(bounds) -> dict:
    """Daily POWER atmosphere, with its published July climatology for gaps."""
    west, south, east, north = bounds
    common = {
        "community": "RE", "longitude": (west + east) / 2,
        "latitude": (south + north) / 2, "format": "JSON",
        "parameters": "AOD_55,TQV,TO3",
    }
    day = STUDY_DATE.strftime("%Y%m%d")
    response = requests.get("https://power.larc.nasa.gov/api/temporal/daily/point",
                            params={**common, "start": day, "end": day,
                                    "time-standard": "UTC"}, timeout=120)
    response.raise_for_status()
    daily = response.json()["properties"]["parameter"]
    values = {name: float(daily[name].get(day, -999)) for name in common["parameters"].split(",")}
    sources = {name: "NASA POWER daily" for name in values}
    missing = [name for name, value in values.items() if not np.isfinite(value) or value < 0]
    if missing:
        response = requests.get("https://power.larc.nasa.gov/api/temporal/climatology/point",
                                params=common, timeout=120)
        response.raise_for_status()
        climatology = response.json()["properties"]["parameter"]
        month = STUDY_DATE.strftime("%b").upper()
        for name in missing:
            value = float(climatology[name][month])
            if not np.isfinite(value) or value < 0:
                raise RuntimeError(f"NASA POWER has no valid {name} daily or climatology value")
            values[name] = value
            sources[name] = f"NASA POWER {month} climatology"
    return {"values": values, "sources": sources}


def clear_sky_irradiance(utc: datetime, latitude: float, longitude: float,
                         altitude_m: float, atmosphere: dict) -> dict[str, float]:
    """Replicate the notebook's Kasten Linke turbidity + Ineichen clear sky."""
    pressure = pvlib.atmosphere.alt2pres(altitude_m)
    noon = datetime(STUDY_DATE.year, STUDY_DATE.month, STUDY_DATE.day,
                    12, tzinfo=TIMEZONE)
    noon_zenith = float(pvlib.solarposition.get_solarposition(noon, latitude, longitude)
                        .iloc[0]["apparent_zenith"])
    noon_airmass = pvlib.atmosphere.get_absolute_airmass(
        pvlib.atmosphere.get_relative_airmass(noon_zenith), pressure)
    values = atmosphere["values"]
    turbidity = float(pvlib.atmosphere.kasten96_lt(
        noon_airmass, values["TQV"], values["AOD_55"]))
    zenith = float(pvlib.solarposition.get_solarposition(utc, latitude, longitude)
                   .iloc[0]["apparent_zenith"])
    airmass = pvlib.atmosphere.get_absolute_airmass(
        pvlib.atmosphere.get_relative_airmass(zenith), pressure)
    result = pvlib.clearsky.ineichen(
        zenith, airmass, turbidity, altitude=altitude_m,
        dni_extra=pvlib.irradiance.get_extra_radiation(utc))
    return {name: float(result[name]) for name in ("ghi", "dni", "dhi")}


def power_at(power: dict, name: str, utc: datetime) -> float:
    key = utc.strftime("%Y%m%d%H")
    value = float(power[name].get(key, -999))
    if not np.isfinite(value) or value <= -900:
        raise RuntimeError(f"NASA POWER has no {name} at {key} UTC")
    return value


def render_png(pet: np.ndarray, affine, target: Path) -> list[float]:
    """Render a PET overlay in Web Mercator for MapLibre image coordinates."""
    height, width = pet.shape
    left, top = affine * (0, 0)
    right, bottom = affine * (width, height)
    target_transform, target_width, target_height = calculate_default_transform(
        CRS, "EPSG:3857", width, height, left, bottom, right, top)
    projected = np.full((target_height, target_width), np.nan, dtype=np.float32)
    reproject(pet, projected, src_transform=affine, src_crs=CRS, src_nodata=np.nan,
              dst_transform=target_transform, dst_crs="EPSG:3857", dst_nodata=np.nan,
              resampling=Resampling.bilinear)
    stops = [(20, (34, 211, 238)), (24, (16, 185, 129)),
             (30, (250, 204, 21)), (36, (251, 146, 60)), (44, (239, 68, 68))]
    channels = [np.interp(projected, [s[0] for s in stops], [s[1][i] for s in stops])
                for i in range(3)]
    rgba = np.stack([*channels, np.where(np.isfinite(projected), 155, 0)], axis=-1)
    png_metadata = PngImagePlugin.PngInfo()
    png_metadata.add_text("study_date", STUDY_DATE.isoformat())
    png_metadata.add_text("product", target.stem)
    png_metadata.add_text("source", "Hourly PET GeoTIFF from Earth Engine, OSM and NASA POWER inputs")
    png_metadata.add_text("processing", "coolpaths.prepare; source details in manifest.json")
    Image.fromarray(np.nan_to_num(rgba).astype(np.uint8), "RGBA").save(
        target, pnginfo=png_metadata)
    mercator_bounds = (target_transform.c,
                       target_transform.f - target_height * abs(target_transform.e),
                       target_transform.c + target_width * target_transform.a,
                       target_transform.f)
    return list(transform_bounds("EPSG:3857", "EPSG:4326", *mercator_bounds))


def edge_samples(graph: dict, raster: np.ndarray, affine, projector) -> dict[str, float]:
    result = {}
    for edge in graph["edges"]:
        metric = shape_transform(projector, LineString(edge["coordinates"]))
        count = max(2, int(math.ceil(metric.length / 2)))
        points = [metric.interpolate(distance) for distance in np.linspace(0, metric.length, count)]
        rows, cols = rowcol(affine, [p.x for p in points], [p.y for p in points])
        rows, cols = np.asarray(rows), np.asarray(cols)
        inside = (rows >= 0) & (cols >= 0) & (rows < raster.shape[0]) & (cols < raster.shape[1])
        values = raster[rows[inside], cols[inside]]
        values = values[np.isfinite(values)]
        if values.size >= count * 0.5:
            result[edge["id"]] = round(float(values.mean()), 3)
    return result


def prepare(force: bool = False) -> Path:
    project = project_id()
    key = os.environ.get("COOLPATHS_EE_KEY_FILE") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not project:
        raise RuntimeError("Set COOLPATHS_EE_PROJECT_ID or configure the project in trafik-config.json")
    if not key:
        raise RuntimeError("Set COOLPATHS_EE_KEY_FILE to the local service-account JSON path")
    folder = DATA_ROOT / STUDY_DATE.isoformat()
    folder.mkdir(parents=True, exist_ok=True)
    manifest = folder / "manifest.json"
    if manifest.exists() and not force:
        LOG.info("Study already prepared: %s (use --force to rebuild)", manifest)
        return manifest
    if force:
        manifest.unlink(missing_ok=True)

    bounds = study_bounds()
    affine, shape = template(bounds)
    inputs = earth_engine_inputs(folder, bounds, affine, shape, project, Path(key))
    graph, buildings = prepared_geometry(folder, bounds, force)

    dem = aligned_raster(inputs["dem"], affine, shape)
    local_dem = aligned_raster(ROOT / "media/clipped_dem.geotiff.tif", affine, shape,
                               source_crs=CRS)
    dem = np.where(np.isfinite(local_dem), local_dem, dem)
    projector = Transformer.from_crs("EPSG:4326", CRS, always_xy=True).transform
    study_polygon = shape_transform(projector, box(*bounds))
    inside_study = rasterize([(study_polygon, 1)], out_shape=shape,
                             transform=affine, fill=0).astype(bool)
    if np.any(inside_study & ~np.isfinite(dem)):
        raise RuntimeError("DEM does not cover the whole walking study area")
    # The projected rectangular grid has corner cells outside the geographic
    # study polygon. Fill only those with the nearest ground cell for horizon
    # calculations; they are excluded from PET display and routing below.
    if not np.all(np.isfinite(dem)):
        nearest = distance_transform_edt(~np.isfinite(dem), return_distances=False,
                                         return_indices=True)
        dem = dem[tuple(nearest)]
    alos = aligned_raster(inputs["alos_dsm"], affine, shape)
    canopy = np.nan_to_num(aligned_raster(inputs["canopy"], affine, shape), nan=0)
    canopy = np.maximum(canopy, local_tree_heights(affine, shape))
    ndvi = aligned_raster(inputs["ndvi"], affine, shape)
    water = aligned_raster(inputs["water"], affine, shape, Resampling.nearest) > 0.5
    building_heights = rasterize(((geometry, height) for geometry, height, _ in buildings),
                                 out_shape=shape, transform=affine, fill=0, dtype="float32")
    building_mask = building_heights > 0
    vegetation = (ndvi > 0.3) | (canopy > 0)
    albedo = np.full(shape, 0.15, dtype=np.float32)
    albedo[vegetation] = 0.25
    albedo[building_mask] = 0.22
    albedo[water] = 0.05
    # ALOS is retained as a provenance and QA product; inferred building heights
    # and measured local trees resolve geometry more finely than its 30 m cells.
    building_surface = dem + building_heights
    tree_surface = dem + canopy
    dsm = np.maximum(building_surface, tree_surface)
    svf = sky_view_factor(dsm, dem, RESOLUTION_M)
    for name, arr in (("dem", dem), ("alos_dsm", alos), ("dsm", dsm),
                      ("svf", svf), ("albedo", albedo)):
        save_tif(folder / f"{name}.tif", arr, affine)
    power = fetch_power(bounds)
    (folder / "nasa_power.json").write_text(json.dumps(power))
    atmosphere = fetch_atmosphere(bounds)
    (folder / "nasa_atmosphere.json").write_text(json.dumps(atmosphere, indent=2))
    center_lon = (bounds[0] + bounds[2]) / 2
    center_lat = (bounds[1] + bounds[3]) / 2
    altitude_m = float(np.nanmean(dem[inside_study]))
    valid_hours = {}
    for hour in HOURS:
        local_time = datetime(STUDY_DATE.year, STUDY_DATE.month, STUDY_DATE.day,
                              hour, tzinfo=TIMEZONE)
        utc = local_time.astimezone(ZoneInfo("UTC"))
        LOG.info("Processing PET at %02d:00 local", hour)
        solar = pvlib.solarposition.get_solarposition(utc, center_lat, center_lon).iloc[0]
        elevation = float(solar["apparent_elevation"])
        azimuth = float(solar["azimuth"])
        building_shadow = shadow_mask(building_surface, dem, RESOLUTION_M, azimuth, elevation)
        tree_shadow = shadow_mask(tree_surface, dem, RESOLUTION_M, azimuth, elevation)
        clear_sky = clear_sky_irradiance(utc, center_lat, center_lon,
                                        altitude_m, atmosphere)
        dni = max(0, clear_sky["dni"])
        diffuse = max(0, clear_sky["dhi"])
        beam = dni * max(0, math.sin(math.radians(elevation)))
        direct = np.full(shape, beam, dtype=np.float32)
        direct[building_shadow] = 0
        # The notebook's deciduous leaf-on profile for July: 1.3% direct
        # transmission through the crown or its cast shadow, 50% diffuse.
        direct[(tree_shadow | (canopy > 0)) & ~building_shadow] *= 0.013
        air = power_at(power, "T2M", utc)
        humidity = power_at(power, "RH2M", utc)
        wind_10m = power_at(power, "WS10M", utc)
        wind_1m = max(0.3, wind_10m * math.log(1.1 / 0.1) / math.log(10 / 0.1))
        mrt = radiant_temperature(air, direct, diffuse, svf, albedo, canopy > 0,
                                  solar_elevation_deg=elevation,
                                  tree_diffuse_transmission=0.5)
        # Outdoor meteorology is uniform at NASA POWER's point resolution. A
        # 0.25 °C MRT lookup avoids millions of repeated MEMI solutions per hour.
        lower = math.floor(float(np.nanmin(mrt))) - 1
        upper = math.ceil(float(np.nanmax(mrt))) + 1
        mrt_bins = np.arange(lower, upper + 0.25, 0.25, dtype=np.float32)
        pet_bins = pet_memi(air, mrt_bins, wind_1m, humidity)
        pet = np.interp(mrt, mrt_bins, pet_bins).astype(np.float32)
        pet[building_mask | water | ~inside_study] = np.nan
        save_tif(folder / f"pet_{hour:02d}.tif", pet, affine)
        save_tif(folder / f"mrt_{hour:02d}.tif", mrt, affine)
        save_tif(folder / f"direct_{hour:02d}.tif", direct, affine)
        save_tif(folder / f"diffuse_{hour:02d}.tif",
                 np.full(shape, diffuse, dtype=np.float32), affine)
        save_tif(folder / f"shade_{hour:02d}.tif", building_shadow | tree_shadow, affine)
        image_bounds = render_png(pet, affine, folder / f"pet_{hour:02d}.png")
        values = edge_samples(graph, pet, affine, projector)
        if not values:
            raise RuntimeError(f"No walking edges intersect valid PET cells at {hour:02d}:00")
        (folder / f"edge_pet_{hour:02d}.json").write_text(json.dumps({
            "metadata": {"study_date": STUDY_DATE.isoformat(), "hour_local": hour,
                         "timezone": "Europe/Stockholm", "units": "degrees Celsius PET",
                         "source": "hourly PET GeoTIFF sampled along OSM walking edges"},
            "values": values}, separators=(",", ":")))
        valid_hours[str(hour)] = {"mean_pet_c": round(float(np.nanmean(pet)), 2),
                                  "edge_count": len(values), "utc": utc.isoformat(),
                                  "air_temperature_c": round(air, 2),
                                  "relative_humidity_pct": round(humidity, 2),
                                  "wind_10m_ms": round(wind_10m, 2),
                                  "clear_sky_irradiance_w_m2": clear_sky}

    metadata = {
        "study_date": STUDY_DATE.isoformat(), "timezone": "Europe/Stockholm",
        "hours": valid_hours, "bounds": list(bounds), "image_bounds": image_bounds,
        "resolution_m": RESOLUTION_M, "crs": CRS,
        "graph_nodes": len(graph["nodes"]), "graph_edges": len(graph["edges"]),
        "building_count": len(buildings), "earth_engine_project": project,
        "sources": {
            "routes": "OpenStreetMap walking graph via OSMnx",
            "buildings": "local footprints where available; OSM elsewhere; 6 m inferred default",
            "trees": "Meta canopy height plus local tree-height points",
            "canopy": "Meta Forest Monitoring canopy height (Earth Engine)",
            "ndvi": "Sentinel-2 SR Harmonized composite (Earth Engine)",
            "water": "ESA WorldCover v200 (Earth Engine)",
            "dem": "local 2 m DEM where available; NASA SRTM elsewhere",
            "alos_dsm": "JAXA ALOS AW3D30 retained for QA",
            "weather": "NASA POWER hourly point air temperature, humidity and wind",
            "atmosphere": atmosphere,
            "irradiance": "NASA POWER atmospheric data; pvlib Kasten Linke turbidity and Ineichen clear sky, following the CoolPaths notebook",
            "tree_transmission": "CoolPaths July deciduous profile: 0.013 direct, 0.50 diffuse",
            "mrt": "Standing-person solar projection 0.28; shortwave absorption 0.70, longwave emissivity 0.97; surfaces at air temperature",
            "thermal": "MEMI steady-state PET (pythermalcomfort), standing 2.3 met, 0.9 clo; body-projected solar MRT with ISO 7726 absorptivity",
        },
        "prepared_at": datetime.now(tz=ZoneInfo("UTC")).isoformat(),
    }
    temporary = folder / "manifest.json.tmp"
    temporary.write_text(json.dumps(metadata, indent=2))
    temporary.replace(manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Rebuild an existing study")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(prepare(force=args.force))


if __name__ == "__main__":
    main()
