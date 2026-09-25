# KultVis Lindholmen

This branch integrates the shared presentation and session features from main
(`9c08f79`) while retaining Lindholmen's original calibrated view, two-click
introduction, four welcome logos, media, and Cultural Gravity sequence.

## Included layers

Wind, stormwater, sun study, isovist, Street View, EPC, thermal comfort/CoolPaths,
slideshow, bird sounds, street life, live transit with ferry wakes, table grid,
and collaborative canvas. Cultural Gravity works from the map, dashboard, and
phone controller: advance once to reveal sites, then again after the reveal to
start the attraction animation. Right Arrow remains available on the map/dashboard.
Campus Vision, FCC walkthrough, and the campus energy-community dataset are disabled.

The introduction begins two zoom levels out and flies into the calibrated view
on the second click (900 ms delay, 6.5 s duration). Calibration presets use the
`interactive_map_lindholmen_` storage namespace; campus presets are not imported.

## Local data

The EPC export contains all 458 original footprints: 290 linked certificates and
168 unmatched footprints. No certificate is inferred for an unmatched building.
The source DuckDB database is opened read-only and is not copied into this branch.

```sh
python scripts/export_epc_geojson.py \
  --database /path/to/chalmers_epc_browser/epc_sweden.duckdb
python scripts/process_dem_flow.py --browser-only
```

The stormwater output has terrain, building-mask, and water-mask bands. Its
geographic alignment follows the raster corners rather than the campus rotation.
Legacy rasters without CRS tags use SWEREF99 TM / EPSG:3006; `--dem-crs` can override
that fallback. The original local water mask is retained.

CoolPaths uses a separate local study in `coolpaths/data/2026-07-15/` (ignored by
Git), with 2 m cells and hourly results from 08:00 through 20:00 Stockholm time.
It covers Lindholmen's street network plus a 100 m margin, with 3,882 walking edges.
Earth Engine, OSM and NASA inputs are cached with the study. The manifest records
sources, bounds, project, preparation time, and terrain processing.

Lindholmen's original terrain contains artificial stormwater building barriers.
Thermal preparation replaces cells under those footprints with the nearest valid
ground elevation before adding thermal building heights. These heights are
inferred where measurements are absent; the layer is modeled comfort, not a
measurement. The local water mask overrides the global mask where it has coverage.

```sh
# Install coolpaths/requirements.txt in your Python environment first.
export COOLPATHS_EE_KEY_FILE=/path/to/existing-service-account.json
# Project ID may also come from the ignored trafik-config.json used by main.
export COOLPATHS_EE_PROJECT_ID=your-existing-project
python -m coolpaths.prepare
# --force rebuilds results, reusing downloaded inputs.
```

Do not point `COOLPATHS_DATA_DIR` at the campus study. Preserve/copy this generated
study when moving the checkout; Git does not include its 53 MB of local data.
Credentials remain in local ignored configuration or the original key file.

## Running and phone access

Use `./start_services.sh`, or start just the host and thermal service:

```sh
python host_server.py
./launch_coolpaths_server.sh
```

Ports come from `services.example.json` with optional `services.local.json`
overrides. The prepared local preview uses host 8094 and CoolPaths 8011, separate
from campus services. Street View segmentation requires the optional SAM service;
Street View imagery uses the existing local API key.

