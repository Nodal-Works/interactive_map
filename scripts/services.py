"""One foreground supervisor for MR Studio. No network services bind publicly."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

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


def probe(name, port):
    paths = {'host': '/api/health', 'ecom': '/api/health', 'coolpaths': '/api/coolpaths/status', 'sam': '/'}
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}{paths[name]}', timeout=1) as response:
            data = json.load(response)
        return {'host': data.get('service') == 'mr-studio',
                'ecom': 'pvgis_cached_orientations' in data,
                'coolpaths': 'ready' in data,
                'sam': 'Street View Segmentation' in data.get('message', '')}[name]
    except (OSError, ValueError):
        return False


def occupied(port):
    with socket.socket() as sock:
        return sock.connect_ex(('127.0.0.1', port)) == 0


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
    lock = (RUNTIME / 'supervisor.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit('MR Studio services are already supervised. Use --check for status.')
    conflicts = [f'{name} port {config[name]}' for name in ('host', 'ecom', 'coolpaths', 'sam')
                 if occupied(config[name]) and not probe(name, config[name])]
    if conflicts:
        sys.exit('Unrelated or unready process occupies ' + ', '.join(conflicts) + '. Stop it or change services.local.json; no processes were killed.')
    config_file = RUNTIME / 'services.json'
    config_file.write_text(json.dumps(config))
    env = {**os.environ, 'MR_SERVICES_CONFIG': str(config_file), 'PYTHONUNBUFFERED': '1',
           'MR_HOST_PORT': str(config['host'])}
    commands = {'host': [sys.executable, str(ROOT / 'host_server.py')],
                'ecom': ['bash', str(ROOT / 'launch_ecom_backend.sh')],
                'coolpaths': ['bash', str(ROOT / 'launch_coolpaths_server.sh')],
                'sam': ['bash', str(ROOT / 'launch_sam_server.sh')]}
    children, handles, statuses = {}, [], {}
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        for name, command in commands.items():
            if probe(name, config[name]):
                statuses[name] = 'reused'
                print(f'{name}: reusing healthy service on {config[name]}', flush=True)
                continue
            log = (RUNTIME / f'{name}.log').open('a')
            handles.append(log)
            child_env = {**env, 'MR_SERVICE_PORT': str(config[name]),
                         'MR_SAM_DIRECTORY': str((ROOT / config['sam_directory']).resolve())}
            children[name] = subprocess.Popen(command, cwd=ROOT, env=child_env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            statuses[name] = 'starting'
        opened = False
        began = time.monotonic()
        while running:
            for name in commands:
                child = children.get(name)
                new = ('failed' if child and child.poll() is not None else
                       ('ready' if probe(name, config[name]) else ('starting' if time.monotonic() - began < 180 else 'unavailable')))
                if statuses[name] == 'reused' and new == 'ready':
                    new = 'reused'
                if statuses[name] != new:
                    statuses[name] = new
                    print(f'{name:10} :{config[name]} {new}' + (f' — see .runtime/{name}.log' if new in ('failed', 'unavailable') else ''), flush=True)
            temp = RUNTIME / 'status.tmp'
            temp.write_text(json.dumps({name: {'port': config[name], 'status': value} for name, value in statuses.items()}))
            temp.replace(RUNTIME / 'status.json')
            if statuses['host'] == 'failed':
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
                os.killpg(child.pid, signal.SIGTERM)
        deadline = time.monotonic() + 8
        for child in children.values():
            try:
                child.wait(timeout=max(.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
        for handle in handles:
            handle.close()
        (RUNTIME / 'status.json').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
