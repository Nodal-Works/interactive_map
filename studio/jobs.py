"""Single-worker generation queue with persisted progress and cancellation."""
import json
import os
import signal
import subprocess
import sys
import threading
import uuid
from . import locations as loc

_LOCK=threading.Lock()
_process=None
_job=None

def generation_busy():
    import fcntl
    if not (loc.HOME/'generation.lock').exists():return False
    with (loc.HOME/'generation.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:return True
    return False

def status():
    global _job
    if _job is None:
        saved=sorted((loc.HOME/'jobs').glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True)
        if saved:_job=saved[0].stem
    if _job:
        try:
            state=json.loads((loc.HOME/'jobs'/(_job+'.json')).read_text())
            if state['state'] in ('queued','running') and ((_process and _process.poll() is not None) or (_process is None and not generation_busy())):
                state.update(state='interrupted',message='Worker exited before completion; resume to retry')
            return state
        except FileNotFoundError: pass
    return {'state':'idle'}

def start(key, refresh=False):
    global _process,_job
    loc.load(key)
    with _LOCK:
        if generation_busy() or (_process and _process.poll() is None): raise ValueError('A generation job is already running')
        _job=uuid.uuid4().hex
        folder=loc.HOME/'jobs';folder.mkdir(parents=True,exist_ok=True)
        loc.write_json(folder/(_job+'.json'),{'id':_job,'location':key,'state':'queued'})
        from .runtime import preparation_python
        with (folder/(_job+'.log')).open('w') as log:
            _process=subprocess.Popen([preparation_python(),'-m','studio.worker',key,_job,*(['--refresh'] if refresh else [])],
                cwd=loc.ROOT,env={**os.environ,'MR_STUDIO_HOME':str(loc.HOME)},stdout=log,stderr=log,start_new_session=True)
        return status()

def cancel():
    with _LOCK:
        if _process and _process.poll() is None:
            os.killpg(_process.pid,signal.SIGTERM)
            try: _process.wait(timeout=5)
            except subprocess.TimeoutExpired: os.killpg(_process.pid,signal.SIGKILL);_process.wait()
            current=status();current['state']='cancelled'
            loc.write_json(loc.HOME/'jobs'/(_job+'.json'),current)
        return status()
