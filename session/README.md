# MR Studio collaborative sessions

## Start everything locally

From the MR Studio repository:

```sh
./start_services.sh
```

The foreground supervisor starts the local host, ECOM, CoolPaths and SAM, opens
the launcher, and reports readiness. Launch the main display and controller from
that launcher so they share an origin. Click the main display's start overlay
once to enable its audio. **Session** on the dashboard opens the local host panel.

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

Scan the host panel's QR to include the current invitation. The small banner
QR shortcuts appear where there is enough unused space and open the larger host
QR when clicked. GitHub Pages hosts the interface; computations, API credentials,
and session logs stay on the host computer.

Choose one of four controller slots. Extra participants are spectators. Each
phone's Apps selection, Controls/Map tab, zoom, and pan are personal; enabled
layers and settings are shared. Opening an app does not toggle it. An explicit
switch changes the table. There are no remote calibration or administration
commands. Slot releases and pause/end controls are available only through local UI.

The Controls tab adapts the existing desktop dashboard, including ECOM and SAM,
using the host for its local API requests. The Map tab is a companion map with
OpenStreetMap context and host-produced analysis results. It does not run a second
simulation or reproduce every presentation animation. One finger uses the current
tool; two fingers navigate only the phone map. **Fit table** restores its extent.

Isovist supports placement/movement and a look-toward tool. CoolPaths uses its
existing Route/Inspect mode and origin/destination behaviour. EPC, ECOM and Street
View accept targeted selections. CFD's polygon tool creates additional solid
footprints, preserving the base buildings and trees; no height is requested.
Close the polygon to commit it and rebuild the flow. Select/move and Edit corners
modify it. Changing the host calibration cancels unfinished phone gestures.

Canvas supports pen, lines, arrows, polygons, markers and anchored comments.
Annotations remain when layers are changed or Canvas is hidden. Authors can move,
reshape or delete their annotations and undo/redo their own edits; the host can
edit anyone's. Undo refuses to overwrite a subsequent edit. Select an annotation
near a vertex or its marker. Ordinary Canvas polygons never become wind barriers.
The mouse tools are available from Canvas on the main display and dashboard.

## Session lifecycle and networking

The main display owns the round. Closing/reloading it invalidates the invitation;
the next display load creates a new round and an empty Canvas. Closing the host
panel has no effect. Phones store an invitation-scoped identity and reconnect with
the same reserved slot after reload or sleep. The host can release reserved slots.
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

GitHub Pages uses the `Publish MR Studio phone client` Actions workflow on `main`.
It runs protocol/server checks, builds an explicit file allowlist, and deploys
`dist/session-client`. The host/admin scripts, calibration module, local settings,
backend code, credentials and session logs are excluded from that artifact.

```sh
python3 scripts/build_session_client.py
```

Public files retain the prototype's `session/js` and `session/css` structure.
`client.html` is at the Pages root; the reusable dashboard is `controller.html`.
Update `MR.RELEASE`, the version query strings in `session/client.html`, and the
public artifact together when the protocol changes. Reload the host and scan the
new invitation after deployment. Existing incompatible invitations are rejected.

## Verification

```sh
node scripts/test_session.cjs
python3 scripts/test_session_server.py
.venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
node scripts/test_cfd_simulation.cjs
node scripts/test_cfd_visuals.cjs
```

`scripts/test_session_browser.cjs` runs join/slot, real layer controls, Isovist,
Canvas undo/redo, reconnect, five-participant permissions, backend routing, CFD
obstacles, admin pause/release and log checks. Install/use Playwright and set
`MR_TEST_URL` to the local host. `MR_BROWSER` optionally selects an installed test
browser, and `MR_PLAYWRIGHT` optionally specifies the module installation.
The default transport is real PeerJS. `MR_TEST_TRANSPORT=memory` substitutes an
in-memory test transport to test UI/protocol behaviour independently of network
ICE/TURN restrictions. That transport is never included in the public artifact.

Actual phone/browser compatibility and workshop-network connectivity still need
an in-room check; passing the deterministic transport test is not a WebRTC test.
