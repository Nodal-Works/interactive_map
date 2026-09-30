# Main demo repair validation — 28 September 2026

## Delivery state

Code repairs are implemented and regression-tested. This is **not yet a fully validated working installation**: ECOM demand data and the prepared CoolPaths campus study have not been recovered, and the elapsed four-hour soak contains only about three hours of valid visible-display samples. No synthetic demand or substitute thermal study has been introduced.

Checkpoints: `d2e49d2` geographic alignment; `6d13fb6` audio/EPC; `4a91890` dataset readiness and supervisor; `11b8fb2` presentation, Canvas and invitations. `a83ca97` adds the lifecycle/performance validation fixes, including bird initialization after map load, the calibration preview, Sun Study camera orientation, audio cleanup, stale runoff frames and bounded session history.

## Measured display performance

Windows hardware reports an i7-10875H, Intel UHD and Quadro RTX 3000. The test browser actually uses **Intel UHD / ANGLE D3D11**. These are 30-second requestAnimationFrame samples at 1920×1080, device pixel ratio 1, without autoplay bypass flags. They do not prove projector alignment or performance in a different browser/GPU configuration.

| Run | Frame rate | Mean frame interval | p95 interval | JS heap start → end |
| --- | ---: | ---: | ---: | ---: |
| Original Street Life + transit | 57.17 FPS | 17.49 ms | 17.0 ms | 16.56 → 20.70 MB |
| Updated Street Life + transit | 60.00 FPS | 16.67 ms | 16.8 ms | 24.29 → 25.66 MB |
| Updated bird sounds | 60.00 FPS | 16.67 ms | 16.8 ms | 23.00 → 23.79 MB |
| Original wind | 6.23 FPS | 160.57 ms | 183.4 ms | 21.60 → 21.92 MB |
| Updated wind, calibrated full footprint | 4.03 FPS | 247.92 ms | 283.2 ms | 23.15 → 22.77 MB |
| Original runoff | 10.00 FPS | 99.99 ms | 133.4 ms | 42.83 → 69.80 MB |
| Updated runoff, calibrated full footprint | 8.62 FPS | 116.01 ms | 133.4 ms | 137.28 → 45.23 MB |

Wind/runoff canvas submission rates were about 6.2/9.4 Hz. Neither meets 60 FPS. The corrected geographic footprint is larger than the previous centered rectangle (about 2283×1368 at the test calibration), so the before/after wind comparison includes the necessary alignment correction. Wind main-thread callbacks averaged about 0.11 ms and runoff about 9.26 ms; neither sample contained a main-thread long task. GPU/compositing and worker work remain limiting factors. Heap differences across short samples include garbage collection and are not leak measurements.

Particle counts, simulation resolution, drawing resolution and effects are unchanged. Cached bird projections and Street Life path angles avoid repeated geometry work. Worker bitmaps use direct presentation where supported; no extra 2D display copy is required. The 2D compatibility path remains available. Session history retains up to 2,000 events within an estimated 8 MiB, records omitted counts, and keeps the final state. Undo retains 100 edits per participant. Service logs rotate at 5 MiB with two backups.

## Validation evidence

- Geometry tests: affine projection/inverse, translation, rotation, scale; calibrated DEM rainfall and barrier collisions, plus independent Python/browser D8 parity.
- Lifecycle tests: bird audio completion, pending-download cancellation and autoplay prompt; EPC popup replacement/cleanup; Canvas basemap restoration; single Sun Study initialization and cancellation; worker stale-frame revision and transfer/buffer recycling.
- Existing suites: CFD numerical/geometry/worker/lifecycle/resolution/campus cases, visual fidelity, Street Life 1,440 orientation cases, shared scheduler, slideshow category/raster lifecycle, ECOM lifecycle, CoolPaths phone controls, session protocol and Pages client checks.
- Backend suites: ECOM demand path/input validation, CoolPaths core/explore/readiness (including file removal), supervisor portability/readiness, session server and Pages builder tests.
- Browser: all three bird recordings appeared as active after Start, controller toggles worked, the generated campus invitation reached the published GitHub Pages client, Controller 1 joined, and its bird command reached the display.
- Browser: table/grid/slideshow CSS transforms and dimensions match after upward movement and rotation. A satellite image slide loaded at that transformed footprint. Sun Study was visually checked after correcting camera orientation. Physical projection against the printed model is not remotely verifiable.

