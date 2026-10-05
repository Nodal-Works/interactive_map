import importlib.util
from pathlib import Path
import sys
import json
import tempfile
import unittest
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from host_server import HostHandler, allowed_service
from scripts.services import configuration


class SessionServerTests(unittest.TestCase):
    def test_local_source_assets_are_not_cached(self):
        for path in ('/', '/index.html', '/session/js/shared.js?v=old', '/style.css'):
            handler = HostHandler.__new__(HostHandler)
            handler.path = path
            handler.request_version = 'HTTP/1.1'
            handler.wfile = BytesIO()
            handler._headers_buffer = []
            handler.end_headers()
            self.assertIn(b'Cache-Control: no-store', handler.wfile.getvalue())

    def test_ports_are_distinct(self):
        config = configuration()
        self.assertEqual(3, len({config[name] for name in ('host', 'ecom', 'coolpaths')}))

    def test_explicit_client_url_is_preserved(self):
        for url in ('https://operator.example/custom/client.html',
                    'https://nodal-works.github.io/interactive_map/client.html'):
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'services.json'
                path.write_text(json.dumps({'client_url': url}))
                self.assertEqual(url, configuration(path)['client_url'])

    def test_service_allowlist(self):
        self.assertTrue(allowed_service('ecom', '/api/mr/layer', 'POST'))
        self.assertTrue(allowed_service('coolpaths', '/api/coolpaths/layers/pet/14.png', 'GET'))
        self.assertFalse(allowed_service('sam', '/segment', 'POST'))
        for service, path, method in [('ecom', '/api/scenarios/arbitrary', 'GET'), ('ecom', '/api/health', 'POST'),
                                     ('sam', '//evil.example/', 'GET'), ('coolpaths', '/api/coolpaths/../secret', 'GET'),
                                     ('sam', '/%2e%2e/secret', 'GET'), ('unknown', '/', 'GET')]:
            self.assertFalse(allowed_service(service, path, method))


if __name__ == '__main__':
    unittest.main()
