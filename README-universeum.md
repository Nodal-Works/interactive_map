# Universeum — Interactive Map

The `universeum` branch configures MR Studio for a **3931.2 × 5241.6 metre** area of Gothenburg. It combines a map display, environmental exploration, a desktop controller, and collaborative phone input with a reproducible location package.

[Launch locally](http://127.0.0.1:8091/launcher.html) · [Map](http://127.0.0.1:8091/index.html) · [Controller](http://127.0.0.1:8091/controller.html) · [Setup recipe](profiles/universeum.json) · [Validation record](docs/universeum-validation.md)

The links use this machine's configured port **8091**; the default on another installation is **8090**. Start the services before opening them.

## Table alignment update

The default preview now fits the complete source extent to **8 × 6 square tiles**, with north toward the left. The provisional model footprint is **320 × 240 cm** (40 cm tiles), approximately **1:1,638**, or **655.2 m per tile**. The approximate 360 cm outer-table width is not used to stretch the geography.

In the controller's Calibration panel, **Fit table** restores proportional framing and **Flip 180°** changes orientation. **Preview** fits inside the available map display. **Projector** uses measured projected-image and model dimensions; the inherited screen measurements are placeholders and must be replaced on site. Presets retain dimensions, grid counts, fit mode and orientation. Existing legacy presets remain available.

The two **7.5 cm control rails** touch the map edges, giving a **335 × 240 cm** map-and-rail assembly; black letterboxing is outside this assembly. The approximately 3.6 m overall table measurement remains provisional. The map retains the exact source aspect and square tiles rather than stretching to the outer furniture dimensions. `table.sidebarWidth` sets each rail width in centimetres (default 7.5).

Presentation sizes follow physical table scale: sidebar icons are 3 cm, their buttons 5 cm, and sidebar type 1.75 cm high. At 1280 × 720 the model is 960 × 720 px and each rail is 22.5 px. Labels, controls, transit badges/trails, grid lines/nodes, bird markers, wind/rain marks, vector street segments and outlines, isovist marks, and canvas annotations scale with the footprint. Street Life retains geographic vehicle and pedestrian dimensions with proportionate visibility minimums. Buildings, trees and environmental distances retain their geographic scale. Raster basemap typography is baked into provider tiles; it retains the provider's styling.

Validation: `node scripts/test_table_layout.cjs`, `node scripts/test_table_presentation.cjs`, and `node scripts/test_table_calibration.cjs`. Browser checks cover landscape and portrait rail placement, 48 square cells, transit and street presentation.

![Universeum 8 × 6 grid](media/screenshots/universeum/table-fit-grid.png)

![Universeum model filling the calibrated footprint](media/screenshots/universeum/table-fit-sun-study.png)

| Wind | Stormwater |
| --- | --- |
| ![Fitted wind overlay](media/screenshots/universeum/table-fit-wind.png) | ![Fitted stormwater overlay](media/screenshots/universeum/table-fit-stormwater.png) |

| Geographic slideshow | Street Life |
| --- | --- |
| ![Fitted building footprints](media/screenshots/universeum/table-fit-slideshow.png) | ![Scale-aware Street Life](media/screenshots/universeum/table-fit-street-life.png) |

## Original screenshots

Captured from the running Universeum package on **25 September 2026**, at 1280 × 720. These are application screenshots, not mockups. Live vehicles, animation frames and lighting change over time. Bird sensors are illustrative. The original gallery below predates table fitting. Updated alignment screenshots appear first; tile numbering from the reference photograph remains unimplemented.

| Sun Study: LOD1 buildings and terrain | Wind: ribbons, speed field and façade glow |
| --- | --- |
| ![Universeum Sun Study with generated buildings and terrain](media/screenshots/universeum/sun-study.jpg) | ![Universeum wind simulation with settled flow](media/screenshots/universeum/wind.jpg) |

| Stormwater: runoff and pooling | Street Life with live transit |
| --- | --- |
| ![Universeum stormwater particles and pooling](media/screenshots/universeum/stormwater.jpg) | ![Universeum Street Life with numbered transit vehicles](media/screenshots/universeum/street-life-transit.jpg) |

| Slideshow: building footprints | Slideshow: street network |
| --- | --- |
| ![Universeum building-footprint slide](media/screenshots/universeum/slideshow-buildings.jpg) | ![Universeum street-network slide](media/screenshots/universeum/slideshow-streets.jpg) |

| Bird-sound markers over Street Life | Physical table grid |
| --- | --- |
| ![Illustrative bird-sound markers over the Universeum map](media/screenshots/universeum/bird-sounds.jpg) | ![Universeum table grid with glowing cyan nodes](media/screenshots/universeum/table-grid.jpg) |

| Canvas tools on the light map | Desktop wind controller |
| --- | --- |
| ![Universeum Canvas toolbar and annotation inputs](media/screenshots/universeum/canvas.jpg) | ![Universeum wind controls and velocity legend](media/screenshots/universeum/controller-wind.jpg) |

| Sun Study with estimated trees | Sun Study date, time and shadow controls |
| --- | --- |
| ![Universeum terrain and buildings with the generated tree model](media/screenshots/universeum/sun-study-trees.jpg) | ![Universeum Sun Study dashboard](media/screenshots/universeum/controller-sun-study.jpg) |

### Layer selection

![Universeum Apps drawer with the ten available layer controls](media/screenshots/universeum/apps.jpg)

## Area and prepared data

| Property | Universeum configuration |
| --- | --- |
| Source CRS | **SWEREF 99 12 00 — EPSG:3007**, easting/northing order |
| Minimum | **146087, 6395990** |
| Maximum | **150018.2, 6401231.6** |
| Exact source size | **3931.2 × 5241.6 m** |
| WGS84 covering bounds | West 11.9343203148, south 57.6831011250, east 12.0003054870, north 57.7301818188 |
| Source-rectangle centre | Longitude 11.9673340951, latitude 57.7066458009 |
| Provider/model CRS | EPSG:3006; covering envelope approximately 4159 × 5410 m |
| Terrain | 2 m cells; 2080 × 2706 raster |
| Buildings | 12,057 footprints and LOD1 building surfaces |
| Display mesh | 865,868 triangles including terrain; STL and GLB |
| Street network | 87,761 GeoJSON features |
| Water | 65 GeoJSON features |
| Estimated trees | 31,578 candidates; 31,504 placed in the 3D model |
| Prepared package | 17 registered assets, approximately 267.1 MB |
| Table defaults | 320 × 240 cm provisional footprint; 8 × 6 tiles; proportional preview |

The recipe preserves the original projected rectangle, its transformed corners and centre. Data preparation uses a covering EPSG:3006 rectangle, so assets include a small margin beyond the requested area. Universeum initially fits the source rectangle to an 8 × 6 table footprint with north left. Other uncalibrated locations retain north-up fitting. Saved calibration takes precedence.

Universeum selects **display meshing**: individual LOD1 building surfaces are combined with terrain. This avoids the expensive city-wide footprint-cleaning stage. The result supports display and shadow exploration; it is not a watertight simulation or printable solid. Source footprints and the terrain raster remain separate inputs to the other layers.

## Complete layer list

**Prepared** means the package has the required assets. **Live** means an external connection is required. These availability states do not certify every interaction or every source location; capture findings are listed below.

| Layer | Availability in Universeum | Features |
| --- | --- | --- |
| **Street Life** | Default background; captured | Animated pedestrians, bicycles, cars, buses and taxis on the street network; building outlines, streetlights and occasional emergency vehicles. Idle presentation includes a session QR invitation. Live transit can appear alongside it. |
| **Wind / CFD** | Prepared; captured with settled flow | Qualitative 2D D2Q9/TRT lattice-Boltzmann flow around building footprints; tree canopy drag; ribbons or particles; speed heatmap; façade impact glow; wind audio; editable additional obstacles. |
| **Stormwater** | Prepared; captured | Terrain-based D8 flow and accumulation; rainfall particles, downhill paths and pooling; building barriers and an explicit water mask; rain audio. |
| **Sun Study** | Prepared; captured | LOD1 buildings and terrain; solar position and shadows by date/time; day animation and playback speed; shadow opacity; optional tree model; false-colour shading; sun-path and sky controls. |
| **Visibility / Isovist** | Prepared; map interaction needs verification | Observer placement, view radius, field of view or 360° mode, cursor following, building/tree occlusion, visible-feature highlighting, green-view metrics, path history and responsive ambient sound; optional linked Street View. |
| **Street View** | Live; source metadata check passed | Location selection, nearby panorama lookup, camera position/heading and dashboard imagery. Optional image segmentation requires the separate SAM service. Imagery coverage and segmentation are not certified for this entire area. |
| **Transit / Västtrafik** | Live; vehicle overlay captured | Bus, tram and ferry positions, route labels, colour coding, interpolated movement and trails; transport-mode filters; approximately ten-second refresh with request/rate-limit handling. Requires local credentials and connectivity. |
| **Bird sounds** | Prepared; markers captured | Three illustrative spatial sound positions; bird recordings and playback feedback. These are demonstration positions, not field observations. |
| **Slideshow** | Prepared; both current slides captured | Universeum includes **Buildings** and **Streets**, with source credits. Previous/next, stop, keyboard navigation and optional automatic advancement. The engine also supports images, GIFs, video, styled GeoJSON, WMS and ArcGIS slides, retry/error states and categorical reveals when configured. |
| **Table grid** | Available; captured | Pulsing cyan tile boundaries and corner nodes using the physical screen/table dimensions; automatically stops after ten seconds. The configured layout is 8 × 6; physical measurements remain provisional. |
| **Canvas** | Available; tools captured | Pen, lines, arrows, polygons, markers and anchored comments; selection/movement, vertex editing, colour, cancel/finish, delete and author-scoped undo/redo. Annotations persist across layer changes within the current session. |
| **Building energy / EPC** | Unavailable | Energy-class building colours, certificate selection and certificate summaries. Universeum has no prepared EPC export; configure an SSH alias and the hosted API's loopback port before generation. |
| **Thermal comfort / CoolPaths** | Disabled; no Universeum study | Prepared PET layers and hourly inspection, shortest/coolest routes, distance and heat-exposure comparison, and an explanatory workflow tour. Requires a study date, Earth Engine access and generated study data. Campus study dates/data do not apply here. |
| **Campus vision** | Disabled project extension | Animated SVG masterplan phases, project boundaries, routes, activity nodes and green spaces. No Universeum presentation assets supplied. |
| **FCC walkthrough** | Disabled project extension | Synchronized VR flythrough, recorded movement, visibility and Street View. No Universeum recording/path supplied. |
| **Energy community / ECOM** | Disabled project extension | Building/node/flow visualization and shared energy-scenario controls; requires its own local backend and datasets. No Universeum energy-community package supplied. |
| **Cultural Gravity** | Disabled project extension | Curated cultural-site visualization. The repository includes a Lindholmen profile, but no Universeum cultural-site dataset. |

The repository also contains a **Street Glow** animation module for glowing, road-type-coloured paths and travelling particles. It is not a separate selectable entry in the Universeum location catalog.

### Wind controls

- Ribbons or particles, with **Classic**, **Ocean**, **Ember** and **Monochrome** palettes.
- Speed legends of **0–5+, 0–10+, 0–20+ or 0–40+ m/s**; visual density and tracer playback controls.
- Wind speed, screen-space direction, viscosity, grid resolution and tree inclusion.
- Worker-based computation, development/settled status, geometry rebuilds after relevant edits, and a lower-resolution compatibility path.
- Default configuration: 5 m/s wind, ribbons, Classic palette, 0–20+ m/s legend, medium density, 150 cells on the longer visible axis, trees enabled.

Changing colours or tracer playback affects presentation rather than the simulated inlet wind. The wind model is qualitative 2D exploration around footprints, not a validated atmospheric or wind-comfort prediction.

### Slideshow scope

Only the **two generated geographic slides** are included in Universeum. The engine's historical imagery, infrared, hillshade, cadastral and other service-based examples in the general project README require their own slide configuration. They are not automatically included in this package.

## Shared application features

### Map and presentation

- Full-area initial framing, pan/zoom/rotation, fullscreen and a geographic table boundary.
- OpenStreetMap and its light treatment, CARTO Positron/Dark, Esri imagery and OpenTopoMap basemaps. Mapbox dark/light/outdoors/satellite/satellite-streets/streets variants are available when a token is configured.
- Independent layer visibility through the **Apps** drawer; opening a control panel and enabling a layer are separate actions.
- Universeum title and location-specific asset resolution, with a shared presentation shell and existing Chalmers/DTCC attribution.
- Click-to-start audio interaction; soundscapes for wind, rain, city activity and birds.
- Configurable idle QR ribbon height, with the invitation linked to the current host session.

### Desktop controller and calibration

- A separate dashboard connected to the main display through same-origin BroadcastChannel messages.
- Layer settings, legends, source/metadata panels, educational explanations and authoritative state updates.
- Screen/table dimension controls, alignment overlay, rotation, zoom, pan and centre locking.
- Named calibration presets with author metadata, default replacement and restoration of the original calibration; settings are scoped to the location.
- Local calibration and administration stay on the host rather than the public phone client.

### Collaborative phone sessions

- QR invitations, **four editor slots**, additional spectators, participant presence and shared layer settings.
- Personal phone app focus, Controls/Map tabs, map navigation and expanded map view; phones send inputs rather than receive heavy simulation outputs.
- Layer-specific tools: wind obstacle polygons, observer/heading input, location selection and collaborative Canvas annotations. Route/inspection tools are available when the corresponding study layer is prepared.
- Host-authoritative edits, ownership-aware undo/redo, host annotation management, pause/release/end controls and downloadable session logs.
- PeerJS signaling and WebRTC DataChannels; reconnect/backoff, heartbeat prioritization and sleep/wake handling. Network compatibility still needs an in-room phone test.

See [the session guide](session/README.md) for interaction details and networking requirements. The capture session did not constitute an end-to-end phone test.

### Location preparation and operations

- Swedish-area location wizard and CLI; WGS84 or explicitly identified projected input, including EPSG:3007.
- Six-kilometre side limit and eight-million-raster-cell limit, with generation-envelope checks and memory estimates.
- Versioned manifests and reproducible recipes; deterministic settings, stage caches and resumable generation.
- Required-core validation before publishing a replacement package; failed builds preserve the previous package.
- Asset checksums, package validation and portable ZIP export/import.
- Local source connections kept outside exports and version control; missing optional data is reported instead of replaced with campus assets.
- One local service supervisor, configurable ports, service readiness checks and logs; optional services follow the active location's capabilities.

## Run and rebuild

For the already prepared package:

```sh
.studio/env/bin/python -m studio validate universeum
.studio/env/bin/python -m studio launch universeum
```

The launch command activates the validated location and runs the local service supervisor. If the supervisor is already running, keep it running and use the existing local URLs.

To prepare on a new checkout, install the environment as described in [Location setup](docs/locations.md), then create the package **once**:

```sh
.studio/env/bin/python - <<'PY'
import json
from studio.locations import create
with open('profiles/universeum.json') as source:
    p = json.load(source)
create(p['id'], p['title'], None, p['layers'], p['resolution'], p['studyDate'],
       projected_bounds=p['sourceBounds'], bounds_crs=p['sourceCrs'],
       mesh_mode=p['meshMode'], table=p['table'], presentation=p['presentation'])
PY

DTCC_LIDAR_DOWNLOAD_TOTAL_TIMEOUT=900 DTCC_LIDAR_DOWNLOAD_SOCK_READ_TIMEOUT=300 \
  .studio/env/bin/python -m studio generate universeum
.studio/env/bin/python -m studio validate universeum
.studio/env/bin/python -m studio launch universeum
```

Resume an interrupted build by rerunning `generate`; omit `create` when the location already exists. The longer LiDAR timeout accommodates large source tiles. Core preparation needs DTCC/OSM and imagery-provider access; live services need the host's own credentials.

Prepared datasets live in ignored `.studio/locations/universeum/`. They are not supplied merely by checking out this branch. To transfer them:

```sh
.studio/env/bin/python -m studio export universeum /tmp/universeum.zip
# On another prepared installation:
.studio/env/bin/python -m studio import /path/to/universeum.zip
.studio/env/bin/python -m studio validate universeum
.studio/env/bin/python -m studio launch universeum
```

## Capture findings and limitations

- Screenshots verify visible Sun Study, wind, stormwater, live transit/Street Life, bird markers, both slideshow slides, table grid, Canvas tools and the desktop controller. They do not verify every setting or numerical result.
- **Isovist:** assets and controls are present, but observer placement did not produce a visible visibility polygon during this capture session, including after reload. No map screenshot is presented as proof of working Isovist analysis; this interaction needs follow-up.
- Street View's provider metadata was checked during preparation; panorama coverage and SAM segmentation were not retested for this gallery.
- One aborted transit-token refresh was logged while switching layers; live vehicle rendering subsequently continued. An interruption during layer switching should not be mistaken for validated continuous service availability.
- The source photograph's tile numbering and physical projector calibration remain outstanding. The 320 × 240 cm model footprint is provisional; the approximate 360 cm outer-table width has not been verified.
- Building heights can use a minimum-height fallback where LiDAR roof samples are missing. Trees and canopy sizes are imagery-derived estimates.
- Stormwater is a visual terrain-flow model with building/water masks; it has no calibrated sewer network or roof-drainage model. Sun, wind and environmental views are exploratory tools.
- EPC, thermal comfort and the four project-specific extensions are not prepared for Universeum.

## Documentation and sources

- [Universeum recipe](profiles/universeum.json), [reproduction notes](profiles/README.md), [validation record](docs/universeum-validation.md).
- [Location workflow](docs/locations.md), [session and phone guide](session/README.md), [general platform README](README.md).
- [Layer catalog](studio/catalog.json) and the local package manifest define availability.
- Geographic inputs: DTCC-provided buildings/LiDAR, OpenStreetMap roads/water and Lantmäteriet infrared imagery for estimated trees. Basemap and live-service credits remain visible in the app.
