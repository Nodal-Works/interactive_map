#!/usr/bin/env python3
"""
Generate an instanced tree GLB from trees.geojson and the DEM.

Produces a compact GLB file where a single low-poly tree mesh template
is instanced at every tree position.  Each instance is:
  - placed in SWEREF99 TM coordinates (reprojected from WGS84),
  - scaled by tree height,
  - grounded on the DEM terrain surface,
  - normalised into the same local coordinate system used by mesh.stl
    so the sun-study aligns buildings and trees automatically.

Coordinate convention (GLTF / Three.js Y-up):
  glb_x =  (easting  - dem_left)   / dem_max_dim
  glb_y =  elevation               / dem_max_dim
  glb_z = -(northing - dem_bottom) / dem_max_dim

Usage:
  python scripts/generate_trees_glb.py                   # uses defaults
  python scripts/generate_trees_glb.py --output media/trees_instanced.glb
"""

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
import trimesh
from pyproj import Transformer

TO_SWEREF = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)


# ---------------------------------------------------------------------------
# Low-poly tree template (cone crown + cylinder trunk)
# ---------------------------------------------------------------------------

def make_tree_template():
    """Return a low-poly tree mesh ~1 m tall, centred at origin, tip at y=1.

    Trimesh primitives use Z-up, so we build the tree in Z-up
    then rotate -90° around X to convert to GLTF Y-up.
    """
    # Trunk: cylinder from z=0 to z=0.3  (Z-up)
    trunk = trimesh.creation.cylinder(radius=0.04, height=0.3, sections=6)
    trunk.apply_translation([0, 0, 0.15])

    # Crown: cone from z=0.2 to z=1.0  (Z-up)
    crown = trimesh.creation.cone(radius=0.25, height=0.8, sections=8)
    crown.apply_translation([0, 0, 0.6])

    tree = trimesh.util.concatenate([trunk, crown])

    # Rotate from Z-up to Y-up for GLTF: -90° around X
    rot = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
    tree.apply_transform(rot)
    return tree


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate instanced trees GLB.")
    parser.add_argument("--trees", default="media/trees.geojson",
                        help="Path to trees GeoJSON (WGS84 points with height property)")
    parser.add_argument("--dem", default="media/clipped_dem.geotiff.tif",
                        help="Path to DEM GeoTIFF (SWEREF99 TM)")
    parser.add_argument("--output", default="media/trees_instanced.glb",
                        help="Output GLB path")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    trees_path = project_root / args.trees
    dem_path = project_root / args.dem
    out_path = project_root / args.output

    # --- Load trees ---
    print(f"Loading trees from {trees_path} ...")
    with open(trees_path) as f:
        geojson = json.load(f)
    features = geojson["features"]
    print(f"  {len(features)} trees")

    # --- Load DEM ---
    print(f"Loading DEM from {dem_path} ...")
    with rasterio.open(dem_path) as src:
        dem = src.read(1)
        dem_transform = src.transform
        dem_bounds = src.bounds
        dem_shape = dem.shape

    dem_left = dem_bounds.left
    dem_bottom = dem_bounds.bottom
    dem_right = dem_bounds.right
    dem_top = dem_bounds.top

    print(f"  DEM bounds: ({dem_left:.0f}, {dem_bottom:.0f}) – "
          f"({dem_right:.0f}, {dem_top:.0f})")

    # --- Prepare tree template ---
    template = make_tree_template()
    print(f"  Tree template: {len(template.vertices)} verts, {len(template.faces)} faces")

    # --- Build a single merged mesh from all tree instances ---
    # Pre-merging avoids instanced scene-graph nodes so that Three.js
    # GLTFLoader always sees exactly one Mesh when traversing the GLB.
    placed = 0
    skipped = 0
    meshes_to_merge = []

    elev_max = float(np.nanmax(dem))

    for feat in features:
        coords = feat["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]
        height = feat["properties"].get("height", 8.0)
        if height is None or height <= 0:
            height = 8.0
        crown_radius = feat["properties"].get("crown_radius", None)

        # Reproject to SWEREF99 TM
        easting, northing = TO_SWEREF.transform(lon, lat)

        # Skip trees outside DEM bounds
        if not (dem_left <= easting <= dem_right and
                dem_bottom <= northing <= dem_top):
            skipped += 1
            continue

        # Sample DEM elevation at this position
        col_idx = int((easting - dem_transform.c) / dem_transform.a)
        row_idx = int((northing - dem_transform.f) / dem_transform.e)
        col_idx = max(0, min(col_idx, dem_shape[1] - 1))
        row_idx = max(0, min(row_idx, dem_shape[0] - 1))
        ground_elev = float(dem[row_idx, col_idx])

        if np.isnan(ground_elev):
            skipped += 1
            continue

        # Skip trees planted on building barrier cells
        if ground_elev >= elev_max - 1.0:
            skipped += 1
            continue

        # Convert to GLB coordinates matching the buildings STL (Y-up).
        # The buildings STL uses raw SWEREF99 TM values:
        #   x = easting, y = elevation, z = -northing
        # We must match this so sun-study.js can align both meshes
        # using the same buildingsCenter.
        glb_x = easting
        glb_y = ground_elev
        glb_z = -northing

        # Scale: height for Y, crown_radius for lateral (X/Z).
        # Template crown radius is 0.25 m, so lateral scale = crown_radius / 0.25
        scale_y = height
        if crown_radius and crown_radius > 0:
            scale_xz = crown_radius / 0.25
        else:
            scale_xz = height  # fallback: uniform scaling

        # Build 4×4 transform matrix (scale then translate)
        mat = np.eye(4)
        mat[0, 0] = scale_xz
        mat[1, 1] = scale_y
        mat[2, 2] = scale_xz
        mat[0, 3] = glb_x
        mat[1, 3] = glb_y
        mat[2, 3] = glb_z

        # Clone template, apply transform, and collect for merging
        tree_mesh = template.copy()
        tree_mesh.apply_transform(mat)
        meshes_to_merge.append(tree_mesh)
        placed += 1

    print(f"  Placed {placed} trees, skipped {skipped}")

    # Merge all individual tree meshes into a single mesh
    print("  Merging into single mesh...")
    merged = trimesh.util.concatenate(meshes_to_merge)

    # --- Export GLB ---
    print(f"Exporting GLB to {out_path} ...")
    glb_bytes = merged.export(file_type="glb")
    with open(out_path, "wb") as f:
        f.write(glb_bytes)

    size_mb = len(glb_bytes) / (1024 * 1024)
    print(f"  Done — {size_mb:.2f} MB "
          f"({len(merged.vertices)} verts, {len(merged.faces)} faces)")


if __name__ == "__main__":
    main()
