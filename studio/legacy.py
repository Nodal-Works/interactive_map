"""Import the preserved presentations without checking out another branch."""
import json
import subprocess
from . import locations as loc

REVISIONS={'campus':'9c08f793a852313484b838b312ab83c60f3d8af7','lindholmen':'f3b438061ba9f2aa9377fd496f66863a5178fa17'}

def read(ref,path):
    return subprocess.check_output(['git','show',f'{ref}:{path}'],cwd=loc.ROOT)

def import_legacy(name):
    ref=REVISIONS[name]
    if name=='campus':
        config=json.loads(read(ref,'app-config.js').decode().split('window.APP_CONFIG = ',1)[1].rsplit(';',1)[0])
        bounds=config['area']['bounds']; title=config['app']['title'];cal=json.loads(read(ref,'map-calibration.json'))
        sensors=config['area']['birdSensors']; logos=[{'src':'media/chalmers_logo.png','alt':'Chalmers'},{'src':'media/dtcc_logo.png','alt':'DTCC'}]
    else:
        config=json.loads(read(ref,'map_config.json'));bounds=config['table']['boundingBox'];title=config['app']['title'];cal=config['calibration'];sensors=[]
        logos=[{'src':'media/'+path,'alt':alt} for path,alt in [('chalmers_logo.png','Chalmers'),('logo-InfraVis-lightTextimage.png','InfraVis'),('logo-gbg.svg','Göteborgs Stad'),('dtcc_logo.png','DTCC')]]
    enabled=[x['id'] for x in loc.CATALOG if (not x.get('project') or (name=='campus' and x['id']!='cultural-gravity-btn') or (name=='lindholmen' and x['id']=='cultural-gravity-btn'))]
    value=loc.create(name,title,bounds,enabled)
    folder=loc.directory(name)
    paths=subprocess.check_output(['git','ls-tree','-r','--name-only',ref,'media'],cwd=loc.ROOT,text=True).splitlines()
    for path in paths:
        if any(part.startswith('.') for part in path.split('/')) or '/screenshots/' in path or '/archived/' in path:continue
        if path.endswith(('.gpkg','.bak','.aux.xml','.qmd')):continue
        target=loc.safe_path(folder,path);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(read(ref,path))
    value.update(calibration=cal,branding={'logos':logos},presentation={'intro':name=='lindholmen'},legacy={'revision':ref,'profile':name})
    if sensors:value['birdSensors']=sensors
    if name=='lindholmen':
        value['culturalSites']=json.loads((loc.ROOT/'profiles/lindholmen-cultural-sites.json').read_text())
        loc.write_json(folder/'media/cultural-sites.json',value['culturalSites'])
        value['model']={'legacyRotation':0,'scaleMultiplier':.88,'offsetZ':-4}
    loc.write_json(folder/'media/calibration.json',cal)
    loc.register_assets(folder,value)
    for item in loc.CATALOG:
        available=all(path in value['assets'] for path in item.get('assets',[]))
        value['capabilities'][item['id']]={'status':'ready' if item['id'] in enabled and available else 'unavailable' if item['id'] in enabled else 'disabled',
            'message':'Imported legacy presentation; service credentials checked at launch' if item.get('source') else ''}
    loc.write_json(folder/'location.json',value)
    return value
