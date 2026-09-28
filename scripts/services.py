"""One foreground supervisor for MR Studio. No network services bind publicly."""
import argparse
import json
import logging.handlers
import threading
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import webbrowser

if os.name == 'nt':
    import msvcrt
else:
    import fcntl

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime'


def configuration(path=None):
    config = json.loads((ROOT / 'services.example.json').read_text())
    local = Path(path) if path else ROOT / 'services.local.json'
    if local.exists():
        config.update(json.loads(local.read_text()))
    ports = [config[name] for name in ('host', 'ecom', 'coolpaths', 'sam')]
    if any(type(port) is not int or not 1024 <= port <= 65535 for port in ports) or len(set(ports)) != 4:
        raise ValueError('Service ports must be distinct integers between 1024 and 65535')
    return config


def service_health(name, port):
    paths = {'host': '/api/health', 'ecom': '/api/health', 'coolpaths': '/api/coolpaths/status', 'sam': '/'}
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}{paths[name]}', timeout=1) as response:
            data = json.load(response)
        live = {'host': data.get('service') == 'mr-studio',
                'ecom': 'pvgis_cached_orientations' in data,
                'coolpaths': 'ready' in data,
                'sam': 'Street View Segmentation' in data.get('message', '')}[name]
        ready = live and (data.get('ready', False) if name == 'coolpaths' else
                         data.get('data_ready', True) if name == 'ecom' else True)
        return {'live': live, 'ready': ready, 'message': data.get('message') or
                ('Campus demand CSVs are missing' if live and not ready and name == 'ecom' else None)}
    except (OSError, ValueError):
        return {'live': False, 'ready': False, 'message': None}


def probe(name, port):
    # Occupied-port reuse must test process identity, not dataset readiness.
    return service_health(name, port)['live']


def pipe_log(pipe, handler):
    try:
        for line in iter(pipe.readline, ''):
            handler.emit(logging.LogRecord('service', logging.INFO, '', 0, line.rstrip(), (), None))
    finally:
        pipe.close()
        handler.close()


def launch_service(name, command, cwd, env):
    handler=logging.handlers.RotatingFileHandler(RUNTIME / f'{name}.log', maxBytes=5*1024*1024,
                                                backupCount=2, encoding='utf-8')
    try:
        child=subprocess.Popen(command,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                               text=True,encoding='utf-8',errors='replace',
                               **({'start_new_session':True} if os.name!='nt' else {}))
    except Exception:
        handler.close()
        raise
    threading.Thread(target=pipe_log,args=(child.stdout,handler),daemon=True).start()
    return child


def occupied(port):
    with socket.socket() as sock:
        return sock.connect_ex(('127.0.0.1', port)) == 0


def lock_supervisor(lock):
    if os.name == 'nt':
        lock.seek(0)
        if not lock.read(1):
            lock.seek(0)
            lock.write('\0')
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return False
        return True
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return False
    return True


def environment_python(directory):
    executable = 'python.exe' if os.name == 'nt' else 'python'
    environment = '.venv-windows-312' if os.name == 'nt' and (directory / '.venv').is_file() else '.venv'
    return directory / environment / ('Scripts' if os.name == 'nt' else 'bin') / executable


def ensure_environment(directory, requirements, imports):
    python = environment_python(directory)
    if not python.exists():
        subprocess.run([sys.executable, '-m', 'venv', str(python.parent.parent)], check=True)
    check = subprocess.run([str(python), '-c', imports], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if check.returncode:
        subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(requirements)], check=True)
    return python


