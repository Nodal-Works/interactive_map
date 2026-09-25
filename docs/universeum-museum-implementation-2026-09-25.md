# Universeum museum implementation — 25 September 2026

This change implements the exhibit lifecycle, composition, presentation and timing work from the museum plan. It does **not** certify 1080p/60 rendered FPS or museum commissioning. The projector machine and an eight-hour soak are still required.

## Implemented

- An explicit layer registry provides requested, active, loading, ready, off and error states. Repeated enable commands are idempotent; cancelled asynchronous activations cannot revive a stopped layer. Initial loading has a 45-second deadline. The phone receives lifecycle status, and controller panel selection no longer follows unsolicited layer broadcasts. Controller connection status uses host heartbeats.
- One keyed animation scheduler prevents duplicate loops, pauses callbacks while hidden, resets elapsed time on visibility changes and exposes per-owner CPU costs. Sun, bird waves, runoff, Street Life and transit movement use elapsed time or fixed simulation steps. Rendering quality stays fixed: prepared locations use one device pixel per CSS pixel, and wind worker failure cannot silently reduce the selected resolution.
- A transparent, synchronized MapLibre analysis pass puts slides, visibility and Street View marks above the 3D surface. The original map remains the camera/input authority. Isovist no longer replaces or deletes shared building data. Source readiness/events are forwarded to the correct map. Layer opacity remains independent.
- Isovist runs in a worker with spatial indexes and latest-request handling. Polygon holes are retained, radius bounds account for latitude, and empty space produces a valid visibility result. Background tree canopies use metre-scaled point circles rather than tens of thousands of polygon meshes.
- Wind and runoff draw on worker-owned OffscreenCanvas surfaces, with one frame in flight per layer, transferable bitmaps, reused runoff particle buffers and generation guards. Stopping a layer terminates its drawing worker; older browsers retain the existing canvas path. Diagnostics count canvas submissions separately from RAF cadence.
- Transit caches vehicle sprites and projected trail points, and batches equal trail strokes. Wind façade halos reuse path geometry. Runoff avoids redundant collision sampling when a segment stays in one valid grid cell. These optimizations preserve particle counts and selected simulation resolution.
- Street Life owns its idle behavior; Street View no longer hides transit or forces Street Life visible. Audio has a shared mute control, WebAudio limiting and at most four simultaneous automatic bird sounds.
- Information and the join QR live outside the geographic rectangle on the short sides. Active explanations are distributed across both sides; wind includes a speed colour key and slide titles follow the dataset. QR rendering uses integer module sizes and a four-module quiet zone; a QR too small for two pixels per module is withheld with a staff-facing placement warning.
- **Exhibit setup** on the staff controller provides per-layer opacity, master mute, text size, zone width and X/Y offsets, saved per location. A steady numbered 8×6 grid supports alignment without flashing or continuous redraw. These settings do not alter camera calibration or source geometry.

## Validation

Passed automated checks:

- `node scripts/test_museum_runtime.cjs`: scheduler ownership, 30/60/120 Hz timing, enable cancellation/idempotence/disposal, courtyard holes, large-radius latitude filtering, trees and open-space statistics.
- `node scripts/test_museum_render.cjs`: separate source ownership, unchanged primary camera, opacity without compounding, raster event forwarding and cleanup.
- `node scripts/test_museum_workers.cjs`: actual worker drawing paths, runoff buffer recycling, canvas resize, solid masking, transferred frames and settings updates.
- Existing CFD simulation/visual suites, transit and ferry suites, slideshow and raster-slide suites, session command/connection/location suites, ECOM lifecycle, application config, georeference, table calibration/layout/presentation suites.
- `.studio/env/bin/python scripts/test_dem_flow.py`: six tests, including browser/Python drainage parity, uniform rainfall and barrier checks.
- `python3 scripts/build_session_client.py`: 41 client files built.
- JavaScript syntax and `git diff --check`.

Browser observations on a fresh local host:

- All nine registered exhibit layers reported ready simultaneously. Numbered grid, visibility, wind, runoff, slides, sun, bird markers and live transit were visible together. Street View mode and its map marks were enabled; remote imagery service availability remains a separate dependency.
- Staff connection heartbeat displayed Connected. Grid hold, mute and opacity controls worked. The wind dashboard remained open when Sun Study was disabled.
- At 1920×1080, both information zones fitted outside the map and the QR met its minimum pixel size. Both MapLibre canvases had 1920 physical pixels of width even when the device reported DPR 2.
- Existing geometry checks continue to put model/raster corners and interior points within two pixels after fitting, flipping and panning.

Initial browser runs had duplicate exhibit tabs open and later a stalled local-server/browser session. Those performance numbers are **not acceptance measurements**. Duplicate tabs were closed before the final single-tab run. The clean pre-worker full-stack run measured 35.6 Hz RAF. With worker drawing, the saved 29.1-second full-stack sample measured 60 Hz RAF, p95 17.4 ms, no intervals over 33.34 ms and no long tasks. The last 600 canvas submissions measured 57.7 Hz for wind and 54.5 Hz for runoff as transit trail work increased. This is a substantial improvement, but **sustained 60 rendered FPS is not yet demonstrated**. RAF cadence and canvas submissions do not measure completed GPU frames. Evidence is in `single-tab-worker-metrics.json` and `single-tab-worker-full-stack.png`; earlier duplicate-tab runs are retained only as historical diagnostics.

## Commissioning still required

1. On the VizLab machine, use one projection tab and only the required controller/phones. Record browser/GPU versions, 1920×1080 output, actual refresh rate, frame traces and thermal state.
2. Verify each layer, every pair and the unrestricted full stack at the fixed settings. Require the agreed 60 rendered FPS budget; include animated sun, trees/exposure modes, map movement and data updates. Do not interpret an idle map render counter as application FPS.
3. Exercise four physical phones plus a spectator, rapid toggles, sleep/reconnect, unavailable services and host refresh. Existing automated connection tests do not replace this hardware/network run.
4. Set information-zone placement and QR size against the real projector, table edges, ambient light and visitor viewing distance; confirm scanning from both short sides.
5. Run an eight-hour soak and inspect memory, GPU resources, audio cleanup, worker counts and service recovery.

Evidence: `media/screenshots/universeum/implementation-2026-09-25/`. The original audit remains in `docs/universeum-museum-audit-2026-09-25.md`.
