# Stormwater persistent canvas (29 September 2026)

Stormwater now transfers its visible canvas once to the drawing worker before
acquiring a context. The worker draws on its animation clock and retains the
canvas across toggles and resizes. Only reusable particle data returns to the
host: the default path creates no per-frame ImageBitmap and has no host image
presentation call. Simulation, density, glow sprites and drawing commands are
unchanged. There is still one particle-data request in flight at a time.

Generation and resize revisions reject stale results. A worker failure replaces
the transferred canvas, preserving DOM attributes and styling, and resumes the
main-thread Canvas renderer. Unsupported transfer uses the bitmap compatibility
path. `?stormwaterBackend=bitmap` explicitly selects that reference path.
Diagnostics report `stormwaterRenderer.backend` and any fallback reason.

## Measurements

The Quadro RTX 3000 combined wind/rain scene used the same 1920x1080/DPR1 viewport
and 2283x1368 wind surface as the wind report, with full-quality ribbons and live
physics. Thirty-second samples gave:

| Stormwater path | Wind GPU completions/sec | Wind p95 interval | Stormwater submission cadence at sample end |
|---|---:|---:|---:|
| Bitmap reference | 38.61 | 50 ms | 22.1 Hz |
| Persistent, worker animation clock | 38.66 | 50 ms | 23.3 Hz |

This is effectively unchanged combined wind throughput, not a demonstrated fps
speedup or 60 fps result. Random particle scenes and developing field sequences
were not replayed identically. The initial persistent version, drawing directly
on message arrival, regressed to about 31 fps; scheduling drawing on the worker
animation clock removed that regression. Raw records retain those exploratory
runs as well: [measurements](benchmarks/stormwater-persistent-2026-09-29.json).

The removed bitmap handoff was not the dominant remaining bottleneck under these
conditions. Persistent ownership removes that overhead, but Canvas rasterisation
and combined-layer contention need separate profiling before further changes.
Counts describe submissions/GPU completions, not verified physical presentation.

## Validation

Passed worker drawing-command equivalence for both paths, reusable particle
buffers, animation-clock pacing, cancellation, stale generations/revisions,
restart without a second transfer, resize and projection, replacement-canvas
fallback, scheduler, rendering efficiency and table-layout tests. Browser
restart/resize and the combined scene had no rendering errors.

The Python DEM parity suite could not run because this runtime lacks `rasterio`.
No hydrology algorithm was changed. [Browser screenshot](benchmarks/stormwater-persistent.png).

Commands:

```
node scripts/test_stormwater_renderer.cjs
node scripts/test_performance_workers.cjs
node scripts/test_performance_runtime.cjs
node scripts/test_performance_backport.cjs
node scripts/test_render_efficiency.cjs
node scripts/test_table_layout.cjs
```
