"""Resumable stage runner. A failed attempt never overwrites a valid location."""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from . import locations as loc
from .providers import credentials, export_epc, check_source

OUTPUTS={'footprints':['media/building-footprints.geojson'], 'roads':['media/street-network.geojson'],
 'water':['media/water-bodies.geojson'], 'dem':['media/clipped_dem.geotiff.tif'],
 'mesh':['media/mesh.stl'], 'trees':['media/trees.geojson'], 'tree-model':['media/trees_instanced.glb'],
 'stormwater':['media/stormwater_dem.tif'], 'epc':['media/building-footprints-epc.geojson']}
DEPENDENCIES={'mesh':['dem','footprints'],'trees':['dem'],'tree-model':['trees','dem'],
 'stormwater':['dem','footprints','water'], 'thermal':['dem','footprints','trees','roads']}

def safe_error(error):
    import re
    text=str(error)
    for fields in credentials().values():
        for key,value in fields.items():
            if key in ('key','clientSecret') and value:text=text.replace(value,'[redacted]')
    return re.sub(r'(https?://[^\s?]+)\?[^\s]+',r'\1?[redacted]',text)[:400]

def generator():
    spec=importlib.util.spec_from_file_location('asset_generator',loc.ROOT/'scripts/generate_assets.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def generate(key, progress=lambda value:None, refresh=False):
    # One OS-owned lock covers both CLI and host jobs; crash/cancel releases it.
    import fcntl
    loc.HOME.mkdir(parents=True, exist_ok=True)
    with (loc.HOME/'generation.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Another location generation is running')
        return _generate(key, progress, refresh)

def _generate(key, progress, refresh):
    manifest=loc.load(key); original=loc.directory(key)
    recipe=manifest['recipe']; private=credentials(); source_results={}
    # Source code and settings participate in the cache key. External data refresh is explicit.
    import hashlib
    fingerprint=hashlib.sha256(json.dumps(recipe,sort_keys=True).encode())
    for filename in ('scripts/generate_assets.py','scripts/generate_trees_glb.py','studio/pipeline.py','scripts/process_dem_flow.py','studio/providers.py','studio/osm_water.py','studio/requirements.lock'):
        fingerprint.update((loc.ROOT/filename).read_bytes())
    cache=loc.HOME/'cache'/key/fingerprint.hexdigest()
    if refresh and cache.exists(): shutil.rmtree(cache)
    cache.mkdir(parents=True,exist_ok=True)
    progress({'state':'running','stage':'preflight','stages':{}})
    stages={}
    with tempfile.TemporaryDirectory(prefix='build-',dir=loc.HOME) as temporary:
        build=Path(temporary); media=build/'media';media.mkdir()
        mod=None; bounds=None
        def run_stage(name, work):
            nonlocal stages
            cached=cache/name
            required=DEPENDENCIES.get(name,[])
            if any(stages.get(x,{}).get('status')!='ready' for x in required):
                stages[name]={'status':'unavailable','message':'Required preparation stage unavailable'};return
            try:
                ready=cached/'outputs.json'
                outputs=json.loads(ready.read_text()) if ready.exists() else None
                if outputs and all((cached/p).is_file() and loc.digest(cached/p)==checksum for p,checksum in outputs.items()):
                    for p in outputs:
                        target=build/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(cached/p,target)
                    stages[name]={'status':'ready','cached':True}
                else:
                    work()
                    paths=OUTPUTS.get(name,[])
                    if not paths: paths=[str(x.relative_to(build)) for x in (build/'studies').rglob('*') if x.is_file()]
                    if not paths or not all((build/p).is_file() for p in paths): raise ValueError('Provider produced incomplete outputs')
                    outputs={p:loc.digest(build/p) for p in paths}
                    for p in paths:
                        dest=cached/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(build/p,dest)
                    loc.write_json(ready,outputs)
                    stages[name]={'status':'ready','cached':False}
            except Exception as error:
                stages[name]={'status':'failed','message':f'{type(error).__name__}: {safe_error(error)}'}
                # Keep credentials out of logs (HTTP errors can contain complete URLs).
                print(f'{name}: {type(error).__name__}: {safe_error(error)}',flush=True)
                for p in OUTPUTS.get(name,[]): (build/p).unlink(missing_ok=True)
            progress({'state':'running','stage':name,'stages':stages})
        try:
            mod=generator()
            b=recipe.get('generationBounds') or mod.wgs84_to_sweref(*manifest['bounds']);bounds=mod.dtcc.Bounds(*b)
            if not loc.estimate(manifest['bounds'], recipe['resolution'], b)['supported']:
                raise ValueError('Generation extent exceeds 6 km or 8 million raster cells')
            mod.CELL_SIZE=recipe['resolution']
        except Exception as error:
            mod=None
            print('DTCC preparation unavailable: '+type(error).__name__+': '+safe_error(error),flush=True)
        def base(name):
            if mod is None: raise RuntimeError('Install the preparation environment first')
            if name=='footprints': mod.generate_footprints(bounds,media,manifest['bounds'])
            elif name=='roads': mod.generate_road_network(bounds,media)
            elif name=='water': mod.generate_water_bodies(bounds,media)
            elif name=='dem': mod.generate_dem(bounds,media)
            elif name=='mesh': mod.generate_mesh(bounds,media,mode=recipe.get('meshMode','conditioned'))
            elif name=='trees': mod.generate_trees(bounds,media)
            elif name=='tree-model': mod.generate_trees_glb(media)
        for name in ('footprints','roads','water','dem','mesh','trees','tree-model'):
            run_stage(name,lambda name=name:base(name))
        def stormwater():
            subprocess.run([sys.executable,str(loc.ROOT/'scripts/process_dem_flow.py'),
                '--dem',str(media/'clipped_dem.geotiff.tif'),'--buildings',str(media/'building-footprints.geojson'),
                '--water',str(media/'water-bodies.geojson'),'--output',str(media),'--browser-only'],check=True)
        run_stage('stormwater',stormwater)
        if 'epc-btn' in manifest['layers']:
            run_stage('epc',lambda:export_epc(manifest['bounds'],media/'building-footprints-epc.geojson',private.get('epc',{})))
        if 'thermal-comfort-btn' in manifest['layers']:
            def thermal():
                from datetime import date
                date.fromisoformat(recipe.get('studyDate') or '')
                config=private.get('earthengine',{})
                env={**os.environ,'COOLPATHS_ASSET_DIR':str(media),'COOLPATHS_DATA_DIR':str(build/'studies'),
                    'COOLPATHS_STUDY_DATE':recipe['studyDate'],'COOLPATHS_EE_PROJECT_ID':config.get('project',''),
                    'COOLPATHS_EE_KEY_FILE':config.get('keyFile',''),'COOLPATHS_RESOLUTION':str(recipe['resolution'])}
                subprocess.run([sys.executable,'-m','coolpaths.prepare'],cwd=loc.ROOT,env=env,check=True)
                source=build/'studies'/recipe['studyDate']/'manifest.json'
                shutil.copy2(source,build/'studies'/'manifest.json')
            run_stage('thermal',thermal)
        for source,layer in (('streetview','street-view-btn'),('trafik','trafik-btn')):
            if layer in manifest['layers']:source_results[source]=check_source(source)
        # Shared audio is portable; illustrative bird positions are labelled in the wizard.
        shutil.copytree(loc.ROOT/'media/sound',media/'sound',dirs_exist_ok=True)
        slideshow={'slides':[
            {'type':'geojson','media':'media/building-footprints.geojson','metadata':{'title':'Buildings','source':'DTCC / source attribution in location manifest'}},
            {'type':'geojson','media':'media/street-network.geojson','metadata':{'title':'Streets','source':'OpenStreetMap contributors'}}],
            'settings':{'autoAdvance':False,'loop':True}}
        loc.write_json(media/'slideshow/slideshow-config.json',slideshow)
        if manifest.get('culturalSites'):
            loc.write_json(media/'cultural-sites.json',manifest['culturalSites'])
        for logo in manifest.get('branding',{}).get('logos',[]):
            source=loc.safe_path(original,logo['src'])
            if source.is_file():
                target=loc.safe_path(build,logo['src']);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
        manifest['capabilities']={}
        loc.register_assets(build,manifest)
        for item in loc.CATALOG:
            state='disabled' if item['id'] not in manifest['layers'] else 'ready'
            message=''
            if state=='ready' and any(p not in manifest['assets'] for p in item.get('assets',[])):
                state='unavailable';message='Required assets could not be prepared'
            if state=='ready' and item.get('source') and not source_results.get(item['source'],{}).get('ready'):
                state='unavailable';message='Source connection not verified'
            manifest['capabilities'][item['id']]={'status':state,'message':message}
        manifest['generation']={'stages':stages,'completedAt':loc.stamp(),'fingerprint':fingerprint.hexdigest(),
            'python':sys.version,'sources':['DTCC','OpenStreetMap','Lantmäteriet CIR (estimated trees)']}
        # Required geographic foundation must succeed before publishing any replacement.
        essential=all(stages.get(x,{}).get('status')=='ready' for x in ('footprints','roads','dem','mesh'))
        if not essential:
            report={'state':'failed','stage':'validation','stages':stages,'message':'Core assets incomplete; previous package preserved'}
            progress(report);return report
        from pyproj import Transformer
        import rasterio
        with rasterio.open(media/'clipped_dem.geotiff.tif') as dem:
            projector=Transformer.from_crs(dem.crs,'EPSG:4326',always_xy=True)
            model_bounds=list(dem.bounds)
            manifest['raster']={'corners':[list(projector.transform(x,y)) for x,y in (
                (dem.bounds.left,dem.bounds.top),(dem.bounds.right,dem.bounds.top),
                (dem.bounds.right,dem.bounds.bottom),(dem.bounds.left,dem.bounds.bottom))]}
        manifest['model']={'coordinates':'sweref-z-up','alignment':'geographic','boundsSweref':model_bounds,'meshMode':recipe.get('meshMode','conditioned')}
        # Stage all outputs before publishing. Retain the previous package as a recovery copy.
        loc.write_json(build/'location.json',manifest);loc.write_json(build/'recipe.json',recipe)
        backup=original.with_name(key+'.previous')
        if backup.exists(): shutil.rmtree(backup)
        os.replace(original,backup)
        try: os.replace(build,original)
        except BaseException: os.replace(backup,original);raise
        report={'state':'completed','stage':'done','stages':stages,'capabilities':manifest['capabilities']}
        progress(report);return report
