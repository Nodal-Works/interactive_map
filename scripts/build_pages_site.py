"""Assemble stable and dev phone clients into one GitHub Pages artifact."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stable',type=Path,required=True)
    parser.add_argument('--dev',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'dist/pages')
    args=parser.parse_args()
    output=args.output.resolve()
    # Build both completely before replacing the composite artifact.
    for checkout in (args.stable,args.dev):
        subprocess.run([sys.executable,str(checkout/'scripts/build_session_client.py')],cwd=checkout,check=True)
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staging=Path(tmp)/'site'
        shutil.copytree(args.stable/'dist/session-client',staging)
        shutil.copytree(args.dev/'dist/session-client',staging/'dev')
        if output.exists():shutil.rmtree(output)
        shutil.move(str(staging),output)
    print('Stable: /client.html; dev: /dev/client.html')

if __name__=='__main__':main()
