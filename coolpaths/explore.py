"""Map-ready views and point samples of the actual prepared study products."""
from __future__ import annotations

from datetime import datetime
from functools import lru_cache
import math
from pathlib import Path
import tempfile

import geopandas as gpd
import numpy as np
from PIL import Image
import pvlib
from pyproj import Transformer
import rasterio
from rasterio.features import rasterize
from rasterio.warp import calculate_default_transform, reproject, Resampling
from shapely.geometry import box, Point
from shapely.ops import transform as transform_geometry

from .prepare import local_tree_heights
from .routing import Router, RouteError

# Fixed scales keep comparisons between hours meaningful. Transparent pixels
# indicate missing data (or absence of canopy/water/shade for those masks).
LAYERS = {
    "canopy": ("Tree canopy", "m", [0, 5, 15, 30], ["#d9f99d", "#86efac", "#16a34a", "#14532d"], "Meta canopy height + local tree measurements"),
    "ndvi": ("Vegetation (NDVI)", "index", [-0.2, 0.3, 0.8], ["#d6b38a", "#b9d88c", "#166534"], "Sentinel-2 surface reflectance via Earth Engine"),
    "water": ("Water", "mask", [0, 1], ["#38bdf8", "#38bdf8"], "ESA WorldCover v200 via Earth Engine"),
    "terrain": ("Ground elevation", "m", [0, 30, 60, 100], ["#164e63", "#5eead4", "#d9f99d", "#fef3c7"], "Local DEM + NASA SRTM"),
    "albedo": ("Surface reflectivity", "fraction", [0.05, 0.15, 0.25], ["#334155", "#94a3b8", "#f8fafc"], "Surface classes derived from buildings, vegetation and water"),
    "shade": ("Cast shadows", "mask", [0, 1], ["#6366f1", "#6366f1"], "Hourly building and tree shadows on the prepared DSM"),
    "svf": ("Sky view", "fraction", [0, 0.5, 1], ["#312e81", "#a78bfa", "#fef3c7"], "Fraction of visible sky estimated from the DSM"),
    "direct": ("Direct sunlight", "W/m²", [0, 250, 500, 750], ["#312e81", "#c084fc", "#fb923c", "#fef08a"], "Clear-sky irradiance with buildings and canopy transmission"),
    "mrt": ("Mean radiant temperature", "°C", [15, 30, 45, 60], ["#38bdf8", "#a7f3d0", "#fb923c", "#dc2626"], "Modeled radiation received by a standing person"),
    "pet": ("Physiological equivalent temperature", "°C PET", [20, 24, 30, 36, 44], ["#22d3ee", "#10b981", "#facc15", "#fb923c", "#ef4444"], "MEMI PET using prepared MRT and NASA POWER weather"),
}


def raster_name(name: str, hour: int) -> str:
    if name in {"pet", "mrt", "shade", "direct", "diffuse"}:
        return f"{name}_{hour:02d}.tif"
    return {"terrain": "dem.tif", "canopy": "ee_canopy.tif",
            "ndvi": "ee_ndvi.tif", "water": "ee_water.tif"}.get(name, f"{name}.tif")


@lru_cache(maxsize=16)
def building_frame(folder: str, version: int):
    path = Path(folder) / "buildings.gpkg"
    if not path.is_file():
        raise FileNotFoundError("Prepared building geometry is unavailable")
    return gpd.read_file(path)


@lru_cache(maxsize=18)
def raster_data(folder: str, version: int, name: str, hour: int):
    path = Path(folder) / raster_name(name, hour)
    if not path.is_file():
        raise FileNotFoundError(f"Prepared {name} data is unavailable")
    with rasterio.open(path) as src:
        array = src.read(1, masked=True).astype(np.float32).filled(np.nan)
        affine, crs = src.transform, src.crs
    if name == "canopy":
        array = np.maximum(np.nan_to_num(array), local_tree_heights(affine, array.shape))
    return array, affine, crs


def catalog(manifest: dict, hour: int) -> dict:
    west, south, east, north = manifest["bounds"]
    solar = pvlib.solarposition.get_solarposition(
        datetime.fromisoformat(manifest["hours"][str(hour)]["utc"]),
        (south + north) / 2, (west + east) / 2).iloc[0]
    return {
        "layers": {name: {"title": spec[0], "unit": spec[1], "stops": spec[2],
                           "colors": spec[3], "source": spec[4]}
                   for name, spec in LAYERS.items()},
        "sun": {"azimuth_deg": round(float(solar["azimuth"]), 1),
                "elevation_deg": round(float(solar["apparent_elevation"]), 1)},
        "hour": hour,
    }


def buildings(folder: Path, version: int) -> dict:
    frame = building_frame(str(folder), version).to_crs("EPSG:4326")
    import json
    return json.loads(frame[["height_m", "source", "geometry"]].to_json())


