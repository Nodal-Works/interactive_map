"""Versioned, portable location packages. No third-party runtime dependencies."""
from __future__ import annotations
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
HOME = Path(os.environ.get('MR_STUDIO_HOME', ROOT / '.studio')).resolve()
CATALOG = json.loads((ROOT / 'studio/catalog.json').read_text())
IDS = {item['id'] for item in CATALOG}

def stamp():
    return datetime.now(timezone.utc).isoformat()

def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False, encoding='utf8') as f:
        json.dump(value, f, indent=2, ensure_ascii=False, allow_nan=False)
        f.write('\n')
        temporary = f.name
    os.replace(temporary, path)

def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for part in iter(lambda: f.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()

def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', value):
        raise ValueError('Location ID must contain lowercase letters, numbers and hyphens (1–64 characters)')
    return value

def safe_path(folder, name):
    if not isinstance(name, str) or '\\' in name or ':' in name or not name or Path(name).is_absolute():
        raise ValueError('Expected a relative package path')
    target = (Path(folder) / name).resolve()
    if not target.is_relative_to(Path(folder).resolve()) or '..' in Path(name).parts:
        raise ValueError('Path escapes the location package')
    return target

def directory(key):
    return HOME / 'locations' / identifier(key)

def load(key):
    value = json.loads((directory(key) / 'location.json').read_text())
    check_manifest(value)
    return value

def check_manifest(value):
    if value.get('schemaVersion') != 1:
        raise ValueError('Unsupported location package version')
    identifier(value.get('id'))
    bounds = value.get('bounds', [])
    if len(bounds) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) for v in bounds):
        raise ValueError('Expected four finite WGS84 bounds')
    w, s, e, n = bounds
    if not (-180 <= w < e <= 180 and -85 < s < n < 85):
        raise ValueError('Bounds must be west, south, east, north')
    if not isinstance(value.get('layers'), list) or not set(value['layers']) <= IDS:
        raise ValueError('Unknown layer IDs')
    table = value.get('table', {})
    for name in ('tableWidth', 'tableHeight', 'screenWidth', 'screenHeight', 'tileSize', 'columns', 'rows', 'sidebarWidth'):
        number = table.get(name)
        if number is not None and (type(number) not in (int, float) or not math.isfinite(number) or number <= 0 or (name in ('columns', 'rows') and int(number) != number)):
            raise ValueError('Invalid table ' + name)
    if table.get('layoutMode', 'legacy') not in ('legacy', 'preview', 'projector'):
        raise ValueError('Invalid table layout mode')
    for name, info in value.get('assets', {}).items():
        safe_path(directory(value['id']), name)
        if not isinstance(info, dict) or not re.fullmatch('[0-9a-f]{64}', info.get('sha256', '')):
            raise ValueError('Each asset requires a SHA256 checksum')

def projected_extent(bounds, crs):
    """Preserve a projected rectangle and derive covering provider/view extents."""
    from pyproj import CRS, Transformer
    source = CRS.from_user_input(crs)
    if not source.is_projected:
        raise ValueError('Projected bounds require a projected CRS')
    if len(bounds) != 4 or any(not math.isfinite(x) for x in bounds) or not (bounds[0] < bounds[2] and bounds[1] < bounds[3]):
        raise ValueError('Expected ordered finite projected bounds')
    view = Transformer.from_crs(source, 4326, always_xy=True)
    provider = Transformer.from_crs(source, 3006, always_xy=True)
    x0,y0,x1,y1 = bounds
    return {'sourceBounds': list(bounds), 'sourceCrs': source.to_string(),
            'bounds': list(view.transform_bounds(*bounds)),
            'generationBounds': list(provider.transform_bounds(*bounds)),
            'corners': [list(view.transform(x,y)) for x,y in ((x0,y0),(x1,y0),(x1,y1),(x0,y1))],
            'center': list(view.transform((x0+x1)/2,(y0+y1)/2))}

