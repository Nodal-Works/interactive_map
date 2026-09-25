"""MR Studio location commands. Run `python -m studio --help`."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from . import locations as loc

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    create=commands.add_parser('create');create.add_argument('id');create.add_argument('--title')
    bounds=create.add_mutually_exclusive_group(required=True)
    bounds.add_argument('--bbox',nargs=4,type=float);bounds.add_argument('--bbox-sweref',nargs=4,type=float);bounds.add_argument('--location')
    create.add_argument('--bounds-crs',default='EPSG:3006',help='CRS for --bbox-sweref (default EPSG:3006)')
    create.add_argument('--size',type=float,default=2000);create.add_argument('--resolution',type=float,default=2)
    create.add_argument('--mesh-mode',choices=['conditioned','display'],default='conditioned')
    create.add_argument('--study-date');create.add_argument('--layers',nargs='*')
    for command in ('generate','validate','launch','export'):
        sub=commands.add_parser(command);sub.add_argument('id')
        if command=='generate':sub.add_argument('--refresh',action='store_true')
        if command=='export':sub.add_argument('output')
        if command=='launch':sub.add_argument('--no-open',action='store_true')
    sub=commands.add_parser('import');sub.add_argument('archive')
    legacy=commands.add_parser('import-legacy');legacy.add_argument('profile',choices=['campus','lindholmen'])
    commands.add_parser('list');commands.add_parser('doctor')
    args=parser.parse_args()
    try:
        if args.command=='create':
            bbox=args.bbox
            if args.bbox_sweref:
                from pyproj import Transformer
                bbox=list(Transformer.from_crs(args.bounds_crs,4326,always_xy=True).transform_bounds(*args.bbox_sweref))
            elif args.location:
                from geopy.geocoders import Nominatim
                from pyproj import Transformer
                result=Nominatim(user_agent='mr-studio-location-builder').geocode(args.location+', Sweden',country_codes='se',timeout=20)
                if result is None:raise ValueError('Place not found')
                x,y=Transformer.from_crs(4326,3006,always_xy=True).transform(result.longitude,result.latitude)
                r=args.size/2;bbox=list(Transformer.from_crs(3006,4326,always_xy=True).transform_bounds(x-r,y-r,x+r,y+r))
            value=loc.create(args.id,args.title or args.id,bbox,args.layers,args.resolution,args.study_date,projected_bounds=args.bbox_sweref,bounds_crs=args.bounds_crs,mesh_mode=args.mesh_mode)
        elif args.command=='generate':
            from .pipeline import generate
            value=generate(args.id,lambda state:print(json.dumps(state),flush=True),args.refresh)
            if value['state']!='completed':return 1
        elif args.command=='validate':
            value=loc.validate(args.id)
            print(json.dumps(value,indent=2));return 0 if value['valid'] else 1
        elif args.command=='launch':
            loc.activate(args.id)
            return subprocess.call([sys.executable,str(loc.ROOT/'scripts/services.py'),*(['--no-open'] if args.no_open else [])])
        elif args.command=='export':value=loc.export_package(args.id,args.output)
        elif args.command=='import':value=loc.import_package(args.archive)
        elif args.command=='import-legacy':
            from .legacy import import_legacy
            value=import_legacy(args.profile)
        elif args.command=='list':value=loc.list_locations()
        else:
            from .diagnostics import doctor
            value=doctor()
        print(json.dumps(value,indent=2));return 0
    except (ValueError,OSError,ImportError) as error:
        print(str(error),file=sys.stderr);return 1

if __name__=='__main__':sys.exit(main())
