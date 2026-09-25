"""Read-only live API for prepared CoolPaths studies."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path as ApiPath, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .prepare import DATA_ROOT, STUDY_DATE
from .routing import Router, RouteError
from . import explore


app = FastAPI(title="CoolPaths routing API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_cache = {"manifest_mtime": None, "graph": None, "manifest": None, "hours": {}}


class RouteRequest(BaseModel):
    origin: list[float] = Field(min_length=2, max_length=2)
    destination: list[float] = Field(min_length=2, max_length=2)
    hour: int = Field(ge=8, le=20)


class SnapRequest(BaseModel):
    point: list[float] = Field(min_length=2, max_length=2)
    hour: int = Field(ge=8, le=20)


def study_folder() -> Path:
    return DATA_ROOT / STUDY_DATE.isoformat()


def current_study() -> tuple[dict, dict]:
    folder = study_folder()
    manifest_path = folder / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(503, "CoolPaths study is not prepared; run python -m coolpaths.prepare")
    mtime = manifest_path.stat().st_mtime_ns
    if _cache["manifest_mtime"] != mtime:
        _cache["manifest"] = json.loads(manifest_path.read_text())
        _cache["graph"] = json.loads((folder / "graph.json").read_text())
        _cache["hours"] = {}
        _cache["manifest_mtime"] = mtime
    return _cache["manifest"], _cache["graph"]


def hourly_pet(hour: int) -> dict[str, float]:
    manifest, _ = current_study()
    if str(hour) not in manifest["hours"]:
        raise HTTPException(404, f"PET at {hour:02d}:00 is not available")
    if hour not in _cache["hours"]:
        path = study_folder() / f"edge_pet_{hour:02d}.json"
        if not path.is_file():
            raise HTTPException(503, f"Street PET for {hour:02d}:00 is missing")
        payload = json.loads(path.read_text())
        _cache["hours"][hour] = payload.get("values", payload)
    return _cache["hours"][hour]


@app.get("/api/coolpaths/status")
def status():
    try:
        manifest, _ = current_study()
    except HTTPException as exc:
        return {"location_id": os.environ.get("MR_LOCATION_ID"), "ready": False, "message": exc.detail, "study_date": STUDY_DATE.isoformat()}
    return {**manifest, "ready": True, "location_id": os.environ.get("MR_LOCATION_ID")}


@app.get("/api/coolpaths/raster/{hour}.png")
def raster(hour: Annotated[int, ApiPath(ge=8, le=20)]):
    current_study()
    path = study_folder() / f"pet_{hour:02d}.png"
    if not path.is_file():
        raise HTTPException(404, "PET raster is missing")
    return FileResponse(path, media_type="image/png")


@app.get("/api/coolpaths/streets/{hour}")
def streets(hour: Annotated[int, ApiPath(ge=8, le=20)]):
    manifest, graph = current_study()
    values = hourly_pet(hour)
    features = []
    seen = set()
    for edge in graph["edges"]:
        edge_id = edge["id"]
        if edge_id not in values:
            continue
        # Walking graphs contain both directions. Draw one geometry per path.
        shape_key = (min(edge["u"], edge["v"]), max(edge["u"], edge["v"]))
        if shape_key in seen:
            continue
        seen.add(shape_key)
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": edge["coordinates"]},
            "properties": {"id": edge_id, "name": edge["name"],
                           "highway": edge["highway"], "pet": values[edge_id]},
        })
    return {"type": "FeatureCollection", "features": features,
            "properties": {"hour": hour, "study_date": manifest["study_date"],
                           "mean_pet_c": manifest["hours"][str(hour)]["mean_pet_c"]}}


@app.post("/api/coolpaths/route")
def route(request: RouteRequest):
    _, graph = current_study()
    values = hourly_pet(request.hour)
    try:
        result = Router(graph, values).route(request.origin, request.destination)
    except RouteError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"study_date": STUDY_DATE.isoformat(), "hour": request.hour, **result}


@app.post("/api/coolpaths/snap")
def snap(request: SnapRequest):
    _, graph = current_study()
    values = hourly_pet(request.hour)
    try:
        router = Router(graph, values)
        node, distance = router.snap(request.point)
    except RouteError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"coordinate": graph["nodes"][node], "snap_distance_m": round(distance, 1)}


@app.get("/api/coolpaths/layers")
def layers(hour: Annotated[int, Query(ge=8, le=20)] = 14):
    manifest, _ = current_study()
    hourly_pet(hour)
    return explore.catalog(manifest, hour)


@app.get("/api/coolpaths/buildings")
def input_buildings():
    current_study()
    try:
        return explore.buildings(study_folder(), _cache["manifest_mtime"])
    except FileNotFoundError as exc:
        raise HTTPException(404, "Prepared building geometry is unavailable") from exc


@app.get("/api/coolpaths/layers/{name}/{hour}.png")
def input_raster(name: str, hour: Annotated[int, ApiPath(ge=8, le=20)]):
    manifest, _ = current_study()
    hourly_pet(hour)
    try:
        path = explore.render_layer(study_folder(), _cache["manifest_mtime"], manifest, name, hour)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(path, media_type="image/png")


@app.post("/api/coolpaths/inspect")
def inspect(request: SnapRequest):
    manifest, _ = current_study()
    hourly_pet(request.hour)
    try:
        return explore.inspect_point(study_folder(), _cache["manifest_mtime"], manifest,
                                     request.point, request.hour)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/coolpaths/demo-route/{hour}")
def demonstration_route(hour: Annotated[int, ApiPath(ge=8, le=20)]):
    manifest, graph = current_study()
    try:
        return {"hour": hour, **explore.demo_route(graph, hourly_pet(hour), manifest)}
    except RouteError as exc:
        raise HTTPException(400, str(exc)) from exc