Reproducible diagnostics: `python scripts/benchmark_demo.py --ref working --port 8095`, with the usual Windows services running. Use the Start gesture and measurement/soak buttons. Baseline uses `--ref 8861426898f33d0da1e358bf3373c5f316f7b4ff --port 8094`. Set `MR_GIT` if Git is not on PATH. Results are local `.runtime/benchmarks/*.jsonl`. Keep the measured display tab visible; samples with hidden frames are invalid. Diagnostics are not injected into the normal launcher.

## Missing real data

Restore the Mac's `interactive_map/media/ecom/energy_data` into the same ignored directory on Windows, or set `ECOM_DEMAND_DIR` to its local directory. Spaces and accented filenames are supported. The campus definition requires the following files:

- `07.01_Fysik_origo_2022.csv`
- `07.05_IT_2022.csv`
- `07.21_HC_2022.csv`
- `07.22_HA_2022.csv`
- `07.23_SB2_2022.csv`
- `07.24_Edit_2022.csv`
- `07.25_HB_2022.csv`
- `07.26_SB1_2022.csv`
- `07.27_SB3_2022.csv`
- `07.28_Maskinteknik_2022.csv`
- `07.40_Gamla_matte_2022.csv`
- `07.44_AWL_2022.csv`
- `07.888_Lokalkontor_2022.csv`
- `CA-Huset_2022.csv`
- `CSB_Chabo_2022.csv`
- `CSB_Gibraltarvallen_guesthouse_2022.csv`
- `CSB_Holtermansgatan_2022.csv`
- `Elkraftteknik_2022.csv`
- `Emils_kårhus_2022.csv`
- `JSP_2022.csv`
- `Kårhus_entré_2022.csv`
- `Kårresturangen_2022.csv`
- `MC2_2022.csv`
- `Nya_Matte_2022.csv`
- `Reaktorfysik_2022.csv`
- `Teknikparken_2022.csv`
- `Vasa_10_2022.csv`
- `Vasa_11_2022.csv`
- `Vasa_12_2022.csv`
- `Vasa_13_2022.csv`
- `Vasa_15_2022.csv`
- `Vasa_1_2022.csv`
- `Vasa_4_2022.csv`
- `Vasa_7_2022.csv`
- `Vasa_8_2022.csv`
- `Vasa_9_2022.csv`
- `electricity_2022.csv`

Restore the Mac's complete `interactive_map/coolpaths/data` directory, including the campus date folder and its manifest, graph, hourly PET edge JSON/PNG/TIFF products, MRT, shade, direct/diffuse radiation, buildings and terrain/canopy/NDVI/water/albedo/SVF rasters. The API reports the exact missing products together. Preparing a replacement through the existing pipeline currently stops because `COOLPATHS_EE_KEY_FILE` is not configured. Real routing, hourly inspection, tour and ECOM calculation remain blocked until those inputs arrive.

The Windows Taildrop receiver is waiting in `.runtime/transfers`; no files have arrived. SSH reaches the Mac through Tailscale but requires interactive authentication. No password was requested in chat. Private data and credentials must remain outside Git.

## Endurance follow-up

The in-chat follow-up `finish-main-demo-validation` checks hourly, inspects completed samples and any received Mac archive, and will finish validation and the authorized push. Main commits have not yet been pushed. Keep the PC and Codex running. The benchmark browser has a temporary 1920×1080 override for the ongoing test; reset it when the soak is finished. Do not equate elapsed time with a successful soak: require the completion record, valid visible samples, layer-state checks and resource trends.

### First follow-up: interrupted test and restart

At 22:05 UTC, only the first three cycle samples existed and the browser had no open tabs. The temporary test tab had been cleaned up when the previous turn ended; this is not a successful endurance run or evidence of a map crash. Restarted at `2026-09-28T22:07:20.859Z` with the tab explicitly retained for subsequent turns. The diagnostics now write start/completion records and attach a run identifier to every soak sample, so the interrupted run cannot be combined with the replacement. Each follow-up must mark the existing tab for handoff again. Expected completion is around 04:07 Stockholm time on 29 September. No Mac data has arrived; push remains pending.

### Second follow-up: background samples are invalid

