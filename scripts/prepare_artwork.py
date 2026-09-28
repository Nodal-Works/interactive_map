"""Extract original Illustrator paths with pypdf/Pillow and Poppler.

Choose a source explicitly with --source (relative to the repository). Otherwise
reuse the manifest's source; never silently choose a different .ai from a glob.
No tracing or simplification. All assets retain the original artboard and masks.
"""
from pathlib import Path
import argparse, base64, hashlib, io, json, re, subprocess, tempfile
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'media/artwork'
PAINT = {b'S', b's', b'f', b'F', b'f*', b'B', b'B*', b'b', b'b*'}
IDENTITY = (1, 0, 0, 1, 0, 0)

def multiply(a, b):
    return (a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5])

def prepare(source):
    OUT.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(source)
    page = reader.pages[0]
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    # A changed artboard needs a new registration, not an implicit stretch.
    if list(map(float, page.mediabox)) != [0, 0, 3370, 2384]:
        raise ValueError('Source artboard changed; re-register the drawing first')
    operations = ContentStream(page.get_contents(), reader).operations
    names = {str(key): str(value.get_object()['/Name']) for key, value in page['/Resources']['/Properties'].items()}
    numbered = {int(match[1]): key for key, name in names.items() if (match := re.fullmatch(r'artwork\s+(\d+)', name, re.I))}
    if sorted(numbered) != list(range(1, len(numbered)+1)) or not numbered:
        raise ValueError('Artwork layers must be numbered consecutively from 1')
    items = [{'id': n, 'label': f'Artwork {n}', 'group': numbered[n],
              'field': f'field-{n}.svg', 'sculpture': f'sculpture-{n}.svg'} for n in sorted(numbered)]
    stacking = []
    reverse = {group: n for n, group in numbered.items()}
    for args, op in operations:
        if op == b'BDC' and str(args[-1]) in reverse:
            n = reverse[str(args[-1])]
            if n not in stacking: stacking.append(n)

    def export(filename, groups, kind):
        group = None; result = []
        for index, (args, op) in enumerate(operations):
            if op == b'BDC': group = str(args[-1]); continue
            if op == b'EMC': group = None; continue
            selected = group in groups
            # Exclude the paper rectangle and trim border, not architectural ink.
            if kind == 'base' and index < 16: selected = False
            if op in PAINT:
                result.append((args, op) if selected and kind != 'sculpture' else ([], b'n'))
            elif op == b'Do':
                is_image = page['/Resources']['/XObject'][args[0]].get_object()['/Subtype'] == '/Image'
                if selected and (is_image == (kind == 'sculpture')): result.append((args, op))
            else: result.append((args, op))
        writer = PdfWriter(); writer.add_page(page)
        stream = ContentStream(None, writer); stream.operations = result
        writer.pages[0][NameObject('/Contents')] = writer._add_object(stream)
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td)/'source.pdf'
            with pdf.open('wb') as f: writer.write(f)
            subprocess.run(['pdftocairo', '-svg', str(pdf), str(OUT/filename)], check=True)
        svg = (OUT/filename).read_text()
        def smaller(match):
            im = Image.open(io.BytesIO(base64.b64decode(match[1])))
            im.thumbnail((1024, 1024)); data = io.BytesIO(); im.save(data, format='PNG', optimize=True)
            return 'data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
        svg = re.sub(r'data:image/png;base64,([A-Za-z0-9+/=\s]+)', smaller, svg)
        (OUT/filename).write_text(svg)

    export('base.svg', {k for k, v in names.items() if v in ('Layer 2', 'Layer 1')}, 'base')
    for item in items:
        export(item['field'], {item['group']}, 'field')
        export(item['sculpture'], {item['group']}, 'sculpture')
        group = None; matrix = IDENTITY; stack = []; bounds = []
        for args, op in operations:
            if op == b'BDC': group = str(args[-1])
            elif op == b'EMC': group = None
            elif op == b'q': stack.append(matrix)
            elif op == b'Q': matrix = stack.pop()
            elif op == b'cm': matrix = multiply(matrix, tuple(map(float, args)))
            elif group == item['group'] and op == b'Do':
                obj = page['/Resources']['/XObject'][args[0]].get_object()
                def point(x, y, m=matrix): return [m[0]*x+m[2]*y+m[4], height-(m[1]*x+m[3]*y+m[5])]
                if obj['/Subtype'] == '/Form':
                    box = list(map(float, obj['/BBox']))
                    m = multiply(matrix, tuple(map(float, obj.get('/Matrix', IDENTITY))))
                    bounds.extend(point(x, y, m) for x in box[::2] for y in box[1::2])
                elif obj['/Subtype'] == '/Image': item['anchor'] = point(.5, .5)
        if not bounds or 'anchor' not in item: raise ValueError(f"Incomplete layer: {item['label']}")
        item['fieldBounds'] = [min(p[0] for p in bounds), min(p[1] for p in bounds), max(p[0] for p in bounds), max(p[1] for p in bounds)]
        del item['group']
    locations = {k for k, v in names.items() if v.lower() == 'all artwork locations'}
    if locations: export('locations.svg', locations, 'field')
    manifest = {'version': 2, 'credit': 'Artwork and visibility studies by Vishvi Rajakaruna',
                'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'width': width, 'height': height, 'base': 'base.svg', 'stacking': stacking, 'items': items}
    if locations: manifest['locations'] = 'locations.svg'
    existing = OUT/'manifest.json'
    if existing.exists():
        old = json.loads(existing.read_text())
        if 'registration' in old: manifest['registration'] = old['registration']
    existing.write_text(json.dumps(manifest, indent=2)+'\n')
    print(f'Extracted {len(items)} original artwork layers from {source.name}: {OUT}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    source = args.source or Path('artwork')/json.loads((OUT/'manifest.json').read_text())['source']
    prepare(source if source.is_absolute() else ROOT/source)
