# MR Studio collaborative sessions

## Start everything locally

From the MR Studio repository:

```sh
./start_services.sh
```

The foreground supervisor starts the local host, ECOM, CoolPaths and SAM, opens
the launcher, and reports readiness. Launch the main display and controller from
that launcher so they share an origin. Click the main display's start overlay
once to enable its audio. **Session** opens a page inside the desktop controller, with the same header and sidebars.

Default ports are host 8090, ECOM 8000, CoolPaths 8001, and SAM 8002. Copy
`services.example.json` to ignored `services.local.json` to override ports,
`sam_directory`, or the public `client_url`. All four ports must be distinct.
The existing individual launch scripts read the same configuration. The host
proxies dashboard service requests, so changing a backend port requires no HTML edits.

```sh
./start_services.sh --check       # Read-only readiness check
./start_services.sh --no-open     # Start without opening a browser
./start_services.sh --config /absolute/path/services.json
```

An occupied port is reused only if its API identifies the expected service.
Unrelated listeners are reported, never killed. A second supervisor invocation
reports the existing supervisor. Ctrl+C terminates the process groups this run
started; services it reused remain running. Logs are `.runtime/{service}.log`.
The supervisor reports failed optional services while keeping the host available.

The ECOM and CoolPaths launchers retain their existing environment setup.
SAM requires the configured repository and its existing `.venv`. Prepared
CoolPaths data and ECOM demand data are prerequisites; startup does not run the
study preparation pipeline or fabricate missing data. A healthy API may still
report an unavailable study in the layer dashboard.

## Phone controls

The public phone interface is:

https://nodal-works.github.io/interactive_map/client.html

Scan the host panel's QR to include the current invitation. During idle Street Life,
a larger QR appears at the bottom right of the calibrated table, with the Street Life
label at bottom left. Apps on the main display includes a local bottom-ribbon height
setting (5–10 cm; default 5 cm). The ribbon hides while layers are active or the
session has ended. Confirm scan reliability on the physical projected table. GitHub Pages hosts the interface; computations, API credentials,
and session logs stay on the host computer.

The welcome dialog presents four controller slots and an explicit spectator option.
Choose an available slot; the Apps screen opens once the host confirms your claim.
Returning editors retain their slot and skip the welcome dialog. Extra participants are spectators. Each
phone's Apps selection, Controls/Map tab, zoom, and pan are personal; enabled
layers and settings are shared. Opening an app does not toggle it. An explicit
switch changes the table. There are no remote calibration or administration
commands. Slot releases and pause/end controls are available only through local UI.

The phone UI and embedded ECOM editor use a light theme.
The Controls tab uses compact phone controls, with secondary settings under
**More settings**. Sliders update their labels immediately and commit when released.
ECOM loads its shared scenario editor only while its Controls tab is open;
service computations and their result geometry stay on the host.

Map is disabled for apps without map input tools. **Expand map** fills the viewport,
using native fullscreen where supported, and **Exit fullscreen** restores the layout
without discarding drawings or changing the map position.
The Map tab shows a light-styled OpenStreetMap basemap (no API key), the table
boundary and drawing inputs. Phones receive no CFD images, analysis results,
building-footprint background, video or charts. Settings are projected through an
explicit input-only allowlist and only sent when they change. Drawing objects are
sent separately, only to the relevant Map tab. Basemap tiles load over HTTP.

One finger always uses the selected input tool; two fingers pan or pinch to zoom
only the phone map. Navigation never places a point or discards an unfinished
polygon. Double-tap zoom is disabled. **Fit table** restores the table extent.

Isovist supports placement/movement and a look-toward tool. CoolPaths uses its
existing Route/Inspect mode and origin/destination behaviour. EPC, ECOM and Street
View accept targeted selections. CFD's polygon tool creates additional solid
footprints, preserving the base buildings and trees; no height is requested.
Tap **Finish shape** after at least three corners to commit it and rebuild the flow. Select/move and Edit corners
modify it. Changing the host calibration cancels unfinished phone gestures.

Canvas supports pen, lines, arrows, polygons, markers and anchored comments.
Annotations remain when layers are changed or Canvas is hidden. Authors can move,
reshape or delete their annotations and undo/redo their own edits; the host can
edit anyone's. Undo refuses to overwrite a subsequent edit. Select an annotation
near a vertex or its marker. Ordinary Canvas polygons never become wind barriers.
The mouse tools are available from Canvas on the main display and dashboard.
Canvas switches the table to a light basemap while keeping analysis layers above it.
Canvas, wind and comfort suppress the idle Street Life animation.

The host controller follows newly activated layers. Sidebar and Apps buttons open
controls; their separate switches change layer visibility. Phone app focus remains
personal. ECOM uses desired-state activation, so switching off during loading cancels
the pending activation and failed loads return the switch to off.

See [the canvas library comparison](canvas-options.md) for the next drawing-tool iteration.

## Session lifecycle and networking

The main display owns the round. Closing/reloading it invalidates the invitation;
the next display load creates a new round and an empty Canvas. Closing the host
panel has no effect. Phones store an invitation-scoped identity and reconnect with
the same reserved slot after reload or sleep. The host can release reserved slots.
Heartbeats take priority over bulk messages. Outgoing state updates coalesce under
backpressure. Signaling interruptions keep an established data channel alive;
actual channel loss reconnects with bounded backoff. Sleep/wake gets a liveness
grace period. A quiet connection status replaces repeated unavailable banners.
Edits pause while disconnected and resume after authoritative state arrives;
stale gestures are not replayed.
Two accepted edits to the same analysis setting apply in host arrival order.

