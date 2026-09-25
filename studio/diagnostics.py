import importlib.util
import importlib.metadata
import platform
import shutil
from .locations import HOME
from .providers import source_status

def doctor(local=False):
    if not local:
        import json, subprocess, sys
        from .runtime import preparation_python
        executable=preparation_python()
        if executable != sys.executable:
            result=subprocess.run([executable,'-c','import json; from studio.diagnostics import doctor; print(json.dumps(doctor(local=True)))'],capture_output=True,text=True,timeout=30)
            if result.returncode == 0:return json.loads(result.stdout)

    modules=['dtcc','numpy','rasterio','scipy','PIL','pyproj','geopandas','trimesh','geopy','ee','fastapi','osmnx','pvlib']
    packages={name:bool(importlib.util.find_spec(name)) for name in modules}
    return {'platform':platform.platform(),'python':platform.python_version(),'packages':packages,
        'ssh':bool(shutil.which('ssh')),'sources':source_status(),'dataDirectory':str(HOME),
        'preparationReady':all(packages[x] for x in modules[:10])}
