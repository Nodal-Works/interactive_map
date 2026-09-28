# Shared performance backport — 28 September 2026

Selective backport from Universeum `ef5b684` (primarily `d3be206`) to main and Lindholmen.

## Changes

- Coalesce bird redraw requests during map gestures and cancel their loop on stop.
- Cache transit symbols and projected history, batch trail strokes, and make interpolation time based.
- Reuse wind facade paths, preserving each branch's halo colours and widths.
- Draw wind and runoff in OffscreenCanvas workers with bounded in-flight frames, transferable bitmaps, stale-result guards and runoff buffer reuse. Runoff simulation remains on the main thread.
- Run Isovist geometry in a worker with spatial indexes and latest-request handling. Preserve polygon holes and latitude-aware bounds; use point circles for background tree canopies. Do not overwrite the shared building source.
- Share animation scheduling across the migrated layers; suspend scheduled callbacks while hidden. Use elapsed/fixed-step timing for birds, Street Life and sun playback.
- Preserve existing map/canvas geometry, project data, credentials, calibration, Artwork and Windows launchers. No second map renderer or Universeum exhibit layout is introduced.
- Preserve sibling click-capture listeners used by Artwork when routing registered layer toggles.

Browsers without OffscreenCanvas retain canvas drawing. If a wind simulation worker fails at a resolution above 100, stop with an explicit error instead of silently changing the selected resolution. Isovist requires a functioning worker and reports failure through the layer lifecycle.

## Validation

Run from the checkout root:

```sh
node scripts/test_performance_backport.cjs
node scripts/test_performance_runtime.cjs
node scripts/test_performance_workers.cjs
node scripts/test_cfd_simulation.cjs
node scripts/test_cfd_visuals.cjs
node scripts/test_transit.cjs
node scripts/test_ferry_wake.cjs
node scripts/test_street_life.cjs
node scripts/test_app_config.cjs
node scripts/test_ecom_lifecycle.cjs
node scripts/test_session.cjs
node scripts/test_session_connection.cjs
node scripts/test_slideshow.cjs
node scripts/test_slideshow_raster.cjs
python scripts/test_dem_flow.py
```

The last command requires the existing NumPy/rasterio preparation environment and supplies the independent fixture to `test_stormwater_flow.cjs`; that JS test is not a standalone command.

Browser smoke checks cover activation and stopping of migrated layers and Lindholmen Artwork switching. These are functional checks on the development Mac, not Windows GPU performance measurements. Some provider imagery/credentials are unavailable in isolated test checkouts. Measure actual frame times on the Latitude before claiming an FPS improvement.


## Additional main-branch rendering optimizations

- Street glow retains native Path2D objects for the existing sampled roads. Map
  movement, resize, canvas alignment and replacement GeoJSON invalidate them.
  Colours, pulses, glow, line widths, sampling and draw order are unchanged.
- Street Life reads the map and canvas rectangles once per draw, sharing them
  across vehicles, pedestrians, buildings and lights. The cache is cleared even
  if drawing throws; projections outside the draw read current layout.
- Video slides use requestVideoFrameCallback when available, drawing each newly
  decoded frame rather than submitting duplicates at display refresh rate. The
  RAF fallback remains, and slide cancellation cancels either callback API.
- The controller welcome animation stops requesting frames while its panel or
  document is hidden, and resumes with one loop when visible again.

No resolution, antialiasing, shadow, particle-count or frame-rate settings were
reduced. Run `node scripts/test_render_efficiency.cjs` for geometry reuse,
invalidation, video lifecycle and background suspension; run
`node scripts/test_street_life.cjs` for heading and layout-read checks.

Validation on the development Mac:

- Native canvas comparison against the pre-change street-glow renderer using the
  real street-network data: zero differing RGBA bytes at 1250, 7000, 9000 and
  9500 ms, including a camera change before the third frame.
- A 3001-segment fixture avoids 240240 repeated projections over 120 stationary
  frames while preserving sampled endpoints and order. This measures eliminated
  work, not an application FPS gain.
- 16 targeted/existing Node suites pass, covering rendering efficiency, Street
  Life, slideshow, scheduling, workers, backport integration, transit, ferry wake,
  wind visuals, ECOM lifecycle, app config, sessions, connection, mobile Cool Paths,
  Pages client and slideshow raster handling.
- The additional full CFD simulation suite exceeded a 20-second budget after its
  numerical, geometry, lifecycle, worker and supported-resolution checks passed;
  its remaining campus test is not verified by this run.
- Browser smoke check: main map starts, controller connects, dashboard switching
  and return to the welcome panel work without observed console errors.

The five-year-old Dell/Nvidia target has not been benchmarked. To validate that
hardware, use its intended display resolution, open both map and controller,
exercise each layer and the combinations actually used, and record browser
Performance traces during map movement and playback. Include Sun Study, wind,
runoff and video; compare frame times and long tasks before and after these changes.
The exact GPU, screen resolution and simultaneous layers determine remaining
headroom. These optimizations do not establish that every combination is smooth.
