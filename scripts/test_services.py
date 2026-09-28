"""Supervisor portability tests; no services or package installs are started."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('services', Path(__file__).with_name('services.py'))
services = importlib.util.module_from_spec(spec)
spec.loader.exec_module(services)


class SupervisorTests(unittest.TestCase):
    def test_windows_environments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(services, 'os', SimpleNamespace(name='nt')):
                self.assertEqual(services.environment_python(root), root / '.venv/Scripts/python.exe')
                (root / '.venv').write_text('Unix environment pointer')
                self.assertEqual(services.environment_python(root), root / '.venv-windows-312/Scripts/python.exe')
            with patch.object(services, 'os', SimpleNamespace(name='posix')):
                self.assertEqual(services.environment_python(root), root / '.venv/bin/python')

    def test_windows_lock(self):
        locking = Mock()
        windows = SimpleNamespace(LK_NBLCK=2, locking=locking)
        with tempfile.TemporaryFile(mode='w+') as lock, \
                patch.object(services, 'os', SimpleNamespace(name='nt')), \
                patch.object(services, 'msvcrt', windows, create=True):
            self.assertTrue(services.lock_supervisor(lock))
            locking.assert_called_once_with(lock.fileno(), 2, 1)
            lock.seek(0)
            self.assertEqual(lock.read(), '\0')
            locking.side_effect = OSError('already locked')
            self.assertFalse(services.lock_supervisor(lock))

    def test_environment_setup_and_reuse(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            python = root / '.venv/bin/python'
            with patch.object(services.subprocess, 'run', return_value=SimpleNamespace(returncode=1)) as run:
                services.ensure_environment(root, root / 'requirements.txt', 'import fastapi')
                self.assertEqual(run.call_count, 3)
                self.assertEqual(run.call_args_list[0].args[0][1:3], ['-m', 'venv'])
                self.assertEqual(run.call_args_list[2].args[0][1:4], ['-m', 'pip', 'install'])
            python.parent.mkdir(parents=True)
            python.touch()
            with patch.object(services.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run:
                services.ensure_environment(root, root / 'requirements.txt', 'import fastapi')
                self.assertEqual(run.call_count, 1, 'Healthy environments do not reinstall packages')

    def test_service_commands_do_not_require_bash(self):
        config = {'host': 8090, 'ecom': 8001, 'coolpaths': 8002, 'sam': 8003, 'sam_directory': 'missing-sam'}
        with tempfile.TemporaryDirectory() as directory, patch.object(services, 'ROOT', Path(directory)), \
                patch.object(services, 'ensure_environment', return_value=Path(directory) / 'python.exe'):
            for name in ['host', 'ecom', 'coolpaths']:
                command, cwd = services.service_command(name, config)
                self.assertNotIn('bash', command)
                self.assertTrue(cwd.is_relative_to(Path(directory)))
                if name != 'host':
                    self.assertEqual(command[-3:], ['127.0.0.1', '--port', str(config[name])])
            with self.assertRaises(FileNotFoundError):
                services.service_command('sam', config)

    def test_atomic_status_retry(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(services, 'RUNTIME', Path(directory)):
            data = {'host': {'port': 8090, 'status': 'ready'}}
            original = Path.replace
            calls = 0

            def replace(path, target):
                nonlocal calls
                calls += 1
                if calls == 1:
                    raise PermissionError('Windows reader temporarily holds file')
                return original(path, target)

            with patch.object(Path, 'replace', replace), patch.object(services.time, 'sleep'):
                services.write_status(data)
            self.assertEqual(calls, 2)
            self.assertEqual(json.loads((Path(directory) / 'status.json').read_text()), data)
            self.assertEqual(list(Path(directory).glob('status.*.tmp')), [])


if __name__ == '__main__':
    unittest.main()