def service_command(name, config):
    if name == 'host':
        return [sys.executable, str(ROOT / 'host_server.py')], ROOT
    if name == 'ecom':
        directory = ROOT / 'Dashboard' / 'backend'
        python = ensure_environment(directory, directory / 'requirements.txt',
                                   'import fastapi, uvicorn, pydantic, pandas, numpy, networkx')
        return [str(python), '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(config[name])], directory
    if name == 'coolpaths':
        directory = ROOT / 'coolpaths'
        python = ensure_environment(directory, directory / 'requirements.txt',
                                   'import fastapi, uvicorn, rasterio, osmnx, pvlib, ee')
        return [str(python), '-m', 'uvicorn', 'coolpaths.api:app', '--host', '127.0.0.1', '--port', str(config[name])], ROOT
    sam_directory = (ROOT / config['sam_directory']).resolve()
    python = environment_python(sam_directory)
    if not python.exists() or not (sam_directory / 'segment_streetview_server.py').exists():
        raise FileNotFoundError(f'SAM service checkout or virtual environment is missing: {sam_directory}')
    return [str(python), '-m', 'uvicorn', 'segment_streetview_server:app', '--host', '127.0.0.1', '--port', str(config[name])], sam_directory


def write_status(statuses):
    payload = json.dumps(statuses)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=RUNTIME,
                                     prefix='status.', suffix='.tmp', delete=False) as temp:
        temp.write(payload)
        temp_path = Path(temp.name)
    try:
        for attempt in range(10):
            try:
                temp_path.replace(RUNTIME / 'status.json')
                return
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.1)
    finally:
        temp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config')
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--check', action='store_true', help='Validate configuration and show service readiness without starting anything')
    args = parser.parse_args()
    config = configuration(args.config)
    if args.check:
        for name in ('host', 'ecom', 'coolpaths', 'sam'):
            print(f'{name:10} :{config[name]} ' + ('ready' if probe(name, config[name]) else 'not running / not ready'))
        return
    RUNTIME.mkdir(exist_ok=True)
    lock = (RUNTIME / 'supervisor.lock').open('a+')
    if not lock_supervisor(lock):
        sys.exit('MR Studio services are already supervised. Use --check for status.')
    conflicts = [f'{name} port {config[name]}' for name in ('host', 'ecom', 'coolpaths', 'sam')
                 if occupied(config[name]) and not probe(name, config[name])]
    if conflicts:
        sys.exit('Unrelated or unready process occupies ' + ', '.join(conflicts) + '. Stop it or change services.local.json; no processes were killed.')
    config_file = RUNTIME / 'services.json'
    config_file.write_text(json.dumps(config))
    env = {**os.environ, 'MR_SERVICES_CONFIG': str(config_file), 'PYTHONUNBUFFERED': '1',
           'MR_HOST_PORT': str(config['host'])}
    commands = ('host', 'ecom', 'coolpaths', 'sam')
    children, handles, statuses = {}, [], {}
    launches,retries,retry_at={},{},{}
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        for name in commands:
            if probe(name, config[name]):
                statuses[name] = 'reused'
                print(f'{name}: reusing healthy service on {config[name]}', flush=True)
                continue
            child_env = {**env, 'MR_SERVICE_PORT': str(config[name]),
                         'MR_SAM_DIRECTORY': str((ROOT / config['sam_directory']).resolve())}
            try:
                command, cwd = service_command(name, config)
            except FileNotFoundError as error:
                statuses[name] = 'unavailable'
                print(f'{name:10} :{config[name]} unavailable — {error}', flush=True)
                continue
            launches[name]=(command,cwd,child_env)
            children[name]=launch_service(name,*launches[name])
            statuses[name] = 'starting'
        opened = False
        began = time.monotonic()
        while running:
            for name in commands:
                child = children.get(name)
                if child and child.poll() is not None and retries.get(name,0)<3:
                    retry_at.setdefault(name,time.monotonic()+2**(retries.get(name,0)+1))
                    if time.monotonic()>=retry_at[name]:
                        children[name]=launch_service(name,*launches[name]);child=children[name]
                        retries[name]=retries.get(name,0)+1;retry_at.pop(name,None)
                health=service_health(name,config[name])
                new=('failed' if child and child.poll() is not None else
                     'data-missing' if health['live'] and not health['ready'] else
                     'ready' if health['ready'] else
                     'starting' if time.monotonic()-began<180 else 'unavailable')
                if statuses[name] == 'reused' and new == 'ready':
                    new = 'reused'
                if statuses[name] != new:
                    statuses[name] = new
                    print(f'{name:10} :{config[name]} {new}' + (f' — see .runtime/{name}.log' if new in ('failed', 'unavailable') else ''), flush=True)
            write_status({name: {'port': config[name], 'status': value} for name, value in statuses.items()})
            if statuses['host'] == 'failed' and retries.get('host',0)>=3:
                raise RuntimeError('Host failed; see .runtime/host.log')
            if not opened and statuses['host'] in ('ready', 'reused'):
                opened = True
                url = f'http://127.0.0.1:{config["host"]}/launcher.html'
                print(f'MR Studio: {url}\nSession admin: http://127.0.0.1:{config["host"]}/session/\nCtrl+C stops services started by this command.', flush=True)
                if not args.no_open:
                    webbrowser.open(url)
            time.sleep(2)
    finally:
        for child in children.values():
            if child.poll() is None:
                if os.name == 'nt':
                    child.terminate()
                else:
                    os.killpg(child.pid, signal.SIGTERM)
        deadline = time.monotonic() + 8
        for child in children.values():
            try:
                child.wait(timeout=max(.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                if os.name == 'nt':
                    child.kill()
                else:
                    os.killpg(child.pid, signal.SIGKILL)
        for handle in handles:
            handle.close()
        (RUNTIME / 'status.json').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