def estimate(bounds, resolution=2, generation_bounds=None):
    if not isinstance(bounds,(list,tuple)) or len(bounds)!=4 or any(type(x) not in (int,float) or not math.isfinite(x) for x in bounds):
        raise ValueError('Expected four finite bounds')
    w, s, e, n = bounds
    if not (-180<=w<e<=180 and -85<s<n<85):raise ValueError('Invalid extent')
    width = (e-w)*111320*math.cos(math.radians((s+n)/2))
    height = (n-s)*111320
    if generation_bounds is not None:
        width = generation_bounds[2] - generation_bounds[0]
        height = generation_bounds[3] - generation_bounds[1]
    if not .5 <= resolution <= 20:
        raise ValueError('Resolution must be between 0.5 and 20 metres')
    cells = math.ceil(width / resolution) * math.ceil(height / resolution)
    return {'widthMetres': round(width), 'heightMetres': round(height), 'rasterCells': cells,
            'estimatedWorkingMemoryMB': math.ceil(cells * 160 / 1024**2),
            'supported': width <= 6000 and height <= 6000 and cells <= 8_000_000}

def create(key, title, bounds, layers=None, resolution=2, study_date=None, projected_bounds=None, bounds_crs=None, mesh_mode="conditioned", table=None, presentation=None):
    key = identifier(key)
    if mesh_mode not in ('conditioned','display'):
        raise ValueError('Unknown mesh mode')
    value = {'schemaVersion': 1, 'id': key, 'title': str(title)[:150], 'bounds': bounds,
        'layers': layers if layers is not None else [x['id'] for x in CATALOG if not x.get('project')],
        'assets': {}, 'capabilities': {}, 'createdAt': stamp(),
        'recipe': {'bounds': bounds, 'resolution': resolution, 'studyDate': study_date, 'seed': 0, 'meshMode': mesh_mode},
        'branding': {'logos': []}, 'presentation': {'intro': False},
        'table': {'screenWidth':111.93,'screenHeight':62.96,'tableWidth':100,'tableHeight':60,'tileSize':20}}
    if table is not None:
        value['table'].update(table)
    if presentation is not None:
        value['presentation'].update(presentation)
    if projected_bounds is not None:
        extent = projected_extent(projected_bounds, bounds_crs or 'EPSG:3006')
        bounds = extent['bounds']
        value['bounds'] = bounds
        value['recipe'].update(extent)
    check_manifest(value)
    if not (10 <= bounds[0] < bounds[2] <= 25 and 55 <= bounds[1] < bounds[3] <= 70):
        raise ValueError('Select an extent within Sweden')
    if not estimate(bounds, resolution, value['recipe'].get('generationBounds'))['supported']:
        raise ValueError('Select a neighbourhood no larger than 6 km on either side and 8 million raster cells')
    folder = directory(key)
    folder.mkdir(parents=True, exist_ok=False)
    write_json(folder / 'location.json', value)
    write_json(folder / 'recipe.json', value['recipe'])
    return value

def list_locations():
    result = []
    for path in sorted((HOME / 'locations').glob('*/location.json')):
        try:
            value = load(path.parent.name)
            result.append({k:value.get(k) for k in ('id','title','bounds','capabilities','updatedAt')})
        except (ValueError, OSError):
            continue
    return result

def active():
    try:
        return load(json.loads((HOME / 'active.json').read_text())['id'])
    except FileNotFoundError:
        return None

def activate(key):
    report = validate(key)
    if not report['valid']:
        raise ValueError('Package validation failed: ' + '; '.join(report['errors']))
    value=load(key)
    if not any(value.get('capabilities',{}).get(layer,{}).get('status')=='ready' for layer in value['layers']):
        raise ValueError('No selected layer is ready; prepare a common layer before launching')
    write_json(HOME / 'active.json', {'id': key, 'changedAt': stamp()})
    return load(key)

def validate(key):
    value = load(key)
    folder = directory(key)
    errors = []
    for name, info in value['assets'].items():
        path = safe_path(folder, name)
        if not path.is_file() or digest(path) != info['sha256']:
            errors.append('Missing or changed asset: ' + name)
        elif name.endswith('.geojson'):
            try:
                data = json.loads(path.read_text())
                if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
                    raise ValueError('Expected FeatureCollection')
                def check_coords(coords):
                    if len(coords) >= 2 and isinstance(coords[0], (int,float)):
                        if not all(math.isfinite(x) for x in coords) or not -180 <= coords[0] <= 180 or not -90 <= coords[1] <= 90:
                            raise ValueError('Coordinates are not WGS84')
                    else:
                        for item in coords: check_coords(item)
                for feature in data['features']:
                    check_coords(feature['geometry']['coordinates'])
            except (ValueError, KeyError, TypeError):
                errors.append('Invalid geographic data: ' + name)
    if not value['assets']:
        errors.append('No prepared assets')
    return {'id':key, 'valid':not errors, 'errors':errors, 'capabilities':value.get('capabilities', {})}