Both host and phones need internet for GitHub Pages and PeerJS signaling. They
communicate via WebRTC DataChannels, not a public port on the Python host. Campus
or corporate networks may block peer connections even when signaling succeeds.
`session/js/config.js` exposes PeerJS options, including `config.iceServers` for
an operator-provided TURN service. Do not commit private long-lived credentials.
Public signaling alone does not guarantee connectivity through every firewall.

## Logs and host controls

The host panel shows participants, live app/tab focus, slots, service health,
duration, activity, save status and annotation management. It can pause remote
editing, release slots, end a round and download its JSON log. Dashboard avatars
show presence; brief coloured markers show phone map interactions.

`sessions/<sessionId>.json` retains the prototype's versioned round shape
(`schemaVersion: 2`, timestamps, revision, table transform, participants, finalState,
and ordered semantic events with state/participant/slot snapshots). Preview images
and solver arrays are excluded. Commits are saved atomically and failed writes
are retried visibly. A crash can leave `endedAt` null and loses anything after the
last successful write. Requests and completed asynchronous results are recorded
separately. There is no cross-session restore or timeline player in this release.

## Publishing

One GitHub Actions workflow builds and tests `main`, `lindholmen`, and `universeum`
on every push to any of those branches, then deploys one complete Pages artifact.
A failed branch build prevents publication; each client retains its own release,
configuration, assets, and dashboard. Local worktrees are not deployment sources:
commit and push the matching branch before using an updated host with phones.

| Host branch | Public phone client |
| --- | --- |
| main | https://nodal-works.github.io/interactive_map/client.html |
| lindholmen | https://nodal-works.github.io/interactive_map/lindholmen/client.html |
| universeum | https://nodal-works.github.io/interactive_map/universeum/client.html |

`/dev/client.html` redirects to Universeum, preserving invitation parameters and
fragments. `deployment-manifest.json` at the Pages root records each branch,
commit, release, and client path. Check it against the host checkout after rollout.

Each branch's `services.example.json` and `session/js/config.js` specify its public
URL. An explicit `client_url` in `services.local.json` (or `--config`) overrides
the service default. Preserve custom operator URLs; update old main/dev/local
URLs when moving a host to its matching client. No service rewrites URLs silently.

To build the combined artifact from three checkouts:

```sh
python3 scripts/build_pages_site.py --main /path/to/main \
  --lindholmen /path/to/lindholmen --universeum /path/to/universeum
```

The output is `dist/pages`. Each input uses its own allowlisted client builder;
host/admin scripts, calibration, local settings, credentials and session logs stay
out of the public artifact. Local HTML asset references are checked before upload.
The workflow runs protocol, lifecycle, server and artifact tests for every branch,
plus Lindholmen's Cultural Gravity checks. Use GitHub Actions as the Pages source
and allow `main`, `lindholmen`, and `universeum` in the `github-pages` environment.
Keep this publishing workflow and combined builder synchronized across branches.

For the initial migration, disable the existing publishing workflow, let any
active deployment finish, land all three coordinated branch updates, then enable
it and dispatch a run from main. Later pushes rebuild all three clients together.
To roll back, revert the affected branch commit and rebuild the complete site.

When changing the protocol, update that branch's `MR.RELEASE` and client asset
versions together. Preserve release matching; never bypass the invitation check.
After deployment succeeds and the public manifest matches, restart the local
host at a convenient break, reload the display, and scan its fresh QR. Existing
sessions are not restarted automatically. Verify joining, layer control and
reconnect on real phones on the presentation network; deterministic tests cannot
prove WebRTC connectivity through that network's firewall.

## Verification

```sh
node scripts/test_ecom_lifecycle.cjs
node scripts/test_session.cjs
node scripts/test_session_connection.cjs
python3 scripts/test_session_server.py
.venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
node scripts/test_cfd_simulation.cjs
node scripts/test_cfd_visuals.cjs
```

`scripts/test_session_browser.cjs` runs join/slot, real layer controls, Isovist,
Canvas undo/redo, reconnect, five-participant permissions, backend routing, CFD
obstacles, two-finger navigation, input-only traffic budgets, service-result offloading,
admin pause/release and log checks. Install/use Playwright and set
`MR_TEST_URL` to the local host. `MR_BROWSER` optionally selects an installed test
browser, and `MR_PLAYWRIGHT` optionally specifies the module installation.
The default transport is real PeerJS. `MR_TEST_TRANSPORT=memory` substitutes an
in-memory test transport to test UI/protocol behaviour independently of network
ICE/TURN restrictions. That transport is never included in the public artifact.

`scripts/test_session_ecom_browser.cjs` isolates the early iframe-response race with
the deterministic transport. It uses the same `MR_TEST_URL`, `MR_PLAYWRIGHT` and
`MR_BROWSER` settings and does not require a running ECOM backend.

Actual phone/browser compatibility and workshop-network connectivity still need
an in-room check; passing the deterministic transport test is not a WebRTC test.