The shared Pages workflow publishes this branch's phone client at
https://nodal-works.github.io/interactive_map/lindholmen/client.html alongside main
and Universeum. Its distinct release prevents incompatible clients from silently
omitting Cultural Gravity. Commit and push host changes, verify the public
`deployment-manifest.json`, then restart the host and scan a fresh invitation.
See [publishing and phone verification](session/README.md#publishing).

## Verification

```sh
node scripts/test_app_config.cjs
node scripts/test_lindholmen.cjs
node scripts/test_georeference.cjs
node scripts/test_cfd_simulation.cjs
node scripts/test_cfd_visuals.cjs
node scripts/test_slideshow.cjs
node scripts/test_slideshow_raster.cjs
node scripts/test_transit.cjs
node scripts/test_ferry_wake.cjs
node scripts/test_session.cjs
node scripts/test_session_connection.cjs
python -m unittest discover -s scripts -p 'test_dem_flow.py'
python -m unittest discover -s scripts -p 'test_session_server.py'
python -m unittest discover -s coolpaths/tests -p 'test_*.py'
```

Browser checks cover introduction, branding, EPC inspection, thermal routing,
thermal inspection, the processing tour, Cultural Gravity progression, and sun
study alignment. Real PeerJS signaling was reachable in the test browser, but
its phone DataChannel did not open; cross-device WebRTC still needs a check on
the presentation network with the matching hosted phone client.

## Artwork · Vishvi Rajakaruna

Artwork is one geographically registered layer with seven accumulating chapters,
then a balanced complete composition. Click the table or Next to advance; Back,
Replay, Show all and the left/right arrows are also available. Transitions hold
between chapters and reject repeated advances. The architectural opening uses
a 10-second reveal of staggered original vector strokes, after the 800 ms fade,
with warm tracing highlights that
settle to the original white drawing. No sound is added. Other selected layers
are suspended and restored when Artwork closes.

Magnifier (or M) reveals a large circular view on the dashboard. Move across the
table to sample; click to pin/unpin; Escape closes the tool. Magnification ranges
from 2× to 6×. The table dims outside the sampling circle and adds a warm glass
halo. Its map remains registered at its original scale. The dashboard lens keeps
its central 70% undistorted, with curved refraction, subtle spectral separation
and reflection at the rim. Slow overlapping light ripples are masked to original
strokes, above a continuously sharp native-resolution vector pass. Reduced motion
uses steady illumination. Without WebGL, a circular Canvas lens remains usable.

The original `artwork/` PNGs and Illustrator file remain unchanged and are never
loaded by the browser. `media/artwork/` contains about 6.7 MB of derived SVGs and
one manifest. The extraction preserves Illustrator paths, clipped fields, source
stacking and the sculpture images. Embedded sculpture images are resized to at
most 1024 pixels. Names remain Artwork 1–7 until titles are verified.

Rebuild source-derived assets with pypdf, Pillow and Poppler installed, and fit
registration using NumPy:

```sh
python scripts/prepare_artwork.py
python scripts/register_artwork.py
node scripts/test_artwork.cjs
node scripts/test_artwork_lifecycle.cjs
python scripts/build_session_client.py
node scripts/test_artwork_client.cjs
```

`artwork-registration.json` records six distributed matched building centroids
and three independent validation buildings. The single affine EPSG:3857 fit has
0.077 m RMS residual (maximum 0.145 m); holdout residuals are 0.082, 0.037 and
0.175 m. These measure agreement with the supplied footprint dataset, not surveyed
physical accuracy. There is no per-building warping or camera adjustment. The
renderer reprojects on map movement and resize; table calibration still controls
the camera and physical clipping boundary.

`window.artworkAnimation` exposes start, stop, toggle, control, getState and
isActive. `artwork_control` carries sequence and magnifier actions;
`artwork_state` is authoritative for chapter, loading, transition times and lens
position. Cursor coordinates are normalized to the artboard and coalesced to
20 Hz with a trailing update. Dashboard rendering is local, not streamed images.
The companion build includes the shared renderer and assets, release
`20260925-lindholmen-artwork-3`. Publish using the combined three-client Pages
workflow documented in `session/README.md`; retain the other branches and releases.

Automated checks cover asset integrity, registration, 1080p/4K transform inversion,
frame-independent chapter visibility, replay, reduced motion, remote validation,
preload cancellation, layer restoration and the Canvas fallback at 2× density.
Browser review includes the overview, full composition, 1080p lens layout and
map/controller interactions. Physical projector alignment and cross-device phone
reconnection still require the presentation hardware/network and matching release.

The client app opens Artwork as a live viewer with the same chapter and magnifier
state as the table. In magnifier mode, drag on the small drawing to move the lens;
use Pin, Unpin, zoom and chapter controls below it. Phone sizing never changes the
table's sampling-ring dimensions. Spectators can watch; only an active controller
slot can change the scene. Reconnection requests a fresh authoritative snapshot.
The network carries a small allowlisted scene recipe, never images or geometry.
Lens movements are coalesced at 20 Hz and under transport backpressure.

The client flow was also checked at phone size with a local test transport:
activation, shared magnifier, touch positioning, pinning and Next reached the host.
The real WebRTC connection did not complete in the test browser. Hosted phones
need release `20260925-lindholmen-artwork-3` and a fresh matching invitation after
that release is published. Confirm the public deployment manifest before restarting
the host; deployment does not restart an active presentation session.
