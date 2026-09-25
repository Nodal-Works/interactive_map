# Reproducible locations (dev)

The location pipeline lives on `dev`, based on main revision `9c08f793`. It keeps common map and collaboration features in one application and resolves location data through a versioned package. Campus, FCC and ECOM are project extensions, disabled for new locations. Lindholmen's curated cultural sites, branding and optional introduction are a separate profile; see `profiles/README.md`.

## Set up once

Use Python 3.12, Git and a C++ compiler on macOS or Linux. On macOS install Xcode Command Line Tools; on Ubuntu install `python3.12-venv`, `build-essential` and Git. Windows uses WSL2 Ubuntu (`setup-studio.ps1` prints the steps). Native Windows preparation is not supported.

```sh
python3.12 scripts/setup_studio.py
.studio/env/bin/python -m studio doctor
.studio/env/bin/python scripts/services.py
```

Open `http://127.0.0.1:8090/locations.html` (use your configured host port). Search for a Swedish place or draw two corners, name the location, select layers and create it. Configure source connections, choose **Generate / resume**, then **Validate** and **Launch**. The launcher opens the map, host dashboard and phone invitation. Keep the service supervisor running to start the selected location's backends automatically.

The wizard uses a standard approximately 2 × 2 km area. Limits are 6 km per side and 8 million raster cells. The displayed memory estimate covers raster working arrays, not the full LiDAR download or meshing peak. Large areas require substantial additional memory. Buildings/LiDAR coverage is determined by DTCC; Sweden's bounding rectangle is a coarse input guard, not a guarantee of coverage.

## CLI example: Trollhättan

```sh
.studio/env/bin/python -m studio create trollhattan --title 'Trollhättan' --location Trollhättan --size 2000
.studio/env/bin/python -m studio generate trollhattan
.studio/env/bin/python -m studio validate trollhattan
.studio/env/bin/python -m studio launch trollhattan
.studio/env/bin/python -m studio export trollhattan /tmp/trollhattan.zip
```

Alternatively use `--bbox west south east north` (WGS84) or `--bbox-sweref xmin ymin xmax ymax` (EPSG:3006 by default); pass `--bounds-crs EPSG:3007` for SWEREF 99 12 00. Projected recipes preserve the original rectangle and use a covering EPSG:3006 generation envelope. Use `--mesh-mode display` for a display surface assembled from individual LOD1 buildings and terrain; the default `conditioned` mode retains city-wide footprint cleaning. Set `--study-date YYYY-MM-DD` when preparing thermal comfort. `--layers` accepts catalog IDs from `studio/catalog.json`; omit source-dependent layers when they are not needed. A missing optional source is reported as unavailable, never replaced with campus data. A completed core build can therefore include unavailable optional capabilities; inspect the generation report before presenting it.

On another host, run `python -m studio import /path/to/trollhattan.zip`, validate and launch it. Prepared files need no source credentials to import. Live APIs still need that host's own credentials and services. ZIPs carry the recipe, manifest, checksums and prepared assets, with no source connection file. Treat provider data attribution and redistribution terms as part of distributing a package.

## Connections

Connections are saved only in `.studio/private/credentials.json` (mode 0600), outside exports and version control. SSH passwords are never stored: configure an SSH alias and agent first.

- EPC: provide the SSH alias and remote loopback port of the hosted EPC Browser API. The exporter opens a temporary loopback tunnel, queries the selected extent and closes its own tunnel. A capped spatial response is subdivided, with certificate-ID deduplication. Certificate attributes stay attached to their source geometry.
- Earth Engine: supply project ID and local service-account JSON path. A thermal study also needs a date. API credentials are not an assurance of source coverage for that date/area.
- Street View and Västtrafik: supply local API credentials and use the wizard's connection tests. Existing local `trafik-config.json` credentials can be used initially. Service access tests do not guarantee every street has imagery or every area has transit coverage.

## Reproducibility and recovery

`.studio/locations/<id>/location.json` declares extent, layers, assets, provenance, alignment, branding and presentation. `recipe.json` records generation settings. `studio/requirements.lock` pins Python packages and DTCC Git revisions. Native compiler/build dependencies still depend on the host platform. CLI and wizard workers share an operating-system lock. Stage caches check file hashes before reuse. Cancelling or failing a core build preserves the previous package; successful replacement retains `<id>.previous` for recovery. Resume reruns failed stages and reuses matching completed stages. `--refresh` invalidates the local stage cache; upstream DTCC caches may still contain earlier downloads.

Terrain stays pristine for sun/trees. Stormwater uses OSM water polygons (including island holes), with no additional land-use API dependency. It has separate terrain, building and water bands; inland water is not inferred solely from elevation. These are visual exploration models, not a calibrated drainage/flood simulation. Generated tree positions and dimensions are estimates from CIR imagery. Default bird-sound positions are illustrative, not field observations. Local calibration keys and service data paths are scoped to the location ID.

The public phone client receives the host's title and enabled layer catalog. It continues to send controls to the host rather than run location preparation. `scripts/build_pages_site.py` builds the stable client at the root and dev at `/dev/`. Install the shared Pages workflow on main before enabling deployment from both branches, otherwise the old main workflow can overwrite the combined site.

## Migration gates

`python -m studio import-legacy lindholmen` imports the pinned Lindholmen presentation into a local package without modifying that branch. The cultural-site dataset and logo order are preserved; intro can be disabled with `presentation.intro: false`. `import-legacy campus` preserves the corresponding main presentation. Imported packages report asset availability; live-service credentials still need verification.

Do not merge this foundation into Lindholmen until real data generation, portable-package round trips, host/client interaction, visual alignment and the target operating systems pass. A macOS build alone does not certify Linux or Windows/WSL. EPC and thermal live validation require their configured source access. Main and Lindholmen branches remain migration targets, not automatic deployment outputs of the generator.