At 23:05 UTC the retained tab was still alive and had reached cycle 49, with no reported registered-layer errors or new Mac files. However, all 43 completed samples inspected at the start of this check had hidden frames and zero rendered-frame samples. The browser had also reverted to 1280×720 between turns. These samples provide no valid full-resolution performance evidence and cannot satisfy the requested four-hour visible-display soak. DOM/canvas counts stayed at 318/12 in the inspected tail; this alone is not proof of leak-free operation.

The existing run was left intact, and browser visibility was explicitly enabled. The live DOM then reported visible and 1920×1080. Future checks must inspect each sample's visibility, viewport and run identifier; do not assume these settings survive a turn. If the remaining samples stay invalid, report the browser test limitation rather than claiming a completed endurance pass or repeatedly restarting without evidence that the cause is resolved.

### Completed run assessment — 29 September 2026

Run `2026-09-28T22:07:20.859Z` has a matching completion record at `2026-09-29T02:08:00.114Z`: 14,439,254 ms elapsed and 231 scheduled cycles. Of 226 recorded samples, 182 were visible at 1920×1080 and 44 were invalid. Valid samples span 23:06:47–02:07:51 UTC. This is **not a successful four-hour visible-display soak**. The temporary viewport override was reset after completion.

All valid samples held 318 DOM nodes and 12 canvases. No registered-layer errors or main-thread long tasks were recorded. End-of-sample JS heap ranged approximately 46–95 MB with garbage collection; idle median heap over the first/last five idle samples was 56.39/54.04 MB. There is no progressive idle heap, DOM or canvas growth in these observations; GPU/native memory and audio hardware output were not measured, so this does not establish leak-free permanent operation.

| Case | Valid samples | Median FPS | First/last five sample median FPS |
| --- | ---: | ---: | ---: |
| Birds | 22 | 60.00 | 60.00 / 59.97 |
| Wind | 23 | 4.15 | 4.22 / 4.16 |
| Runoff | 23 | 8.87 | 8.82 / 11.20 |
| Sun Study | 23 | 60.00 | 60.00 / 60.00 |
| Slideshow | 23 | 60.00 | 60.00 / 60.00 |
| Wind + runoff | 23 | 3.02 | 3.05 / 3.02 |
| Idle | 22 | 60.00 | 60.00 / 60.00 |

Grid cycles also recorded 60 FPS, but the grid automatically ends before the 20-second sampling delay; these are cleanup/idle observations, not sustained grid rendering evidence. Registered states confirmed wind/runoff ready during their combination samples. Sun and slideshow are outside that registry, so their FPS alone does not prove every visual effect remained correct. The repeated switching exercise showed no progressive frame-rate decline in the measured cases. Visual quality and simulation density remain unchanged; the 60 FPS target is unmet for the computational layers on the GPU selected by this browser.

No Mac archive arrived. ECOM calculations and CoolPaths routing/hour changes/inspection/tour with real inputs remain unvalidated. Service recovery is regression-tested but a live interruption/recovery exercise remains outstanding. Physical projector calibration and a complete visible four-hour run remain outstanding. Delivery publishes tested code repairs, not a claim that the entire installation is fully working. Earlier follow-up entries describe historical pending states.
### CFD core optimization and GPU recheck — 29 September, 11:03 UTC

After the user enabled NVIDIA for ChatGPT, fresh browser diagnostics still identified Intel UHD / ANGLE D3D11. No Quadro performance claim can be made until the renderer actually changes. Initial samples were wind 8.25 FPS and runoff 12.09 FPS, but include startup/developing flow and concurrent CPU test activity; they are not controlled GPU comparisons.

The solver now caches fixed pull-streaming links and open-boundary source/type information per solver generation, and computes the nine shared inlet equilibrium values once per step. Arithmetic, Float32 writes, collision/forcing equations, timestep settings, density checks, convergence checks, rendering resolution, particles and effects are unchanged. This trades 1.75 MB (338×144 grid) / 4.18 MB (372×312 grid) of link indices for less repeated address/boundary work. Geometry changes already create a new solver generation.

`node scripts/compare_cfd_core.cjs .runtime/cfd-core-before.cjs` compares a saved reference from commit `94e1152`. It verified bit-identical populations, velocities and diagnostics through 450 steps for all four boundary modes at four angles, including obstacles, canopy drag, channel forcing and inlet ramp. The full CFD numerical, geometry/tracer, lifecycle, worker, supported-resolution/speed and two 2,400-step campus suites passed. The complete visual suite passed, covering ribbons, particles, palettes, timing, facade glow and dashboard controls.

