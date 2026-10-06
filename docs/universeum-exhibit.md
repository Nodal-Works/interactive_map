# Universeum exhibit

The Universeum branch preserves the EPSG:3007 rectangle
`146087, 6395990, 150018.2, 6401231.6`, the 320 × 240 cm table and 8 × 6 tiles.
Exhibit navigation starts locked. Staff Calibration is the only navigation gate;
phone maps have independent pan and pinch zoom. Map entry points for Apps,
Canvas, Session, controller launch and location creation/import are removed.
Staff session administration and wind obstacle drawing remain available.
Street Life owns transit start/stop. SAM is absent from Universeum services and UI;
Google Street View panoramas remain.

## Mobility data and methods

Prepared browser assets in `media/universeum/mobility` come from
[slow_walkers commit 530a935](https://github.com/SaraAboebeid/slow_walkers/tree/530a93530baf450041075a9c0dd28b6f4787d890).
The importer `studio/mobility.py` records input SHA256 checksums in its manifest.
Research preparation and routing are independent of exhibit startup. Credits include
[the Gothenburg synthetic population](https://zenodo.org/records/10801936).
No person identifiers or credentials are included in browser assets.

Synth Pop averages extra minutes at 4.235 versus 4.8 km/h over all routed
healthcare trips originating in each occupied 200 m EPSG:3006 cell. Cells are
clipped to the projected Universeum footprint and empty cells remain transparent.
This snapshot contains 1,018 local routed trips from 1,006 synthetic residents
aged 75+, with 175 trips losing more than one minute. Journeys uses both
itineraries for that cohort, preserving leg duration, metric route distance and
waiting gaps. Departures are aligned at elapsed time zero. Arrival counters refer
to this trip cohort even when a route leaves the table; rendering is clipped.

Time Lost uses eight completed departures: 06:25, 06:49, 07:15, 07:38, 08:09,
08:31, 09:02 and 09:30. It divides accumulated extra minutes by accumulated
missed-connection trips; combined averages are trip-weighted, not an average of
departure averages. No routed trips is missing; routed trips with no modelled
missed connections is zero. RegSO summaries describe origins within the table.
The committed GPKG averages are from a different routing run and are never used.

The local rerun uses 2,064 unique origins spaced 100 m over the calibrated table.
Continuous shading uses 50 m cells, inverse-distance interpolation from at most
four valid origins within 150 m, and no cell outlines. Interpolation does not add
routing coverage. The 8 departures cover 16,512 origin-samples with no missing
routing results. Point order, CRS, recipe, dependency versions, output checksums
and pinned upstream input checksums are recorded in the mobility manifest.

Both layers share the analysis pass, opacity controls and lifecycle. The host
owns playback, sends authoritative state on changes/reconnect and releases
animation scheduling when paused, disabled or hidden. Phones receive compact
state and explanations, without route or heatmap geometry. Editing slots and
spectator restrictions use the existing session protocol.

## Reprepare and recover

Keep research inputs under ignored `.studio/cache/mobility/<commit>/`. The
reproducible reroute uses the pinned 530a935 snapshot, its checksummed GTFS, OSM
and synthetic-trip inputs, Python 3.12, r5py 1.1.7 and OpenJDK 21. It builds one
shared transport network, checkpoints sequential 128-origin batches and uses a
12 GB Java heap. The 32-origin benchmark completed all eight sample departures;
the full table rerun took 4,069 seconds (about 68 minutes), peaked at 3.3 GiB RSS,
and the 1,018-trip synthetic rerun took 109 seconds. To reproduce:

```sh
.studio/routing-env/bin/python -m studio.mobility_run --benchmark
.studio/routing-env/bin/python -m studio.mobility_run
.studio/env/bin/python -m studio.exhibit universeum \
  --mobility-source .studio/cache/mobility/universeum-100m-20260922
.studio/env/bin/python -m studio validate universeum
.studio/env/bin/python -m studio export universeum \
  .studio/exports/universeum-exhibit-20261006-mobility.zip
```

`studio.mobility_run` downloads and verifies the pinned inputs when needed. An
interrupted run resumes completed batches; exhibit startup never invokes routing.
Keep the recovery ZIP and `universeum.previous` package until the new export has
been checked on the table.

Wind includes complete building polygons and holes 500 m beyond the table.
The absorbing collar starts beyond that context; the outer boundary stays open.
The simulation remains a qualitative 2D flow model. Fast WebGL rendering has a
worker/CPU fallback and retains physical mark scale. Prepared public geometry
is included in `media/universeum`; geographic regeneration keeps these assets.
For a changed extent, regenerate context and mobility rather than reusing them.

Comfort assets are prepared for **15 July 2026**, at 2 m resolution, using the
existing geographic foundation, Earth Engine, OSM and NASA POWER data. They
contain hourly PET and walking costs from 08:00 to 20:00. The Earth Engine key
path lives in ignored `.studio/private/credentials.json`; the key remains outside
Git. `studio.runtime.environment()` supplies private configuration to preparation.
After preparing a separate studies directory, install it with:

```sh
.studio/env/bin/python -m studio.exhibit universeum \
  --prepared-studies .studio/cache/universeum-exhibit/studies
.studio/env/bin/python -m studio validate universeum
.studio/env/bin/python -m studio launch universeum
```

The updater validates checksums and atomically replaces a package, preserving
`universeum.previous`. The original working package is additionally retained in
`.studio/recovery/universeum-before-20261005`. Export the complete active package
for moving the prepared comfort data to another museum machine. Startup only
serves prepared assets and starts required services; it does not run research.

Slideshow categories use local buildings and streets. SLU WMS includes aerial,
infrared, 1960/1975 historical imagery, hillshade and property layers; reveal,
retry and unavailable-coverage reporting use the existing slideshow controller.
External imagery availability depends on the provider and network.

## Release and checks

Host/client release: `20261006-universeum-mobility-3`.
The public client remains `/interactive_map/universeum/client.html`. The existing
Pages workflow assembles all three branch clients into one deployment. Its
allowlisted builder includes Universeum phone targeting geometry and Lucide icons;
it excludes host code, calibration, credentials and prepared comfort rasters.

```sh
node scripts/test_mobility.cjs
node scripts/test_universeum_controls.cjs
.studio/env/bin/python -m unittest studio.test_mobility studio.test_pipeline
python3 scripts/build_session_client.py
```

Existing session, connection, table, renderer, wind and slideshow tests also
apply. On the physical installation, confirm the QR's projected size and image
legibility at the final projector resolution.
