# Artwork source and extraction

Artwork and visibility studies by **Vishvi Rajakaruna**.

The current source is `artwork/artworks file.ai` (28 September 2026): ten numbered
artworks, original architectural drawing, and an “all artwork locations” overlay.
The originals remain local and unchanged; only derived SVGs and their manifest
are packaged for the table and companion client.

Regenerate with Python containing pypdf and Pillow, plus Poppler on PATH:

```sh
python scripts/prepare_artwork.py --source "artwork/artworks file.ai"
python scripts/register_artwork.py
python scripts/build_session_client.py
node scripts/test_artwork.cjs
node scripts/test_artwork_lifecycle.cjs
node scripts/test_artwork_client.cjs
```

Without `--source`, extraction reuses the manifest source instead of choosing an
arbitrary AI file. Numbered layers define the chapter count; PDF paint order
defines field stacking. The locations overlay appears only in the finale.
Sculpture images stay above accumulated fields. Source labels remain Artwork 1–10.

The new architectural paths match the earlier drawing exactly (excluding paper
and trim rectangles). The unchanged six-point affine registration gives 0.077 m
RMS error, with three independent landmarks below 0.3 m. No buildings are warped.

The host publishes `artworkCount` for local and phone dashboards. Release
`20260928-lindholmen-artwork-6` packages all ten fields and sculptures plus the
location overlay; asset requests use the source hash to avoid stale SVGs.
