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