def export_package(key, output):
    report = validate(key)
    if not report['valid']: raise ValueError('; '.join(report['errors']))
    value = load(key)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ['location.json', 'recipe.json', *value['assets']]:
            path = safe_path(directory(key), name)
            if path.is_file(): archive.write(path, name)
    return str(output)

def import_package(source):
    with zipfile.ZipFile(source) as archive:
        members = archive.infolist()
        if len(members) > 20000 or sum(x.file_size for x in members) > 20*1024**3:
            raise ValueError('Package exceeds import limits')
        if len({x.filename for x in members}) != len(members): raise ValueError('Duplicate archive entries')
        if archive.getinfo('location.json').file_size > 4*1024**2: raise ValueError('Manifest too large')
        raw = archive.read('location.json')
        value = json.loads(raw)
        check_manifest(value)
        folder = directory(value['id'])
        if folder.exists(): raise ValueError('Location already exists; use a different ID')
        allowed = {'location.json','recipe.json', *value['assets']}
        HOME.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=HOME) as staging:
            for member in members:
                if member.is_dir(): continue
                if member.filename not in allowed or (member.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('Unexpected file in package')
                target = safe_path(staging, member.filename)
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as src, target.open('wb') as dst: shutil.copyfileobj(src,dst)
            for name, info in value['assets'].items():
                if digest(safe_path(staging,name)) != info['sha256']: raise ValueError('Checksum mismatch: '+name)
            if json.loads((Path(staging)/'recipe.json').read_text()) != value['recipe']:
                raise ValueError('Recipe does not match manifest')
            folder.parent.mkdir(parents=True,exist_ok=True)
            os.replace(staging, folder)
    return value

def register_assets(folder, value):
    value['assets'] = {str(p.relative_to(folder)).replace(os.sep,'/'):{'sha256':digest(p),'bytes':p.stat().st_size}
        for sub in ('media','studies') for p in sorted((folder/sub).rglob('*')) if p.is_file() and not p.is_symlink()}
    value['updatedAt'] = stamp()
    return value

def frontend_config(value):
    # Keep compatibility with existing modules while resolving every location asset explicitly.
    config = json.loads((ROOT / 'app-config.js').read_text().split('window.APP_CONFIG = ',1)[1].rsplit(';',1)[0])
    key=value['id']; w,s,e,n=value['bounds']; lat=(s+n)/2; lng=(w+e)/2
    lng,lat=value['recipe'].get('center',[lng,lat])
    width=(e-w)*111320*math.cos(math.radians(lat))
    config.update({'location':{'id':key,'title':value['title'],'version':value.get('updatedAt',value['createdAt'])},
        'app':{'title':value['title'],'welcomeTitle':'Welcome to '+value['title']},
        'table':value['table'], 'presentation':value.get('presentation',{}), 'branding':value.get('branding',{}),
        'model':value.get('model',{}), 'raster':value.get('raster',{}), 'culturalSites':value.get('culturalSites',[])})
    config['area']={'bounds':value['bounds'],'sunLocation':{'lat':lat,'lng':lng,'timezone':1},
        'corners':value['recipe'].get('corners',[[w,s],[e,s],[e,n],[w,n]]),'birdSensors':value.get('birdSensors',[
            {'id':i+1,'lng':w+(e-w)*x,'lat':s+(n-s)*y} for i,(x,y) in enumerate(((.25,.35),(.5,.65),(.75,.45)))])}
    fallback={'center':{'lng':lng,'lat':lat},'zoom':math.log2(78271.51696*math.cos(math.radians(lat))*1000/max(width,1)), 'bearing':0, 'fitBounds':value['bounds']}
    if value['table'].get('fitToTable'):
        fallback.update({'fitToTable': True, 'tableFlip': False})
    config['calibration']={'path':f'/location-assets/{key}/media/calibration.json','fallback':value.get('calibration',fallback)}
    existing=list(config['assets'])
    for path in set(existing + list(value['assets'])):
        config['assets'][path]=f'/location-assets/{key}/{path.removeprefix("./")}'
    ready=[x for x in CATALOG if x['id'] in value['layers'] and value.get('capabilities',{}).get(x['id'],{}).get('status')=='ready']
    config['layerCatalog']=ready
    config['disabledLayers']=[x['id'] for x in CATALOG if x not in ready]
    config['branding']['logos']=[{**logo,'src':f'/location-assets/{key}/{logo["src"]}'} for logo in value.get('branding',{}).get('logos',[])]
    return config
