# Wind GPU rendering

The main CFD layer defaults to WebGL2 with automatic Canvas fallback.
`?cfdBackend=canvas2d` selects the reference renderer. The default was enabled at
the user's request after the validation below. No automatic quality reduction
is applied by either backend.

## Pipeline

The visible canvas is transferred once to a persistent WebGL2 worker. Geometry
rebuilds replace field/graphics resources within that worker; they do not transfer
another canvas or present ImageBitmaps. The existing solver is unchanged.

Heat uses velocity and palette textures. Flow uses instanced triangle strokes;
stencil coverage prevents translucent segments from brightening their own joins
and intersections within a colour/opacity bucket. Facade endpoints are uploaded
once, and their three halo strokes preserve the existing bucket and layer order.
Solid-mask clipping applies to heat and flow, before the unmasked facade halo.

Facade exposure runs independently with the same Float64 calculations and
recycled velocity/intensity buffers. Ribbon preparation is pipelined one frame
ahead of presentation; its separate tracing worker refreshes paths at 5 Hz.
Morphing, highlights, speed sampling and wall checks retain the reference model.
Only one preparation job is in flight per worker. GPU submission is bounded to
two outstanding fences; there are no synchronous GPU reads in normal animation.

Ribbon storage reuses points with a fixed property layout. Segment emission
shares colour and coordinate work between base strokes and highlights. The
Canvas reference benefits from these CPU improvements as well.

Settings/controller messages are unchanged. Worker messages carry geometry
generations. Visibility suspends drawing, stop cancels callbacks, and rebuilds
discard stale results. Context restoration recreates GPU resources. Unsupported
or failed GPU initialisation/restoration replaces the transferred canvas and
explicitly reports the Canvas fallback in diagnostics and the console.

## Reproduce validation

```sh
node scripts/test_cfd_gpu.cjs
node scripts/test_cfd_visuals.cjs
node scripts/test_cfd_simulation.cjs
node scripts/test_cfd_profile.cjs
node scripts/test_performance_workers.cjs
node scripts/test_performance_runtime.cjs
node scripts/test_performance_backport.cjs
node scripts/test_render_efficiency.cjs
node scripts/test_table_layout.cjs
python scripts/benchmark_demo.py --ref working --port 8098
```

Open the benchmark's `index.html?cfdBackend=webgl2` at 1920×1080/DPR 1, confirm
the Quadro renderer and a 2283×1368 wind canvas, and choose **Run wind acceptance
sequence**. It warms the live solver, runs three 60-second samples for each style,
then a ten-minute ribbon sample. Keep the page visible and do not run other CPU
benchmarks concurrently. Results append to `.runtime/benchmarks/8098.jsonl`.
The acceptance button dismisses the startup veil before warming the scene.

**Test wind GPU recovery** deliberately loses/restores the graphics context.
`scripts/cfd-render-comparison.html` runs sixteen seeded, real-browser pixel
comparisons spanning both styles, every palette and glow enabled/disabled.
The comparison uses premultiplied colour differences; tolerances allow minor
antialiasing differences (mean channel error below 2/255, under 2% of pixels
with a channel difference above 32/255). It is not a pixel-identity claim.

Diagnostics distinguish browser callbacks, render submissions, GPU fence
completions and newly prepared ribbon geometry. GPU time uses optional disjoint
timer queries. Interval histograms cover the entire sample, while detailed
stage summaries retain the most recent 2,000 samples. Hidden intervals and
diagnostic solver pauses invalidate acceptance.

GPU completion is not proof that every image reached the physical display.
Compositor traces remain a separate acceptance requirement. The available
in-app browser automation exposes screenshots and console logs, but no graphics
trace capture API.

## Validation results

On 29 September 2026, the confirmed NVIDIA Quadro RTX 3000 / ANGLE D3D11
completed all six minute-long runs at approximately 60 GPU frames/sec. Particle
runs recorded no intervals above 33.3 ms. Ribbon geometry advanced at 59.56–59.70
updates/sec. All six p95 frame intervals were 16.8 ms.

The ten-minute ribbon run finished in **Flow settled** at 60.003 GPU frames/sec,
59.195 newly prepared ribbon updates/sec, 16.8 ms p95, and zero intervals above
33.3 ms. The solver stayed live, all quality settings matched the target, and
there were no hidden frames. Main-thread JS heap changed from 23.63 to 26.62 MB;
the canvas count remained 12. Worker/native/GPU memory was not measured, so this
is not a leak-free-operation certification.

The startup veil remained over the map during the six short runs and the first
part of the sustained run; it was dismissed during the latter. Wind continued
drawing beneath that translucent overlay. These measurements validate GPU work
and animation preparation, not unobstructed physical display presentation.

A subsequent unobstructed 60-second ribbon run on the final renderer recorded
60.015 GPU frames/sec, 59.348 fresh geometry updates/sec, 16.8 ms p95, and zero
intervals above 33.3 ms, with live developing flow and the full target settings.
Wind plus stormwater recorded 37.003 GPU frames/sec and 50 ms p95. That combined
scenario remains below 60 fps and is outside the wind-alone acceptance target.

[Raw measurements](benchmarks/wind-gpu-2026-09-29.json) preserve all nine measured
runs, historical Canvas results, and the final raster comparison results.
The Canvas baseline is historical: a fresh baseline server could not launch its
Git subprocess because of a local permission error. It is not a fresh controlled
before/after trace comparison. [Visual evidence](benchmarks/wind-render-comparison.png)
shows the seeded Canvas/WebGL comparison.

All sixteen real-browser raster comparisons passed; the worst mean channel
error was 1.735/255. Actual context loss/restoration resumed GPU rendering without
fallback or console errors. Numerical, campus, visual, lifecycle, worker,
scheduler, table-layout and rendering-efficiency regressions passed.

The initial sequence called ribbon preparation time `traceMs`; final diagnostics
separate `ribbonPrepareMs` from the 5 Hz trace-worker `traceMs`. Its renderer
architecture is otherwise the same, with subsequent guards for stale worker
errors, required antialiasing, cache versions and retained style-switch phase.

Compositor/physical-presentation verification remains outstanding despite
enabling WebGL2 by default. This is a measured GPU throughput improvement, not a claim that
every submitted image was displayed on the projector.