def render_layer(folder: Path, version: int, manifest: dict, name: str, hour: int) -> Path:
    if name not in LAYERS:
        raise ValueError("Unknown input layer")
    if name == "pet":
        path = folder / f"pet_{hour:02d}.png"
        if not path.is_file():
            raise FileNotFoundError("Prepared PET raster is unavailable")
        return path
    destination = folder / "explore" / f"{name}_{hour}_{version}.png"
    if destination.is_file():
        return destination
    data, affine, crs = raster_data(str(folder), version, name, hour)
    data = data.copy()
    # Show exactly the processing extent, without rectangular projection corners.
    project = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform
    polygon = transform_geometry(project, box(*manifest["bounds"]))
    inside = rasterize([(polygon, 1)], out_shape=data.shape, transform=affine).astype(bool)
    data[~inside] = np.nan
    if name in {"canopy", "water", "shade"}:
        data[data <= (0.1 if name == "canopy" else 0.5)] = np.nan
    height, width = data.shape
    left, top = affine * (0, 0)
    right, bottom = affine * (width, height)
    target_affine, tw, th = calculate_default_transform(crs, "EPSG:3857", width, height,
                                                       left, bottom, right, top)
    output = np.full((th, tw), np.nan, dtype=np.float32)
    reproject(data, output, src_transform=affine, src_crs=crs, src_nodata=np.nan,
              dst_transform=target_affine, dst_crs="EPSG:3857", dst_nodata=np.nan,
              resampling=Resampling.nearest if name in {"water", "shade"} else Resampling.bilinear)
    _, _, stops, colors, _ = LAYERS[name]
    rgb = [[int(color[i:i+2], 16) for i in (1, 3, 5)] for color in colors]
    channels = [np.interp(output, stops, [color[i] for color in rgb]) for i in range(3)]
    rgba = np.stack([*channels, np.where(np.isfinite(output), 205, 0)], axis=-1)
    destination.parent.mkdir(exist_ok=True)
    # Concurrent clients only ever see a complete image.
    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".png", delete=False) as file:
        temporary = Path(file.name)
    try:
        Image.fromarray(np.nan_to_num(rgba).astype(np.uint8)).save(temporary)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def sample_raster(folder: Path, version: int, name: str, hour: int, point: list[float]):
    data, affine, crs = raster_data(str(folder), version, name, hour)
    x, y = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform(*point)
    row, col = rasterio.transform.rowcol(affine, x, y)
    if not (0 <= row < data.shape[0] and 0 <= col < data.shape[1]):
        return None
    value = float(data[row, col])
    return round(value, 3) if math.isfinite(value) else None


def inspect_point(folder: Path, version: int, manifest: dict, point: list[float], hour: int):
    if len(point) != 2 or not all(math.isfinite(v) for v in point):
        raise ValueError("Choose a finite longitude and latitude")
    west, south, east, north = manifest["bounds"]
    if not (west <= point[0] <= east and south <= point[1] <= north):
        raise ValueError("Choose a location inside the prepared study area")
    samples = {}
    missing = []
    for name in ["pet", "mrt", "shade", "svf", "canopy", "ndvi", "water", "terrain", "albedo", "direct", "diffuse"]:
        try:
            samples[name] = sample_raster(folder, version, name, hour, point)
        except FileNotFoundError:
            samples[name] = None
            missing.append(name)
    frame = building_frame(str(folder), version)
    coordinate = Point(*Transformer.from_crs("EPSG:4326", frame.crs, always_xy=True).transform(*point))
    hits = frame.iloc[frame.sindex.query(coordinate, predicate="intersects")]
    building = None if hits.empty else {"height_m": float(hits.iloc[0].height_m),
                                        "source": str(hits.iloc[0].source)}
    if building:
        for name in ("pet", "mrt", "shade", "svf"):
            samples[name] = None
        explanation = "Building footprint: walking PET is not modeled inside buildings."
    elif (samples["water"] or 0) > 0.5:
        samples["pet"] = samples["mrt"] = None
        explanation = "Water surface: walking PET is not modeled here."
    elif samples["pet"] is None:
        explanation = "No walking PET value is available in this cell."
    else:
        explanation = "Sample of the prepared 2 m cell; weather represents the NASA POWER area."
    return {"point": point, "hour": hour, "values": samples, "building": building,
            "weather": manifest["hours"][str(hour)], "message": explanation,
            "missing_layers": missing}


def demo_route(graph: dict, values: dict, manifest: dict) -> dict:
    router = Router(graph, values)
    west, south, east, north = manifest["bounds"]
    center = [(west + east) / 2, (south + north) / 2]
    # Select a connected 900 m example from this graph, then calculate it live.
    if not router.walkable_nodes:
        raise RouteError("No prepared walking network is available")
    destination = min(router.walkable_nodes,
                      key=lambda n: (graph["nodes"][n][0] - center[0]) ** 2 +
                                    (graph["nodes"][n][1] - center[1]) ** 2)
    reachable = router.remaining_distances(destination)
    candidates = [node for node, distance in reachable.items() if distance > 200]
    if not candidates:
        raise RouteError("No connected demonstration walk is available")
    origin = min(candidates, key=lambda n: abs(reachable[n] - 900))
    return {"example": True, **router.route(graph["nodes"][origin], graph["nodes"][destination])}
