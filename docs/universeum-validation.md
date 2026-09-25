# Universeum validation — 25 September 2026

Branch: `universeum`, created from the existing `dev` working tree. Existing
uncommitted changes were preserved; no commit, push or deployment was performed.

## Extent

Source: SWEREF 99 12 00 / EPSG:3007, easting/northing order.
Minimum `(146087, 6395990)`, maximum `(150018.2, 6401231.6)`.
The exact source rectangle is 3931.2 × 5241.6 m.

WGS84 covering bounds: `[11.934320314774519, 57.68310112498583,
12.0003054870228, 57.73018181877855]`.
EPSG:3006 generation envelope: `[317234.4229699427, 6397389.382141034,
321393.75766030804, 6402799.836630836]`.
Original projected bounds, transformed corners, center and generation envelope
are stored in the recipe. Assets can include the margin around the source
rectangle introduced by the covering provider envelope.

## Verified

- Ten location/pipeline/water tests, including EPSG:3007 corner round trips,
  limits, EPSG:3006 compatibility, projected generation bounds, failure
  preservation and portable package round trips.
- One real-backend display-mesh test checks terrain/building coordinates, heights and missing-geometry rejection.
- Six DEM/flow tests, including Python/browser parity.
- JavaScript configuration/calibration, geographic alignment, location/session,
  session command validation and connection/backpressure tests.
- JavaScript syntax checks and `git diff --check`.
- Downloaded 12,057 building footprints, roads, water and all 12 LiDAR tiles.
- Terrain: EPSG:3006, 2080 × 2706 cells at 2 m; coverage checked within 1 cm
  of DTCC's crop-coordinate rounding.

## Limitations

The table footprint is provisionally 320 × 240 cm with an explicit 8 × 6 grid. The photo's numbered tile layout
has not been reproduced or projector-calibrated. Some buildings lack LiDAR roof
points and use DTCC's minimum-height fallback. The building model is an LOD1
approximation. EPC needs an SSH alias and API port; thermal comfort needs a
study date and configured source access.

## Meshing adjustment

DTCC's city-wide footprint conditioner remained CPU-bound after more than twenty
minutes. A 100-building direct-meshing probe completed in 0.14 seconds after data
preparation. Universeum therefore explicitly selects `meshMode: display`.
All 12,057 LOD1 buildings are triangulated individually and combined with terrain,
producing 865,868 triangles. This preserves the source geometry without globally
merging building footprints. The model is for display/shadows, not a watertight
simulation or printable solid. Other locations default to `conditioned` mode.

## Completed package and browser acceptance

The package passed checksum/geographic validation and is active locally.
All eight geographic stages completed: footprints, roads, water, DEM, mesh,
trees, tree model and stormwater. The package has 17 assets (267.1 MB).
There are 31,578 estimated tree candidates; 31,504 were placed in the 3D tree
model, with 74 excluded by its terrain sampling/placement checks.

Ten common layers are ready. Street View source metadata and transit connections
passed the existing provider checks; these do not certify street-level imagery
coverage everywhere. EPC was unavailable because its SSH alias/API port were
not configured. Thermal comfort is intentionally disabled.

Browser verification at `http://127.0.0.1:8091/index.html` confirmed Universeum
branding text, full-area initial framing, a loaded LOD1/terrain model and rendered
stormwater overlay. Captured console checks reported no warnings or errors.
Numerical model bounds match the terrain within STL float32 precision; this is
not physical projector calibration or a new end-to-end phone-session test.
The app was left open on Sun Study. Services run locally on port 8091.


## Table alignment implementation

The Universeum profile now specifies an 8 × 6 grid and a provisional 320 × 240 cm
model footprint. Preview fits the original source corners with north left and
uniform scale; Projector mode uses measured projected-image dimensions. Existing
presets retain legacy behavior, and new presets retain dimensions, grid counts,
automatic/manual fitting and flipped orientation. No geographic assets were
regenerated. Package checksum validation still passes.

Verification for this change:

- `node scripts/test_table_layout.cjs`: 48 cells; 655.2 m per tile; complete source
  fitting in landscape, portrait and fullscreen-sized viewports; model/raster
  agreement within 2 CSS pixels at corners and interior points after fitting,
  flipping and panning; symbol size minimums; old/new preset resolution; phone
  coordinate conversion and stale/outside gesture rejection.
- `node scripts/test_table_calibration.cjs`: the actual host message handler's
  fit, flip, save, manual navigation, legacy restore, automatic restore and reset.
- Seven location tests, plus existing configuration, georeference, location/session,
  session connection, CFD, slideshow and transit checks passed. Phone-client
  allowlisted build and JavaScript syntax/whitespace checks passed.
- Browser on a separate local verification server: 1280 × 720 display; a shared
  960 × 720 footprint for map/grid, Sun Study, wind, stormwater and Street Life.
  Captured the updated grid, model, wind, stormwater, slideshow and Street Life.
  Saved a test preset and restored both it and the original through the controller.
  Calibration stays focused during live layer updates. No JavaScript errors were
  captured; browser audio autoplay and intermittent transit configuration warnings
  were observed independently of alignment.
- Responsive geometry is covered by automated tests. The in-app browser viewport
  override did not change the map tab's reported size, so no portrait screenshot
  is presented as browser verification. Physical projector alignment still needs
  on-site measurements; no keystone correction or anisotropic geography is applied.

New screenshots use `media/screenshots/universeum/table-fit-*.png`; the earlier
JPEG gallery documents the pre-fix presentation.
