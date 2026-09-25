"""Extract Vishvi Rajakaruna's original Illustrator paths; requires pypdf/Pillow and Poppler.

No tracing, simplification or edits to the source artwork. Derived SVGs share the
PDF artboard. Images embedded by Poppler are resized only when larger than 1024px.
"""
from pathlib import Path
import base64, hashlib, io, json, re, subprocess, tempfile
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = next((ROOT/'artwork').glob('*.ai'))
OUT = ROOT/'media/artwork'
PAINT = {b'S', b's', b'f', b'F', b'f*', b'B', b'B*', b'b', b'b*'}

def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(SOURCE)
    page = reader.pages[0]
    operations = ContentStream(page.get_contents(), reader).operations
    properties = page['/Resources']['/Properties']
    names = {key: value.get_object()['/Name'] for key, value in properties.items()}
    items = []
    for number in range(1,8):
        group = next(k for k,v in names.items() if v == f'artwork {number}')
        items.append({'id': number, 'label': f'Artwork {number}', 'group': group,
                      'field': f'field-{number}.svg', 'sculpture': f'sculpture-{number}.svg'})
    def export(filename, groups, kind):
        group = None; result = []; last_matrix = None
        for index, (args, op) in enumerate(operations):
            if op == b'BDC': group = str(args[-1]); continue
            if op == b'EMC': group = None; continue
            selected = group in groups
            if kind == 'base' and index < 16: selected = False
            if op in PAINT:
                result.append((args,op) if selected and kind != 'sculpture' else ([],b'n'))
            elif op == b'Do':
                is_image = str(args[0]).startswith('/Im')
                if selected and (is_image == (kind == 'sculpture')):
                    result.append((args,op))
            else: result.append((args,op))
        writer = PdfWriter(); writer.add_page(page)
        stream = ContentStream(None,writer); stream.operations = result
        writer.pages[0][NameObject('/Contents')] = writer._add_object(stream)
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td)/'source.pdf'
            with pdf.open('wb') as f: writer.write(f)
            subprocess.run(['pdftocairo','-svg',str(pdf),str(OUT/filename)],check=True)
        svg = (OUT/filename).read_text()
        def smaller(match):
            im = Image.open(io.BytesIO(base64.b64decode(match[1])))
            im.thumbnail((1024,1024)); data=io.BytesIO(); im.save(data,format='PNG',optimize=True)
            return 'data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
        svg = re.sub(r'data:image/png;base64,([A-Za-z0-9+/=\s]+)',smaller,svg)
        (OUT/filename).write_text(svg)
    export('base.svg', {'/MC0','/MC1'}, 'base')
    for item in items:
        export(item['field'], {item['group']}, 'field')
        export(item['sculpture'], {item['group']}, 'sculpture')
        group=None; matrix=None
        for args,op in operations:
            if op==b'BDC': group=str(args[-1])
            if op==b'EMC': group=None
            if op==b'cm': matrix=list(map(float,args))
            if group==item['group'] and op==b'Do' and str(args[0]).startswith('/Fm'):
                bounds=list(map(float,page['/Resources']['/XObject'][args[0]].get_object()['/BBox']))
                item['fieldBounds']=[min(bounds[0],bounds[2]),2384-max(bounds[1],bounds[3]),max(bounds[0],bounds[2]),2384-min(bounds[1],bounds[3])]
            if group==item['group'] and op==b'Do' and str(args[0]).startswith('/Im'):
                a,b,c,d,e,f=matrix
                item['anchor']=[e+a/2,2384-(f+d/2)]
        del item['group']
    # Order is part of Vishvi's original composition, independent of chapter order.
    manifest={'version':1,'credit':'Artwork and visibility studies by Vishvi Rajakaruna',
              'source':SOURCE.name,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'width':3370,'height':2384,'base':'base.svg','stacking':[5,6,2,1,3,7,4],'items':items}
    existing=OUT/'manifest.json'
    if existing.exists():
        old=json.loads(existing.read_text())
        if 'registration' in old: manifest['registration']=old['registration']
    existing.write_text(json.dumps(manifest,indent=2)+'\n')
    print('Extracted original vectors and sculpture images:',OUT)

if __name__=='__main__': prepare()
