"""Build and validate all three phone clients before replacing the Pages artifact."""
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BRANCHES = ('main', 'lindholmen', 'universeum')
CLIENT_PATHS = {'main': 'client.html', 'lindholmen': 'lindholmen/client.html',
                'universeum': 'universeum/client.html'}
PUBLIC_BASE = 'https://nodal-works.github.io/interactive_map/'
FORBIDDEN = {'trafik-config.json', 'calibration-config.js', 'map-calibration.json',
             'host_server.py', 'services.local.json', '.env', 'manual-calibration.js',
             'host.js', 'admin.js', 'desktop.js', 'runtime.js', 'museum-presentation.js'}
REDIRECT = '''<!doctype html>
<html lang="en"><meta charset="utf-8"><title>MR Studio Universeum</title>
<p><a id="client" href="../universeum/client.html">Open Universeum controls</a></p>
<script>
const target = new URL('../universeum/client.html', location.href);
target.search = location.search;
target.hash = location.hash;
document.getElementById('client').href = target.href;
location.replace(target.href);
</script></html>
'''


class AssetLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = 'src' if tag in ('script', 'img', 'iframe') else 'href' if tag == 'link' else None
        if key and attrs.get(key):
            self.urls.append(attrs[key])


def validate_client(client):
    """Check public boundaries and relative HTML assets before any upload."""
    client = client.resolve()
    for file in client.rglob('*'):
        if file.is_symlink():
            raise ValueError(f'Symlink in client: {file}')
        if file.is_file() and (file.name in FORBIDDEN or
                               {'sessions', '.git', 'backend'} & set(file.relative_to(client).parts)):
            raise ValueError(f'Host/private file in client: {file}')
    for name in ('client.html', 'controller.html', 'index.html'):
        page = client / name
        parser = AssetLinks()
        parser.feed(page.read_text())
        for raw in parser.urls:
            url = urlsplit(raw)
            if url.scheme or url.netloc or not url.path:
                continue
            target = (page.parent / unquote(url.path)).resolve()
            if url.path.startswith('/') or not target.is_relative_to(client) or not target.is_file():
                raise ValueError(f'Missing or non-relative asset in {page}: {raw}')


def assemble(checkouts, output):
    output = output.resolve()
    sources = {branch: Path(checkouts[branch]).resolve() for branch in BRANCHES}
    for source in sources.values():
        artifact = source / 'dist/session-client'
        if source.is_relative_to(output) or artifact.is_relative_to(output) or output.is_relative_to(artifact):
            raise ValueError(f'Output overlaps source checkout/build: {output}')
    manifest = {'schemaVersion': 1, 'builtAt': datetime.now(timezone.utc).isoformat(), 'clients': {}}
    for branch, checkout in sources.items():
        subprocess.run([sys.executable, str(checkout / 'scripts/build_session_client.py')],
                       cwd=checkout, check=True)
        artifact = checkout / 'dist/session-client'
        validate_client(artifact)
        shared = (artifact / 'session/js/shared.js').read_text()
        release = re.search(r"const RELEASE = '([^']+)'", shared).group(1)
        expected = PUBLIC_BASE + CLIENT_PATHS[branch]
        config = json.loads((checkout / 'services.example.json').read_text())
        if config['client_url'] != expected or f"clientUrl: '{expected}'" not in (artifact / 'session/js/config.js').read_text():
            raise ValueError(f'{branch}: service and frontend client URLs must both be {expected}')
        sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
        manifest['clients'][branch] = {'branch': branch, 'commit': sha, 'release': release,
                                        'path': '/' + CLIENT_PATHS[branch]}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pages-', dir=output.parent) as tmp:
        staging = Path(tmp) / 'site'
        shutil.copytree(sources['main'] / 'dist/session-client', staging)
        for branch in BRANCHES[1:]:
            shutil.copytree(sources[branch] / 'dist/session-client', staging / branch)
        (staging / 'dev').mkdir()
        for name in ('client.html', 'index.html'):
            (staging / 'dev' / name).write_text(REDIRECT)
        (staging / '.nojekyll').touch()
        (staging / 'deployment-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        if output.exists():
            shutil.rmtree(output)
        shutil.move(str(staging), output)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for branch in BRANCHES:
        parser.add_argument('--' + branch, type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/pages')
    args = parser.parse_args()
    manifest = assemble({branch: getattr(args, branch) for branch in BRANCHES}, args.output)
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
