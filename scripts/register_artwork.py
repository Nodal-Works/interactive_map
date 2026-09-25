"""Fit the original artboard to EPSG:3857 from matched footprint correspondences.

Requires numpy. Source coordinates are centroids of the matching Illustrator
outlines; footprint indices refer to the original Lindholmen GeoJSON ordering.
"""
from pathlib import Path
import json, math
import numpy as np
ROOT=Path(__file__).resolve().parents[1]

def centroid(feature):
    g=feature['geometry'];ring=g['coordinates'][0] if g['type']=='Polygon' else max(g['coordinates'],key=lambda p:len(p[0]))[0]
    points=np.array([[math.radians(x)*6378137,math.log(math.tan(math.pi/4+math.radians(y)/2))*6378137] for x,y,*_ in ring])
    origin=points[0];p=points-origin;q=np.roll(p,-1,axis=0);cross=p[:,0]*q[:,1]-q[:,0]*p[:,1]
    return origin+((p+q)*cross[:,None]).sum(axis=0)/(3*cross.sum())

def main():
    source=json.loads((ROOT/'artwork-registration.json').read_text());features=json.loads((ROOT/'media/building-footprints.geojson').read_text())['features'];controls=source['controlPoints']
    X=np.array([p['artboard']+[1] for p in controls]);Y=np.array([centroid(features[p['footprintIndex']]) for p in controls]);matrix=np.linalg.lstsq(X,Y,rcond=None)[0]
    registration={'crs':'EPSG:3857','matrix':matrix.T.tolist(),'method':'One least-squares affine fit of six original building centroids; no individual building warping.'}
    factor=math.cos(math.radians(57.708))
    for key in ['controlPoints','validationPoints']:
        registration[key]=[]
        for p in source[key]:
            target=centroid(features[p['footprintIndex']]);residual=float(np.linalg.norm(np.r_[p['artboard'],1]@matrix-target)*factor)
            registration[key].append({**p,'mercator':target.tolist(),'residualGroundMetres':residual})
    errors=[p['residualGroundMetres'] for p in registration['controlPoints']]
    registration['rmsGroundMetres']=float(np.sqrt(np.mean(np.square(errors))));registration['maxGroundMetres']=max(errors)
    assert max(p['residualGroundMetres'] for p in registration['validationPoints'])<.3,'Registration no longer matches the independent buildings'
    path=ROOT/'media/artwork/manifest.json';manifest=json.loads(path.read_text());manifest['registration']=registration;path.write_text(json.dumps(manifest,indent=2)+'\n')
    print(f"Registration: {registration['rmsGroundMetres']:.3f} m RMS; independent validation < 0.3 m")
if __name__=='__main__':main()
