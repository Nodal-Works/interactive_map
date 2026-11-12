# Webcam hand tracking proof of concept

Branch: `codex/webcam-hand-tracking-poc`.

Open the main projected display at `http://localhost:8090/index.html?handTracking=1`
using the existing MR Studio local server (or append `handTracking=1` to its URL).
The panel appears only with this query parameter. Use a current Chrome or Edge
browser with camera access. Localhost or HTTPS is required; a plain HTTP LAN IP
cannot request the camera. No backend changes or package installation are needed.
Alternatively, check **Webcam hand tracking (experimental table test)** in the
studio launcher before launching the projector. Close an already-open main
display first so the launcher opens it with the selected experiment.

Launch both the projector and TV controller. Click **Move camera controls to TV**
in the hand-tracking panel. The camera preview and controls move into the existing
TV controller window; the projected table keeps only the hand marker, calibration
targets, and drawing feedback. Capture stays in the host browser and keeps running.
Closing or reloading the TV controller stops capture and returns controls to the host.

1. Position the webcam so the whole physical table and your hand are visible.
   An overhead camera gives the most useful alignment. Keep the camera fixed.
2. Click **Start camera** and allow access. To use another camera, stop tracking,
   choose it from the list, then start again.
3. Starting the camera restores its saved calibration when the camera and projector
   layout match. Otherwise it shows calibration numbers 1–4 on the projected table.
   A bright eight-by-six checker grid with cyan lines and a yellow border covers
   the table during calibration. It disappears after the fourth corner is matched.
   Use **Calibrate table corners** to restart this step.
   Click those same physical corners, in that order, in the camera preview.
   The preview is unmirrored. Calibration accounts for camera rotation and
   perspective; it maps the camera's table plane to the existing projector alignment.
4. Start with **Pointer only** to check alignment. Open your hand with the index
   finger extended over the table. The initial finger aim is captured relative to
   the palm; move your whole hand to steer. Finger flexion during pinch or release
   does not move the aim. A translucent cyan hand shadow projects beside your real
   hand, with a white ring 12 cm away connected to the aim by a dotted line.
   The large ring is the actual drawing and selection location; the small dot is
   the palm-controlled aim reference. This keeps
   the main marker out of the hand's projector shadow. Use **Keep marker clear
   of your hand** to adjust its direction and distance.
   At the table edge the cursor stops at the boundary rather than jumping to the
   other side of your hand. Changing cursor offset cancels an unfinished stroke.
   If a corner was matched in the wrong orientation, use **Adjust pointer
   alignment** to flip either axis. For a small constant offset, enter horizontal
   and vertical corrections in table centimetres. Changing corrections cancels
   an unfinished stroke. A fresh calibration resets these corrections.
5. Choose **Select EPC building** and pinch thumb/index over a footprint to
   highlight it and send the existing building selection to the controller.
   Hold the pinch for about a quarter second. This enables the EPC layer.
   Open your hand before the next selection.
   Aim the large ring over the footprint before closing your fingers. The ring
   locks as the pinch starts so closing your hand does not change the chosen
   building. A blue progress ring shows pinch confirmation; opening releases aim.
6. Choose **Draw on table**. Pinch and move to draw; release to save the stroke
   to the existing shared Canvas. Canvas Undo removes it. This enables Canvas.
   The cursor keeps following palm movement while pinched, so you can draw without
   the stroke jumping when the index finger bends. Its ring fills blue while drawing.
7. **Stop** releases the webcam. Switching away from the page also stops it.

Hand input never pans, zooms, rotates, or otherwise changes the map alignment.
No synthetic mouse events are used. Leaving the table, losing the hand, changing
action, or recalibrating cancels an unfinished stroke and requires an open hand
before another pinch. Changing projector alignment invalidates calibration.
Camera calibration, alignment corrections, and cursor offset are saved locally
in this browser for each camera. Restarting or reloading restores them when camera
resolution, table dimensions, and projected footprint match. Projector alignment
changes invalidate calibration. Use **Calibrate table corners** after any physical
camera or table movement; the browser cannot detect that movement. Layer activation and completed Canvas drawings
remain after stopping, like ordinary studio interactions.
Seeing landmarks in the preview alone does not mean table calibration is complete.
The TV status distinguishes required calibration, an undetected hand, and a
detected fingertip outside the calibrated table; map actions require all four corners.

This is a single-hand, two-dimensional experiment, not touch/contact sensing.
Keep the fingertip near the table plane: raised hands and tall physical model
buildings cause parallax. A webcam cannot reliably infer contact with the model.
Lighting, projected patterns, occlusion, and camera placement affect detection.
Try pointer mode first and test pinch accuracy before relying on selection.

MediaPipe Tasks Vision `0.10.14`, its WebAssembly runtime, and the hand-landmarker
model download from jsDelivr/Google on startup. Frames are processed locally
and are not uploaded or recorded by this feature. Detection is throttled to
20 Hz on the main thread for this small experiment; performance on the studio
machine and real-camera accuracy still need hands-on validation.

Run `node scripts/test_hand_tracking.cjs` for perspective mapping and gesture
state checks, and `node scripts/test_hand_tracking_runtime.cjs` for selection,
shared drawing, and camera/input cleanup checks with simulated camera landmarks.
These checks do not establish actual webcam accuracy.

## Studio check, 2 October 2026

The external USB webcam (`046d:0823`) opened successfully in Edge on the EPSON
projector display. Live hand landmarks were visible. The initial camera-to-table
mapping reversed both axes; reversing the corner assignments corrected movement,
confirmed by the operator. A white building selection outline was observed during
the pinch test. Blue Canvas strokes remained visible after the hand left the
camera view during the drawing test. The camera-preview corner order for this setup was front-right,
front-left, back-left, back-right. Recheck this order if the camera is moved.
The operator reported an automatic building selection, so the final code requires
an open hand for 120 ms before arming and a stable pinch for 220 ms before acting.
Release ends drawing immediately. The hold requirement is covered by the automated
checks; it still needs a repeat camera test with the operator.
The operator found tracking substantially better with the room lights on than
in low light. Keep room lighting on for this proof of concept; low-light tracking
has not been established. A marker offset was added after the operator observed
that the projector cast the original ring onto the hand instead of the table.
