"""Targeted exhibit preparation reuses the geographic foundation and publishes atomically.

python -m studio.exhibit universeum --mobility-source PATH --slideshow --wind-context
python -m studio.exhibit universeum --prepared-studies PATH
"""
from __future__ import annotations

import argparse
from collections import Counter
import copy
import fcntl
import json
import os
from pathlib import Path
import shutil
import tempfile

from . import locations as loc


def slideshow(media):
    template = json.loads((loc.ROOT/'media/slideshow/slideshow-config.json').read_text())
    slides = []
    palette = ['#ff6600','#999999','#9966ff','#3388ff','#ffcc00','#cc3399','#66cc66','#22d3ee','#a3e635','#f472b6','#fbbf24','#a78bfa']
    for slide, filename in zip(template['slides'][:2], ['building-footprints.geojson','street-network.geojson']):
        if not (media/filename).is_file():continue
        item = copy.deepcopy(slide)
        item['media'] = 'media/'+filename
        meta = item['metadata'];style = meta['style'];prop = style['colorProperty']
        counts = Counter(str((f.get('properties') or {}).get(prop) or 'Other')
                         for f in json.loads((media/filename).read_text())['features'])
        old = style['colorMap']
        colors = {key:old.get(key, next((v for k,v in old.items() if k.replace(' ','')==key.replace(' ','')), palette[i%len(palette)]))
                  for i,(key,_) in enumerate(counts.most_common())}
        style['colorMap'] = colors
        unit = 'buildings' if prop=='objekttyp' else 'segments'
        meta['legend']['items'] = [{'color':colors[key], 'label':f'{key} ({count:,} {unit})'} for key,count in counts.most_common()]
        meta['description'] = f'Universeum map area · {sum(counts.values()):,} {unit} · reveal each category'
        meta['source'] = 'DTCC / Lantmäteriet' if prop=='objekttyp' else '© OpenStreetMap contributors'
        slides.append(item)
    slides.extend(copy.deepcopy(s) for s in template['slides'] if s['type']=='wms')
    loc.write_json(media/'slideshow/slideshow-config.json', {'slides':slides,'settings':{'autoAdvance':False,'loop':True}})


def wind_context(media, manifest, metres=500):
    import geopandas as gpd
    from shapely.geometry import box
    from .mobility import footprint
    from .pipeline import generator
    visible = footprint(manifest, 3007)
    context = box(visible.bounds[0]-metres,visible.bounds[1]-metres,
                  visible.bounds[2]+metres,visible.bounds[3]+metres)
    projected = gpd.GeoSeries([context],crs=3007).to_crs(3006).iloc[0]
    mod = generator()
    with tempfile.TemporaryDirectory(dir=media.parent,prefix='wind-source-') as tmp:
        folder = Path(tmp)
        mod.generate_footprints(mod.dtcc.Bounds(*projected.bounds),folder,
            gpd.GeoSeries([context],crs=3007).to_crs(4326).total_bounds.tolist())
        downloaded = gpd.read_file(folder/'building-footprints.geojson').to_crs(3007)
    original = gpd.read_file(media/'building-footprints.geojson').to_crs(3007)
    geometries = list(original.geometry);index = original.sindex
    added = []
    for row in downloaded.itertuples():
        geometry = row.geometry
        if geometry is None or geometry.is_empty or geometry.geom_type not in ('Polygon','MultiPolygon') or not geometry.intersects(context):
            continue
        candidates = index.query(geometry)
        if any(geometry.symmetric_difference(original.geometry.iloc[i]).area < .1 for i in candidates):
            continue
        # Existing assets own the visible model; include complete outside buildings.
        if geometry.intersects(visible):
            continue
        added.append(geometry)
    geometries.extend(added)
    wgs = gpd.GeoSeries(geometries,crs=3007).to_crs(4326)
    from shapely.geometry import mapping
    payload = {'type':'FeatureCollection','metadata':{'contextMetres':metres,'outsideBuildings':len(added),
        'source':'DTCC / Lantmäteriet footprints; complete polygons and holes','visibleFootprintUnchanged':True},
        'features':[{'type':'Feature','geometry':mapping(g),'properties':{}} for g in wgs]}
    target=media/'wind-context.geojson'
    target.write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8')
    if not added:
        raise ValueError('No surrounding buildings were prepared')
    print(f'Wind context: {len(original)} original + {len(added)} surrounding buildings',flush=True)


def augment(key, mobility_source=None, make_slideshow=False, make_wind=False, prepared_studies=None):
    original=loc.directory(key);manifest=loc.load(key)
    with (loc.HOME/'generation.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix='exhibit-',dir=loc.HOME) as tmp:
            build=Path(tmp)/key;shutil.copytree(original,build)
            media=build/'media'
            manifest['layers']=[id for id in manifest['layers'] if id!='canvas-btn']
            manifest.setdefault('presentation',{}).update({'exhibitControls':True,'windContextMetres':500})
            if mobility_source:
                from .mobility import prepare
                print(prepare(Path(mobility_source),media/'mobility',manifest),flush=True)
                for id in ('synthpop-heatmap-btn','slow-walkers-btn'):
                    if id not in manifest['layers']:manifest['layers'].append(id)
                manifest['recipe']['mobilitySourceCommit']=json.loads((media/'mobility/manifest.json').read_text())['source']['commit']
            if make_slideshow:slideshow(media)
            if make_wind:wind_context(media,manifest)
            if prepared_studies:
                source=Path(prepared_studies)/'2026-07-15'
                if not (source/'manifest.json').is_file():raise ValueError('Comfort preparation has not completed')
                shutil.copytree(source,build/'studies/2026-07-15',dirs_exist_ok=True)
                shutil.copy2(source/'manifest.json',build/'studies/manifest.json')
                manifest['recipe']['studyDate']='2026-07-15'
                if 'thermal-comfort-btn' not in manifest['layers']:manifest['layers'].append('thermal-comfort-btn')
            loc.register_assets(build,manifest)
            for item in loc.CATALOG:
                if item['id'] not in manifest['layers']:
                    manifest['capabilities'][item['id']]={'status':'disabled','message':''}
                elif item.get('assets'):
                    ready=all(p in manifest['assets'] for p in item['assets'])
                    manifest['capabilities'][item['id']]={'status':'ready' if ready else 'unavailable','message':'' if ready else 'Prepared assets are missing'}
            loc.write_json(build/'recipe.json',manifest['recipe']);loc.write_json(build/'location.json',manifest)
            for path,info in manifest['assets'].items():
                if loc.digest(build/path)!=info['sha256']:raise ValueError('Prepared asset checksum failed: '+path)
            backup=original.with_name(key+'.previous')
            if backup.exists():shutil.rmtree(backup)
            os.replace(original,backup)
            try:os.replace(build,original)
            except BaseException:os.replace(backup,original);raise
    print('Published prepared exhibit package:',key,flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('location');parser.add_argument('--mobility-source',type=Path)
    parser.add_argument('--slideshow',action='store_true');parser.add_argument('--wind-context',action='store_true')
    parser.add_argument('--prepared-studies',type=Path)
    args=parser.parse_args()
    augment(args.location,args.mobility_source,args.slideshow,args.wind_context,args.prepared_studies)


if __name__=='__main__':main()
