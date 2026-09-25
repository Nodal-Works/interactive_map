#!/usr/bin/env python3
"""Create the isolated preparation environment (macOS/Linux/Windows WSL2)."""
import argparse
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import venv

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    if platform.system()=='Windows':
        sys.exit('Run this setup inside WSL2 Ubuntu. See docs/locations.md for the Windows setup steps.')
    if sys.version_info[:2]!=(3,12):sys.exit('Use Python 3.12 for the locked preparation environment.')
    missing=[name for name in ('git','c++') if not shutil.which(name)]
    if missing:sys.exit('Install these build prerequisites first: '+', '.join(missing))
    env=ROOT/'.studio/env';python=env/'bin/python'
    if args.check:
        sys.exit(subprocess.call([str(python),'-m','studio','doctor'],cwd=ROOT) if python.exists() else 'Preparation environment not installed')
    if not python.exists():venv.EnvBuilder(with_pip=True).create(env)
    subprocess.run([str(python),'-m','pip','install','--no-deps','-r',str(ROOT/'studio/requirements.lock')],check=True,cwd=ROOT)
    subprocess.run([str(python),'-m','studio','doctor'],check=True,cwd=ROOT)
    print('\nReady: .studio/env/bin/python -m studio launch <location-id>\nOr: .studio/env/bin/python scripts/services.py')

if __name__=='__main__':main()
