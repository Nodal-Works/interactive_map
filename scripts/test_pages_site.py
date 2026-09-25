"""Regression checks for the combined public artifact and legacy invitations."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from build_pages_site import assemble, BRANCHES, CLIENT_PATHS, PUBLIC_BASE, REDIRECT, validate_client


class PagesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sources = {}
        for branch in BRANCHES:
            source = self.root / branch
            (source / 'scripts').mkdir(parents=True)
            url = PUBLIC_BASE + CLIENT_PATHS[branch]
            (source / 'services.example.json').write_text(json.dumps({'client_url': url}))
            # Real subprocess builders exercise build failures and staging, without large datasets.
            files = {
                'client.html': '<script src="session/js/shared.js?v=test"></script><img src="logo.svg">',
                'controller.html': '<script src="session/js/config.js"></script>',
                'index.html': '<a href="client.html">Open</a>',
                'session/js/shared.js': f"const RELEASE = '{branch}-release';",
                'session/js/config.js': f"window.MR_CONFIG = {{clientUrl: '{url}'}};",
                'app-config.js': f'window.APP_CONFIG = {{title: "{branch}"}};',
                'logo.svg': '<svg/>',
            }
            (source / 'scripts/build_session_client.py').write_text(
                'from pathlib import Path\nimport shutil\n'
                'out=Path("dist/session-client")\n'
                'if out.exists(): shutil.rmtree(out)\n'
                f'files={files!r}\n'
                'for name, text in files.items():\n'
                ' p=out/name\n p.parent.mkdir(parents=True,exist_ok=True)\n p.write_text(text)\n')
            (source / 'services.local.json').write_text('{"private": true}')
            subprocess.run(['git', 'init', '-q', str(source)], check=True)
            subprocess.run(['git', 'add', '.'], cwd=source, check=True)
            subprocess.run(['git', '-c', 'user.name=Pages Test', '-c', 'user.email=pages@example.invalid',
                            'commit', '-qm', 'fixture'], cwd=source, check=True)
            self.sources[branch] = source
        self.output = self.root / 'public'

    def test_complete_artifact_and_manifest(self):
        manifest = assemble(self.sources, self.output)
        for branch in BRANCHES:
            folder = self.output if branch == 'main' else self.output / branch
            self.assertIn(branch, (folder / 'app-config.js').read_text())
            self.assertEqual(branch + '-release', manifest['clients'][branch]['release'])
            self.assertEqual('/' + CLIENT_PATHS[branch], manifest['clients'][branch]['path'])
            self.assertEqual(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=self.sources[branch], text=True).strip(),
                             manifest['clients'][branch]['commit'])
        self.assertTrue((self.output / '.nojekyll').exists())
        self.assertEqual(manifest, json.loads((self.output / 'deployment-manifest.json').read_text()))
        self.assertFalse(list(self.output.rglob('services.local.json')))
        self.assertEqual(REDIRECT, (self.output / 'dev/client.html').read_text())

    def test_failed_branch_keeps_previous_artifact(self):
        self.output.mkdir()
        (self.output / 'previous').write_text('still deployed')
        (self.sources['universeum'] / 'scripts/build_session_client.py').write_text('raise SystemExit(1)\n')
        with self.assertRaises(subprocess.CalledProcessError):
            assemble(self.sources, self.output)
        self.assertEqual(['previous'], [p.name for p in self.output.iterdir()])

    def test_wrong_branch_url_fails(self):
        (self.sources['lindholmen'] / 'services.example.json').write_text(json.dumps({'client_url': PUBLIC_BASE + 'client.html'}))
        with self.assertRaisesRegex(ValueError, 'lindholmen:'):
            assemble(self.sources, self.output)
        self.assertFalse(self.output.exists())

    def test_asset_and_private_file_validation(self):
        assemble(self.sources, self.output)
        (self.output / 'logo.svg').unlink()
        with self.assertRaisesRegex(ValueError, 'asset'):
            validate_client(self.output)
        (self.output / 'logo.svg').write_text('<svg/>')
        (self.output / 'host_server.py').touch()
        with self.assertRaisesRegex(ValueError, 'Host/private'):
            validate_client(self.output)

    def test_no_absolute_assets_or_output_overlap(self):
        assemble(self.sources, self.output)
        (self.output / 'client.html').write_text('<script src="/session/js/shared.js"></script>')
        with self.assertRaisesRegex(ValueError, 'asset'):
            validate_client(self.output)
        with self.assertRaisesRegex(ValueError, 'overlaps'):
            assemble(self.sources, self.root)

    def test_redirect_preserves_invitation(self):
        script = REDIRECT.split('<script>')[1].split('</script>')[0]
        harness = '''const vm=require('node:vm'), assert=require('node:assert/strict');
const script=JSON.parse(process.argv[1]);
for (const suffix of ['', '?host=peer&token=a%2Bb&release=universeum-release#map']) {
 let result; const location=new URL('https://nodal-works.github.io/interactive_map/dev/client.html'+suffix);
 location.replace=value=>result=value;
 vm.runInNewContext(script,{URL,location,document:{getElementById:()=>({})}});
 assert.equal(result,'https://nodal-works.github.io/interactive_map/universeum/client.html'+suffix);
}'''
        subprocess.run(['node', '-e', harness, json.dumps(script)], check=True)


if __name__ == '__main__':
    unittest.main()
