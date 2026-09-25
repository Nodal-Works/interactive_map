import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from host_server import allowed_service
from scripts.services import configuration


class SessionServerTests(unittest.TestCase):
    def test_ports_are_distinct(self):
        config = configuration()
        self.assertEqual(4, len({config[name] for name in ('host', 'ecom', 'coolpaths', 'sam')}))

    def test_service_allowlist(self):
        self.assertTrue(allowed_service('ecom', '/api/mr/layer', 'POST'))
        self.assertTrue(allowed_service('coolpaths', '/api/coolpaths/layers/pet/14.png', 'GET'))
        self.assertTrue(allowed_service('sam', '/segment', 'POST'))
        for service, path, method in [('ecom', '/api/scenarios/arbitrary', 'GET'), ('ecom', '/api/health', 'POST'),
                                     ('sam', '//evil.example/', 'GET'), ('coolpaths', '/api/coolpaths/../secret', 'GET'),
                                     ('sam', '/%2e%2e/secret', 'GET'), ('unknown', '/', 'GET')]:
            self.assertFalse(allowed_service(service, path, method))


if __name__ == '__main__':
    unittest.main()
