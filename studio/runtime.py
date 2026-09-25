"""Resolve local service capabilities and environment for the selected location."""
import os
import sys
from . import locations as loc
from .providers import credentials

def selected_services():
    value=loc.active()
    if value is None:return ['host','ecom','coolpaths','sam']
    services=['host']
    for item in loc.CATALOG:
        if item.get('service') and value.get('capabilities',{}).get(item['id'],{}).get('status')=='ready':
            services.append(item['service'])
    if value.get('capabilities',{}).get('street-view-btn',{}).get('status')=='ready':services.append('sam')
    return sorted(set(services),key=lambda name: name!='host')

def environment():
    value=loc.active()
    if not value:return {}
    recipe=value['recipe']; private=credentials().get('earthengine',{})
    return {'MR_LOCATION_ID':value['id'],'COOLPATHS_DATA_DIR':str(loc.directory(value['id'])/'studies'),
        'COOLPATHS_ASSET_DIR':str(loc.directory(value['id'])/'media'),
        'COOLPATHS_STUDY_DATE':recipe.get('studyDate') or '2026-07-15',
        'COOLPATHS_RESOLUTION':str(recipe.get('resolution',2)),
        'COOLPATHS_EE_PROJECT_ID':private.get('project',''),'COOLPATHS_EE_KEY_FILE':private.get('keyFile','')}

def signature():
    value=loc.active()
    return (value['id'],value.get('updatedAt')) if value else None

def preparation_python():
    configured=os.environ.get('MR_PREPARATION_PYTHON')
    if configured:return configured
    executable=loc.HOME/'env'/'bin'/'python'
    return str(executable) if executable.is_file() else sys.executable
