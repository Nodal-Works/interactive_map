"""Build an allowlisted GitHub Pages artifact; never copy the repository root."""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'session-client'


def build():
    release = re.search(r"const RELEASE = '([^']+)'", (ROOT / 'session/js/shared.js').read_text()).group(1)
    def version_assets(html):
        return re.sub(r'(src|href)="(?!https?:|//|#)([^"?]+\.(?:js|css))(?:\?[^\"]*)?"',
                      lambda match: f'{match[1]}="{match[2]}?v={release}"', html)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    def copy(relative):
        target = OUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, target)
    for name in ('config', 'shared', 'map', 'client', 'connection', 'controls', 'dashboard-bridge', 'services'):
        copy(f'session/js/{name}.js')
    for name in ('app', 'dashboard-mobile', 'desktop'):
        copy(f'session/css/{name}.css')
    for path in (ROOT / 'controller').glob('*'):
        if path.suffix in ('.js', '.css') and path.name != 'manual-calibration.js':
            copy(str(path.relative_to(ROOT)))
    for relative in ('app-config.js', 'app-config-runtime.js', 'table-layout.js', 'controller.js', 'style.css', 'ecom-palette.js', 'animations/coolpaths-guide.js',
                     'animations/cfd-core.js', 'animations/cfd-visuals.js', 'media/chalmers_logo.png',
                     'media/dtcc_logo.png', 'media/survey_qr.png',
                     'media/ecom/ecom-buildings.geojson'):
        copy(relative)
    controller = (ROOT / 'controller.html').read_text()
    controller = re.sub(r'\s*<script src="calibration-config\.js"></script>', '', controller)
    controller = re.sub(r'\s*<script src="(?:controller/manual-calibration|session/js/desktop|session/runtime)\.js(?:\?[^"]*)?"></script>', '', controller)
    controller = re.sub(r'<button[^>]*data-target="calibrate-btn".*?</button>', '', controller, flags=re.S)
    # Exhibit placement/audio administration belongs only to the local controller.
    controller = re.sub(r'\s*<link[^>]+href="museum-controller\.css(?:\?[^\"]*)?"[^>]*>', '', controller)
    controller = re.sub(r'\s*<script src="museum-presentation\.js(?:\?[^\"]*)?"></script>', '', controller)
    assert not re.search(r'<script[^>]+(?:session/js/desktop|session/runtime|controller/manual-calibration)\.js', controller), 'Host-only script leaked into phone HTML'
    (OUT / 'controller.html').write_text(version_assets(controller))
    client = (ROOT / 'session/client.html').read_text().replace('href="css/', 'href="session/css/').replace('src="js/', 'src="session/js/').replace('src="../app-config', 'src="app-config')
    (OUT / 'client.html').write_text(version_assets(client))
    (OUT / 'index.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=client.html"><title>MR Studio</title><a href="client.html">Open MR Studio controller</a>')
    (OUT / '.nojekyll').touch()
    forbidden = [p for p in OUT.rglob('*') if p.is_file() and (p.name in ('trafik-config.json', 'calibration-config.js', 'map-calibration.json', 'host_server.py', 'services.local.json', '.env') or 'sessions' in p.parts)]
    assert not forbidden, forbidden
    print(f'Built {sum(p.is_file() for p in OUT.rglob("*"))} client files in {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    build()
