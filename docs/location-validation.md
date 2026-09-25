# Development validation — 25 September 2026

Implementation is in the local `dev` checkout. No branch has been pushed or deployed by this work. Main and Lindholmen remain unchanged.

## Verified

- Real Trollhättan data: approximately 2 km neighborhood, EPSG:3006 terrain at 2 m resolution, 1,474 source building footprints. Building conditioning merges/simplifies footprints for the mesh; source footprints remain separate.
- Browser rendering of the Trollhättan basemap and rebuilt building-volume model. Live Västtrafik returned vehicles. Street View credential metadata check succeeded; imagery coverage is not certified across the area.
- OSM water polygon conversion: split multipolygon rings and island holes preserved; wetlands and open unclosed ways excluded. OSM can time out; retries report unavailability rather than fabricating a water mask.
- Package checksums, traversal rejection, corrupt geographic data detection, prepared-package ZIP round trip to an independent temporary host directory.
- Generation failure preserves prior assets. The real Trollhättan repeat build reused all eight geographic stages from cache. Its 70.7 MB exported ZIP imported into a clean directory and passed checksum validation. Fixture tests also verify unchanged settings and checksums.
- Nine Python package/pipeline/OSM tests, six DEM/flow tests including Python/browser parity, two host service boundary tests, and existing JavaScript configuration, session, connection, slideshow, transit and ECOM lifecycle tests.
- Phone-client static build succeeds. The local phone page shows the active location catalog without campus/FCC/ECOM.
- Preserved Lindholmen package validates locally, including Cultural Gravity's dataset. Its unavailable prepared layers are reported explicitly.

## Gates still open

- Full phone/host interaction over an established WebRTC connection and a physical phone. The browser attempt remained at Connecting; static rendering and protocol tests are not an end-to-end connection test.
- EPC export from the hosted browser: SSH access method is known, but alias and remote API port are still needed.
- Earth Engine thermal study generation for a selected date and area.
- Linux and Windows/WSL installation and portable-package launch on those systems. The current native preparation test is macOS ARM64 / Python 3.12.
- Numerical/visual alignment validation at additional extents and bearings; forward/inverse transforms have unit coverage, but that is not a calibrated table acceptance test.
- Apply the shared Pages publisher to main before enabling dual-branch deployment; verify the deployed dev invitation URL.
- Upgrade Lindholmen after these gates pass, preserving its cultural sites, ordered attribution logos and optional introduction.

These open gates mean this is a development foundation, not a certified reproducible release across every source and host platform.
