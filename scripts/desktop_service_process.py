"""Windows console helpers for the two desktop launchers (standard library only)."""
import ctypes
import pathlib
import subprocess
import sys
import time


def main():
    if sys.argv[1] == 'stop':
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.FreeConsole()
        if not kernel.AttachConsole(int(sys.argv[2])):
            raise ctypes.WinError(ctypes.get_last_error())
        # Ignore our own broadcast; the server console receives normal Ctrl+C.
        kernel.SetConsoleCtrlHandler(None, True)
        if not kernel.GenerateConsoleCtrlEvent(0, 0):
            raise ctypes.WinError(ctypes.get_last_error())
        time.sleep(0.3)
        kernel.FreeConsole()
    elif sys.argv[1] == 'start':
        root = pathlib.Path(sys.argv[2]).resolve()
        runtime = root / '.runtime'
        runtime.mkdir(exist_ok=True)
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
        with (runtime / 'desktop-supervisor.log').open('a', encoding='utf-8') as log:
            process = subprocess.Popen(
                [sys.executable, '-u', str(root / 'scripts/services.py'), '--no-open'],
                cwd=root, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NEW_CONSOLE, startupinfo=startup,
            )
        print(process.pid)
    else:
        raise ValueError('Expected start or stop')


if __name__ == '__main__':
    main()
