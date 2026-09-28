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
