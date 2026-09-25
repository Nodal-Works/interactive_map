"""Host-only connections to external data providers."""
from contextlib import contextmanager
import json
import os
import re
import socket
import subprocess
import time
import urllib.request
from urllib.parse import urlencode, urlsplit
from .locations import HOME, write_json

ALLOWED = {'mapbox': {'key'}, 'earthengine': {'project','keyFile'}, 'streetview': {'key'},
           'trafik': {'clientId','clientSecret'}, 'epc': {'sshHost','remotePort','remoteHost'}}

def credentials():
    try: return json.loads((HOME / 'private' / 'credentials.json').read_text())
    except FileNotFoundError:
        from .locations import ROOT
        try:
            old=json.loads((ROOT/'trafik-config.json').read_text())
            result={}
            if old.get('mapboxtoken') or old.get('mapboxToken'):result['mapbox']={'key':old.get('mapboxtoken') or old['mapboxToken']}
            if old.get('streetViewApiKey'):result['streetview']={'key':old['streetViewApiKey']}
            if old.get('clientId') and old.get('clientSecret'):result['trafik']={'clientId':old['clientId'],'clientSecret':old['clientSecret']}
            project=old.get('coolpathsEarthEngineProject',{}).get('id')
            key=os.environ.get('COOLPATHS_EE_KEY_FILE') or os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
            if project and key:result['earthengine']={'project':project,'keyFile':key}
            return result
        except (OSError,ValueError):return {}

def save_credentials(data):
    saved=credentials()
    for provider, fields in data.items():
        if provider not in ALLOWED or not isinstance(fields,dict) or not set(fields)<=ALLOWED[provider]:
            raise ValueError('Unknown credential field')
        saved[provider]={**saved.get(provider,{}), **{k:str(v) for k,v in fields.items() if v}}
    target=HOME/'private'/'credentials.json'
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    write_json(target,saved)
    target.chmod(0o600)
    return source_status()

def source_status():
    saved=credentials()
    required={'earthengine':('project','keyFile'),'streetview':('key',),'trafik':('clientId','clientSecret'),'epc':('sshHost','remotePort')}
    return {name:{'configured':all(saved.get(name,{}).get(k) for k in keys)} for name,keys in required.items()}

def get_json(url, timeout=45):
    request=urllib.request.Request(url,headers={'User-Agent':'MR-Studio/1.0'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)

@contextmanager
def epc_tunnel(config):
    host=config.get('sshHost','')
    remote=config.get('remoteHost','127.0.0.1')
    port=int(config.get('remotePort',0))
    if not re.fullmatch(r'[A-Za-z0-9_.@-]+',host) or host.startswith('-') or remote not in ('127.0.0.1','localhost') or not 1<=port<=65535:
        raise ValueError('EPC needs an SSH alias and a valid loopback API port')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); local_port=sock.getsockname()[1]
    # SSH agent/config owns authentication. Never request or store SSH passwords.
    process=subprocess.Popen(['ssh','-N','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes',
        '-o','ConnectTimeout=10','-L',f'127.0.0.1:{local_port}:{remote}:{port}',host],
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if process.poll() is not None: raise RuntimeError('SSH tunnel failed; check the alias, SSH agent and known-host setup')
            try:
                with socket.create_connection(('127.0.0.1',local_port),timeout=.1): break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('SSH tunnel did not become ready')
        yield f'http://127.0.0.1:{local_port}'
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill();process.wait()

def export_epc(bounds, output, config):
    seen={}
    limit=2000
    with epc_tunnel(config) as base:
        def fetch(box,depth=0):
            query=dict(zip(('minLon','minLat','maxLon','maxLat'),box));query['limit']=limit
            data=get_json(base+'/api/footprints/bbox?'+urlencode(query))
            features=data.get('features')
            if not isinstance(features,list): raise ValueError('EPC API did not return GeoJSON')
            if len(features)>=limit:
                if depth>=12: raise ValueError('EPC response remains capped; choose a smaller extent')
                w,s,e,n=box
                if e-w>n-s:
                    m=(w+e)/2;fetch([w,s,m,n],depth+1);fetch([m,s,e,n],depth+1)
                else:
                    m=(s+n)/2;fetch([w,s,e,m],depth+1);fetch([w,m,e,n],depth+1)
                return
            for feature in features:
                # One certificate can cover several buildings; geometry is part of identity.
                props=feature.get('properties') or {}
                identity=json.dumps([props.get('FormularId'),feature.get('geometry')],sort_keys=True)
                seen[identity]=feature
        fetch(bounds)
        from scripts.export_epc_geojson import EPC_FIELDS
        details={}
        for feature in seen.values():
            props=feature.setdefault('properties',{})
            form=props.get('FormularId')
            if form is not None:
                form=int(form)
                if form not in details:
                    record=get_json(base+f'/api/epc/explain/{form}')
                    details[form]={k:v for k,v in record.items() if k in EPC_FIELDS and v is not None}
                props['epc_detail']=details[form]
    if not seen: raise ValueError('No EPC footprint coverage for this extent')
    write_json(output, {'type':'FeatureCollection','features':list(seen.values())})
    return {'features':len(seen),'certificates':len(details),'source':'Chalmers EPC Browser'}

def check_source(name):
    config=credentials().get(name,{})
    if not source_status().get(name,{}).get('configured'): return {'ready':False,'message':'Not configured'}
    try:
        if name=='epc':
            with epc_tunnel(config) as url: get_json(url+'/api/tables')
        elif name=='earthengine':
            import ee
            key=config['keyFile']; account=json.loads(open(key).read())['client_email']
            ee.Initialize(ee.ServiceAccountCredentials(account,key),project=config['project'])
            ee.Number(1).getInfo()
        elif name=='trafik':
            import base64
            token=base64.b64encode((config['clientId']+':'+config['clientSecret']).encode()).decode()
            req=urllib.request.Request('https://ext-api.vasttrafik.se/token',data=b'grant_type=client_credentials',headers={'Authorization':'Basic '+token,'Content-Type':'application/x-www-form-urlencoded'})
            with urllib.request.urlopen(req,timeout=20) as response: json.load(response)
        elif name=='streetview':
            # Metadata request avoids fetching a billable image during setup.
            data=get_json('https://maps.googleapis.com/maps/api/streetview/metadata?'+urlencode({'location':'57.708,11.94','key':config['key']}))
            if data.get('status') not in ('OK','ZERO_RESULTS'): raise ValueError('Provider rejected the configured credential')
        return {'ready':True,'message':'Connection verified'}
    except Exception as error:
        # Provider exceptions can include credential-bearing URLs: expose only a safe diagnostic.
        return {'ready':False,'message':f'{type(error).__name__}: connection failed; verify credentials, coverage and network access'}
