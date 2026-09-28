"""Serve a Git revision with identical diagnostics, assets and local API routes.

Use --ref <baseline SHA> or --ref working; results go to .runtime/benchmarks.
This is a loopback-only test server, not the workshop launcher.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref',default='working')
    parser.add_argument('--port',type=int,default=8094)
    parser.add_argument('--host-port',type=int,default=8090)
    args=parser.parse_args()
    cache={}
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
        def do_GET(self):
            path=unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
            if path.startswith('api/') or path=='session/runtime.js':
                try:
                    with urlopen(f'http://127.0.0.1:{args.host_port}{self.path}',timeout=30) as response:
                        data=response.read();self.send_response(response.status);self.send_header('Content-Type',response.headers.get('Content-Type','application/json'));self.end_headers();self.wfile.write(data)
                except OSError:self.send_error(502)
                return
            if not (ROOT/path).resolve().is_relative_to(ROOT):self.send_error(403);return
            if path.endswith(('.html','.js','.css','.json')) and (ROOT/path).is_file():
                data=(ROOT/path).read_bytes()
                if args.ref!='working' and not path.startswith('scripts/'):
                    if path not in cache:
                        result=subprocess.run([os.environ.get('MR_GIT','git'),'show',f'{args.ref}:{path}'],cwd=ROOT,capture_output=True)
                        cache[path]=result.stdout if result.returncode==0 else data
                    data=cache[path]
                if path=='index.html':data=data.replace(b'</body>',b'<script src="scripts/demo-diagnostics.js"></script></body>')
                self.send_response(200);self.send_header('Content-Type',self.guess_type(path));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
            super().do_GET()
        def do_POST(self):
            if self.path!='/__benchmark':self.send_error(404);return
            size=int(self.headers.get('Content-Length',0))
            if not 0<size<100000:self.send_error(413);return
            data=json.loads(self.rfile.read(size));data['revision']=args.ref
            folder=ROOT/'.runtime/benchmarks';folder.mkdir(parents=True,exist_ok=True)
            with (folder/f'{args.port}.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(data)+'\n')
            self.send_response(204);self.end_headers()
        def log_message(self,*a):pass
    print(f'Benchmark {args.ref}: http://127.0.0.1:{args.port}/index.html',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()

if __name__=='__main__':main()
