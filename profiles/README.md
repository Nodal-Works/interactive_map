# Preserved presentations

`python -m studio import-legacy campus` and `python -m studio import-legacy lindholmen`
copy the committed presentation assets into separate local packages. They never
check out or change another branch. Original calibration and branding are preserved.
Generated datasets, export archives, provider credentials and logs live under the
ignored `.studio/` directory (override with `MR_STUDIO_HOME`).

Cultural Gravity's curated places are in `lindholmen-cultural-sites.json`.
The reusable animation reads the active package instead of embedding those sites.
Legacy assets remain available even when a new generation attempt fails.

## Universeum

See the [Universeum README](../README-universeum.md) for screenshots and the complete layer and feature list.

`universeum.json` records the source extent in **EPSG:3007**, with easting/northing
axis order. Reproduce the package from the tracked profile:

```sh
.studio/env/bin/python - <<'PY'
import json
from studio.locations import create
p = json.load(open('profiles/universeum.json'))
create(p['id'], p['title'], None, p['layers'], p['resolution'], p['studyDate'],
       projected_bounds=p['sourceBounds'], bounds_crs=p['sourceCrs'], mesh_mode=p['meshMode'], table=p['table'], presentation=p['presentation'])
PY
DTCC_LIDAR_DOWNLOAD_TOTAL_TIMEOUT=900 DTCC_LIDAR_DOWNLOAD_SOCK_READ_TIMEOUT=300 \
  .studio/env/bin/python -m studio generate universeum
.studio/env/bin/python -m studio validate universeum
.studio/env/bin/python -m studio launch universeum
```

Run creation once; generation can resume. The original 3931.2 × 5241.6 m rectangle
is retained for the table outline. Provider rasters/models cover its enclosing
EPSG:3006 rectangle (approximately 4159 × 5410 m), so they can include a small
margin outside the table. Resolution is 2 m, about 5.63 million raster cells.
The photograph is a reference, not a calibrated tile layout. The model footprint is provisionally 320 × 240 cm with 40 cm square tiles;
measure the model and projected image on site before using Projector mode. Thermal comfort requires a separate study date and source
setup; optional source failures never substitute data from another location.

Universeum uses `display` mesh mode: individual source LOD1 buildings plus a terrain
surface. This avoids expensive city-wide footprint conditioning; it is suitable
for display/shadows, not a watertight simulation or printable solid. Other
locations retain the default `conditioned` mode.
