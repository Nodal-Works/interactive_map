# Studio wallpaper

## Minimal / natural set

- **TV:** `tv-launch-poster-minimal-1920x1080.png` — light background, navy masthead, actual Chalmers and DTCC logo assets, launch steps, closing reminder, and survey request. Editable SVG alongside it; regenerate using `scripts/create-minimal-studio-poster.cjs`.
- **Projector:** `table-natural-1920x1200.png` — sage ground, warm stone buildings, muted green trees and paths. Uses the exact same geometry and placement as corrected v2, with black outside the footprint. Editable SVG alongside it; regenerate using `scripts/create-natural-table-wallpaper.cjs` after the corrected table generator.

Use the projector PNG at native resolution with **Center**. This set preserves the measured footprint and its approximately one-pixel measurement uncertainty described below.

## Corrected projector image (use this version)

`table-aligned-1920x1200-v2.png` replaces the earlier projector exports. Its map and lettering stay inside the table footprint, with pure black outside. The footprint was measured from the actual fullscreen Edge app's visible Grid Animation: approximately (117,22), (1803,23), (1803,1031), (117,1030), on the 1920x1200 EPSON projection. Edge was at 75% zoom, not the 100% assumed by the earlier exports. The real building, street, and tree layers are mapped into that footprint using a Mercator affine transform.

Set this image at native resolution using Center, without resizing. The footprint measurements are accurate to approximately one screenshot pixel; they are not an exported calibration or a physical measurement. `table-footprint.json` records the anchors. The generator now outputs this corrected v2 projector artwork only and leaves the TV poster unchanged. All older projector versions below are superseded.

## Instruction poster and actual-map table wallpaper

**Confirmed installation:** TV 1920x1080; projector 1920x1200.
Use `tv-launch-poster-1920x1080.png` on the TV and `table-aligned-1920x1200.png` on the projector. The projector export is rendered at its native aspect ratio, not resized from the 16:9 version. Both use the actual campus geometry. Earlier size variants below are retained but are not the installation's selected deliverables.

- `tv-launch-poster-3840x2160.png`: TV launch instructions, closing reminder, and About-page survey request. A 1920x1080 copy is also included.
- `table-aligned-2560x1440.png`: simple campus wallpaper rendered directly from building-footprints.geojson, street-network.geojson, and trees.geojson using map-calibration.json. This resolution fits the complete saved table footprint and approximately matches the configured physical proportions.
- `table-aligned-1920x1080.png`: alternate render at the same map zoom for a 1920x1080 browser viewport; it shows a smaller geographic extent, just as the app does at that viewport size.
- The SVG files are editable sources. `table-aligned.svg` corresponds to the most recent generator run (1920x1200 by default).

For the table, use the image matching the display and set the desktop picture to **Center**, with no stretching, crop, spanning, or overscan. The current files assume 100% operating-system display scaling and 100% browser zoom. Alignment is based on the repository's calibration, with MapLibre's 512-pixel world tile size, zero pitch, saved bearing and center, and the app's 60-pixel side margins. A calibration selected in browser local storage can differ; physical alignment still needs checking on the installation. At other display scaling settings or with a different saved calibration, regenerate for those settings rather than resizing the PNG.

The poster says “Close both windows” and identifies the actual current launcher button as “Close All”. No launcher behavior or system wallpaper settings were changed.

Regenerate with `node scripts/create-studio-wallpapers.cjs` using an installed `sharp` package, or set `STUDIO_SHARP_PATH` to the available package directory. Optional `STUDIO_TABLE_WIDTH` and `STUDIO_TABLE_HEIGHT` set the table viewport dimensions. These assets use deterministic SVG drawing, not AI-generated geography.

## Original decorative wallpaper

Shared artwork for the controller and table desktop before the application launches.
Set `studio-wallpaper.png` as each display's desktop background, using **Fill** for
a 16:9 screen or **Fit** to preserve the whole composition on other aspect ratios.
The artwork is intentionally text-free for viewing from around the table.

Generated with the built-in image generation tool. This is decorative artwork,
not a geographically accurate map. No application code or desktop settings are changed.

## Generation prompt

Use case: stylized-concept
Asset type: desktop wallpaper for both a mixed-reality urban planning table display and its controller, ACE MR Studio at Chalmers.
Primary request: A refined, beautiful atmospheric abstract cartographic wallpaper, landscape 16:9, ideally 3840x2160 pixels. Full-bleed artwork only.
Scene: an imagined Scandinavian urban landscape viewed directly from above, delicate architectural city block outlines and fine topographic contour lines merging into flowing water and wind paths. Abstract and artistic rather than an accurate geographic map. Quiet charcoal black background matching a dark urban visualization application, finely drawn desaturated teal and muted icy blue lines, a restrained scattering of soft warm amber lights at a few street intersections. Broad elegant curving flow through the middle, sparse city geometry around it. Lots of dark breathing room and beautifully controlled detail. Sophisticated museum installation, calm and welcoming before application launch.
Composition: balanced across a wide horizontal canvas, details softly fade into charcoal at all four edges, especially keep leftmost 20 percent quiet enough for desktop icons. Central composition has interest but no glaring hotspot. Flat overhead composition works from multiple viewing directions on a horizontal table. Crisp delicate linework, subtle depth and restrained luminous accents, very smooth dark tonal gradients.
Constraints: no text, no letters, no labels, no logos, no legends, no UI, no buttons, no borders, no monitor mockup, no perspective buildings, no bright neon, no busy sci-fi HUD, no watermark.