Alternating five warmed 150-step batches, with other CPU tests finished and wind disabled, gave these Node solver microbenchmarks (default resolution 150, uniform flow):

| Angle / grid | Before median ms/step | After median ms/step | CPU time reduction |
| --- | ---: | ---: | ---: |
| 0° / 338×144 | 10.76 | 7.38 | 31.4% |
| 45° / 372×312 | 27.18 | 18.00 | 33.8% |

These are solver-throughput measurements, not rendered FPS or timings for obstacle-rich campus flow. A controlled visible 1920×1080 display comparison, with matching 2283×1368 wind canvases and no parallel CPU test workloads, measured reference `94e1152` at 4.19 FPS (238.48 ms mean, 266.7 ms p95) and optimized working code at 4.14 FPS (241.38 ms mean, 266.8 ms p95). Both used Intel UHD and had zero hidden frames and long tasks. There is no demonstrated display-FPS improvement; rendering remains the practical bottleneck despite faster core steps. The viewport override was reset after testing. Raw samples are in `.runtime/benchmarks/8096.jsonl` and `8095.jsonl`.

### Full-resolution Quadro layer tests — 29 September 2026

The browser now confirms NVIDIA Quadro RTX 3000 / ANGLE Direct3D11. All samples below were 30 seconds, visible (`hiddenFrames=0`), at 1920×1080, DPR 1. No simulation resolution, particle density or effects were reduced; glow was explicitly toggled only for comparison and restored enabled afterward.

| Layer / combination | FPS |
| --- | ---: |
| Wind, impact glow enabled | 4.75 |
| Wind, impact glow disabled | 9.71 |
| Stormwater | 59.57 |
| Bird sounds | 59.80 |
| Sun Study | 60.00 |
| Slideshow | 60.00 |
| Wind + stormwater, glow disabled | 9.10 |
| Wind + stormwater, glow enabled | 3.92 |
| Street Life + transit after switching | 56.17 |

These are short samples, not a new endurance test. Initialization/developing flow and browser/OS variability affect exact comparisons. Disabling glow approximately doubled wind throughput in this run, but did not get wind near 60 FPS. Stormwater's earlier poor Intel results do not represent this Quadro configuration. Static/interactive layers and the short grid animation were not given sustained FPS claims. ECOM/CoolPaths real-data validation remains blocked by absent private inputs.

A reversible experiment retained Path2D facade paths until edges changed their existing brightness bins. Exact stroke geometry/style/order and invalidation tests, the full CFD visual suite and lifecycle checks passed, but the glow-enabled display sample was 4.55 FPS (219.72 ms mean, 283.4 ms p95), showing no improvement over 4.75 FPS. The experiment and its temporary tests were discarded; production rendering is unchanged. Further work should instrument worker drawing/presentation separately and investigate glow stroke/raster cost, not assume that solver optimization or NVIDIA selection alone solves it. The earlier numerical core improvement remains in place.

Raw labelled samples: `.runtime/benchmarks/quadro-layers.json`. The temporary viewport override was reset after tests. Glow remains enabled by default; no automatic quality reduction was introduced.

### Wind pipeline breakdown and target benchmark — 29 September 2026

Target: **60 newly rendered wind images/sec, 1920×1080 DPR 1, grid resolution 300, High density (1,000 particles), trees enabled, default 5 m/s wind, full effects including impact glow**. The actual padded solver is 675×288 (194,400 cells); the geographic drawing surface is 2283×1368. The NVIDIA Quadro RTX 3000 was confirmed for these samples. This target is **not met**. These are short developing-flow measurements, not a settled-flow endurance certification.

Important correction to interpretation of earlier tables: requestAnimationFrame FPS measures browser callbacks, not unique wind images. The new opt-in diagnostics separately count transferred/presented wind bitmaps. Even that submission count is an upper bound on unique images physically displayed; the compositor can coalesce submissions. Example: the original particle/no-glow sample had 58.8 browser callbacks/sec but only 895 wind images in about 30 seconds (~29.8/sec).

The benchmark now records bounded rendering-stage samples (mean/p95/max), solver step/snapshot timings, actual settings, new-image submission rate and whether the diagnostic solver pause is active. Normal launch does not enable profiling. An acknowledged, diagnostic-only pause/resume control permits isolating rendering from continuing calculations; paused samples are explicitly marked and must never be reported as a successful live simulation benchmark.

