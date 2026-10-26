"""Import an explicitly selected PDF colour layer without changing map calibration.

Requires pypdfium2 and Pillow. Original PDFs stay outside the published assets.
Use --normalize-artboard only after checking the overlay against the linework.
"""
from pathlib import Path
import argparse
import hashlib
import json

import pypdfium2 as pdfium
from PIL import Image


def prepare(source, root, normalize_artboard=False, pixel_width=6740):
    source = source.resolve(strict=True)
    assets = root / 'media' / 'artwork'
    manifest_path = assets / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    width, height = manifest['width'], manifest['height']
    if pixel_width < width or pixel_width > 8192:
        raise ValueError('Choose a colour image width between the artboard width and 8192px')
    with pdfium.PdfDocument(source) as document:
        if len(document) != 1:
            raise ValueError('Select a single-page artwork PDF')
        page = document[0]
        page_width, page_height = page.get_size()
        mismatch = abs((page_width / page_height) / (width / height) - 1)
        if mismatch > .002:
            raise ValueError('Artboard proportions changed; register the colour artwork before importing')
        if (abs(page_width-width) > .1 or abs(page_height-height) > .1) and not normalize_artboard:
            raise ValueError('PDF artboard differs. Check alignment and explicitly use --normalize-artboard')
        bitmap = page.render(scale=pixel_width/page_width, fill_color=(0, 0, 0, 0))
        rgba = bitmap.to_pil().convert('RGBA')
        target_size = (pixel_width, round(pixel_width * height / width))
        if rgba.size != target_size:
            rgba = rgba.resize(target_size, Image.Resampling.LANCZOS)
        if rgba.getchannel('A').getextrema()[0] == 255:
            raise ValueError('This PDF has no transparency; use the transparent colour export')
        bitmap.close()
        page.close()
    # Content address the export so old browser and companion caches cannot
    # substitute an earlier image for a new PDF with the same filename.
    import io
    buffer = io.BytesIO()
    rgba.save(buffer, format='WEBP', lossless=True, method=6)
    content = buffer.getvalue()
    image_hash = hashlib.sha256(content).hexdigest()
    filename = f'colour-{image_hash[:12]}.webp'
    (assets / filename).write_bytes(content)
    manifest['colour'] = filename
    manifest['colourSource'] = {
        'source': source.name,
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'pageSize': [page_width, page_height],
        'pixelSize': list(target_size),
        'artboardSize': [width, height],
        'alignment': 'normalized-to-line-artboard' if normalize_artboard else 'same-artboard',
        'alpha': True,
        'imageSha256': image_hash,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'asset': str(assets / filename), 'bytes': len(content), 'pixelSize': target_size}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--normalize-artboard', action='store_true')
    parser.add_argument('--pixel-width', type=int, default=6740)
    args = parser.parse_args()
    prepare(args.source, args.root.resolve(), args.normalize_artboard, args.pixel_width)
