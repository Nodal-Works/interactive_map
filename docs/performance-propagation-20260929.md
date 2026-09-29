# Rendering propagation — 29 September 2026

Applied to `universeum` from published base `0c3eb6a`, using performance changes from
main through `a68dff6`. This is a selective code backport, not a whole-main merge.

## Included changes

- `94db317` and `d6a495f`: cached CFD streaming links and boundaries, cached facade
  sampling weights, shared smoothing factors, cheaper per-cell calculations,
  skipping disabled facade glow, and opt-in solver/render-stage timing.
- Rendering portions of `a83ca97`: direct bitmap presentation for wind/runoff,
  bounded worker submissions, resize revisions, stale-frame disposal and debug
  runoff lines rendered in the worker. Branch-specific DEM transforms stay intact.
- `45e22b6`: cached street-glow paths, decoded-video-frame scheduling with a RAF
  fallback, scoped Street Life layout reads and suspension of hidden controller
  background animation.
- `a8e4028`: prevent stale local HTML/JS/CSS after checkout updates.

No solver resolution, particle counts, antialiasing or quality presets were lowered.
Open `index.html?diagnostics=1` for the optional timing/soak panel. Diagnostics are
not loaded during ordinary use. Existing museum audit controls are retained.

Universeum retains its museum audio wrappers, geographic symbol scaling,
georeferencing and presentation behavior. Its existing rectangle cache is
cleared after each draw, including when drawing fails.

## Validation

- Bit-identical solver populations, velocities and diagnostics against `0c3eb6a`:
  four boundary modes, four angles, obstacles, canopy, forcing and inlet ramp.
- Full CFD suite: numerical/geometry/worker/lifecycle checks, supported resolutions
  and speeds, and both 2400-step campus cases (5 m/s at 0 degrees; 20 m/s at 45).
- Facade probe equivalence and visual controls; profiling pause/resume; worker
  rendering; runoff bitmap and 2D paths, debug lines, resize, stop and late errors.
- Existing applicable branch suites for Street Life, slideshow, georeferencing,
  museum/Artwork, ECOM, sessions, transit, ferry wakes and Pages packaging pass.
- DEM tests pass against independent Python results, including spawn exclusion,
  barriers and uniform rainfall. Lindholmen's Artwork client test passes after
  building `dist/session-client` (the generated directory is not committed).
- Browser smoke: both wind layers start, visibly render and stop with no console
  errors. Missing API credentials limit basemap/Street View checks in the isolated
  test checkouts. These are functional checks, not Dell/Nvidia performance claims.

To repeat solver equivalence from the checkout root:

```sh
git show 0c3eb6a:animations/cfd-core.js > /tmp/cfd-reference.cjs
node scripts/compare_cfd_core.cjs /tmp/cfd-reference.cjs --equivalence-only
node scripts/test_cfd_simulation.cjs
node scripts/test_cfd_visuals.cjs
node scripts/test_cfd_profile.cjs
node scripts/test_runoff_presentation.cjs
node scripts/test_render_efficiency.cjs
```
