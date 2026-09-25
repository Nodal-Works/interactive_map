"""Loopback-only wizard API. The host performs origin validation before dispatch."""
import json
from urllib.parse import urlsplit,parse_qs,urlencode
from . import locations as loc, jobs
from .providers import source_status,save_credentials,check_source,get_json
from .diagnostics import doctor

def dispatch(method,path,data=None):
    data=data or {}; parsed=urlsplit(path); route=parsed.path.removeprefix('/api/locations')
    if method=='GET':
        if route=='':return {'locations':loc.list_locations(),'active':loc.active(),'job':jobs.status()}
        if route=='/active':
            value=loc.active()
            return {'id':value['id'],'version':value.get('updatedAt',value['createdAt'])} if value else {'id':None}
        if route=='/catalog':return loc.CATALOG
        if route=='/sources':return source_status()
        if route=='/doctor':return doctor()
        if route=='/job':return jobs.status()
        if route=='/search':
            q=parse_qs(parsed.query).get('q',[''])[0][:200]
            if len(q)<3:raise ValueError('Enter at least three characters')
            return get_json('https://nominatim.openstreetmap.org/search?'+urlencode({'q':q,'format':'json','countrycodes':'se','limit':5}))
        if route.startswith('/validate/'):return loc.validate(route.rsplit('/',1)[1])
    if method=='POST':
        if route=='':return loc.create(data['id'],data['title'],data['bounds'],data.get('layers'),float(data.get('resolution',2)),data.get('studyDate'))
        if route=='/estimate':return loc.estimate(data['bounds'],float(data.get('resolution',2)))
        if route=='/sources':return save_credentials(data)
        if route=='/check-source':return check_source(data['source'])
        if route=='/generate':return jobs.start(data['id'],bool(data.get('refresh')))
        if route=='/cancel':return jobs.cancel()
        if route=='/activate':
            if jobs.generation_busy() or jobs.status()['state'] in ('running','queued'):raise ValueError('Wait for generation or cancel it before switching locations')
            return loc.activate(data['id'])
        if route=='/export':
            key=loc.identifier(data['id']); target=loc.HOME/'exports'/(key+'.zip');target.parent.mkdir(parents=True,exist_ok=True)
            loc.export_package(key,target);return {'url':'/api/locations/download/'+key}
        if route=='/import':return loc.import_package(data['path'])
    raise ValueError('Unknown location operation')