Before this turn's optimizations, at grid 300 / High:

| Style / glow | New wind images/sec (approx.) | Browser callbacks/sec | CPU-side render preparation mean |
| --- | ---: | ---: | ---: |
| Particles / on | 9.2 | 17.58 | 26.57 ms |
| Particles / off | 29.8 | 58.80 | 22.51 ms |
| Ribbons / on | 3.1 | 3.13 | 42.18 ms |
| Ribbons / off | 4.9 | 7.26 | 42.32 ms |

Ribbons spent ~14 ms in flow segment construction/draw submission alone, versus ~2–3 ms for particles. Canvas draw API timings do not include all deferred rasterization/compositing; therefore the small (~0.5 ms) glow submission time is not its total rendering cost. Solver steps took ~26–28 ms each in a separate worker, with velocity snapshots approximately every 80–100 ms; the renderer interpolates these independently.

Implemented improvements: cache the fixed bilinear probe indices/weights used for facade exposure; hoist fixed array/scalar lookups from smoothing and heatmap loops; avoid computing invisible facade exposure while glow is disabled. When glow is re-enabled its existing intensity resumes the same rise/fall model; enabled-frame intensity calculations and Float32 smoothing were verified exactly against their reference arithmetic. No density, grid size, drawing resolution, stroke appearance or enabled effects were reduced. The earlier unsuccessful Path2D caching experiment remains discarded.

Final particle results:

| Configuration | New wind image submissions/sec | CPU-side render preparation mean |
| --- | ---: | ---: |
| Live solver, glow off | 34.34 | 9.60 ms |
| Live solver, glow on | 10.08 | 17.04 ms |
| Paused solver, glow off — diagnostic only | 35.96 | 8.57 ms |
| Paused solver, glow on — diagnostic only | 9.61 | 17.14 ms |

With live physics and glow enabled, mean per-frame stages were: smoothing 2.80 ms, heat preparation 2.85 ms, facade exposure 5.86 ms, particle advancement 2.43 ms, flow draw submission 2.23 ms, glow draw submission 0.65 ms, bitmap handoff 0.16 ms, and main-thread presentation call 0.02 ms. The overall request/response round trip was ~17.28 ms, yet only ~10 wind images/sec reached presentation. The gap and unchanged throughput with the solver paused strongly implicate rendering/presentation scheduling and deferred graphics work rather than solver contention as the main full-quality display bottleneck. These CPU-side timers cannot isolate the graphics driver's raster and compositor costs individually.

Full visual regressions, lifecycle regressions, exact probe/smoothing comparisons, and the new real-worker timing/pause/resume test passed. Raw labelled evidence is `.runtime/benchmarks/wind-300-stages.json`. Physics was resumed and glow restored after isolation; temporary viewport settings were reset. Further work toward the full-quality 60 FPS target needs graphics-side profiling and likely a persistent GPU rendering path for flow/glow, with image comparisons to preserve appearance; another solver-only speedup will not address the measured bottleneck.

## Persistent WebGL2 renderer follow-up (29 September 2026)

The WebGL2 implementation (now the main CFD default, with Canvas fallback) replaces bitmap presentation with a persistent visible OffscreenCanvas, GPU heat/flow/facade rendering, and pipelined ribbon and facade workers. Full-quality wind-alone measurements on the Quadro RTX 3000 reached approximately 60 GPU completions/sec for both styles. The ten-minute ribbon run recorded 60.003 GPU completions/sec, 59.195 fresh geometry updates/sec and 16.8 ms p95 intervals. A final unobstructed ribbon run confirmed 60.015 GPU completions/sec. Wind plus stormwater remained at approximately 37 GPU completions/sec.

WebGL2 was subsequently enabled by default as requested; physical presentation and compositor traces are still unverified. The initial acceptance sequence had the translucent startup veil present; the detailed report distinguishes those samples from the final unobstructed run. See [implementation, validation and limitations](wind-gpu-rendering.md), [raw measurements](benchmarks/wind-gpu-2026-09-29.json), and [seeded visual comparison](benchmarks/wind-render-comparison.png).

Stormwater now also uses a persistent worker canvas. The paced implementation measured 38.66 wind GPU completions/sec alongside stormwater versus 38.61 for the bitmap reference in a short current comparison. The handoff was removed, but combined throughput remains below 60 fps. See [stormwater implementation and evidence](stormwater-persistent-rendering.md).
