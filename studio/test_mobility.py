"""Scientific importer checks, plus acceptance of the pinned research snapshot."""
import json
from pathlib import Path
import tempfile
import unittest
import geopandas as gpd
import numpy as np
from shapely.geometry import box, Point, shape
from .mobility import point_values, blended_cells, footprint, prepare, SOURCE_COMMIT
from . import locations as loc

class MobilityMath(unittest.TestCase):
    def test_missing_is_not_zero_and_average_is_trip_weighted(self):
        trips=np.array([[0,3,10],[0,1,10]])
        missed=np.array([[0,0,1],[0,1,3]])
        delay=np.array([[0,0,2],[0,10,30]])
        v=point_values(trips,missed,delay)
        self.assertTrue(np.isnan(v[:,0]).all())
        self.assertEqual(v[0,1],0)
        self.assertEqual(v[1,1],10)
        total=point_values(trips.sum(0),missed.sum(0),delay.sum(0))
        self.assertEqual(total[2],8)  # 32 minutes / four missed trips, not mean(2,10)

    def test_interpolation_limits_missing_and_clipped_cells(self):
        points=gpd.GeoDataFrame(geometry=[Point(5,5),Point(15,5)],crs=3006)
        cells,values=blended_cells(points,np.array([[np.nan,0],[10,20]]),box(0,0,100,10),10,2,15)
        self.assertTrue(len(cells)<10,'No extrapolation beyond the exporter limit')
        self.assertTrue(all(c.within(box(0,0,100,10)) for c in cells))
        self.assertEqual(values[0,0],10,'Ignore missing neighbours without diluting known values')
        self.assertLess(values[0,1],1,'Zero remains a real sample')

    def test_exact_projected_rectangle(self):
        manifest={'recipe':{'sourceBounds':[146087,6395990,150018.2,6401231.6],'sourceCrs':'EPSG:3007'}}
        self.assertEqual(footprint(manifest,3007).bounds,tuple(manifest['recipe']['sourceBounds']))

class PinnedSnapshot(unittest.TestCase):
    def test_research_acceptance(self):
        source=loc.HOME/'cache/mobility'/SOURCE_COMMIT
        if not source.exists():self.skipTest('Pinned inputs absent: use the importer download command')
        manifest=loc.load('universeum')
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp);result=prepare(source,out,manifest)
            self.assertEqual(result['syntheticTrips'],1018)
            self.assertEqual(result['journeys'],175)
            self.assertEqual(result['completedDepartures'],6)
            area=footprint(manifest,3007)
            for file in ['synthpop.geojson','slow-walkers.geojson','districts.geojson']:
                data=json.loads((out/file).read_text())
                geometries=gpd.GeoSeries([shape(f['geometry']) for f in data['features']],crs=4326).to_crs(3007)
                # Transforming straight projected edges introduces centimetre-scale chord error.
                self.assertTrue(all(g.difference(area.buffer(.05)).area<1e-6 for g in geometries),file)
            grid=json.loads((out/'slow-walkers.geojson').read_text())
            self.assertEqual(grid['metadata']['departures'],['06:25','06:49','07:15','07:38','08:09','08:31'])
            self.assertTrue(all(len(f['properties']['values'])==7 for f in grid['features']))
            self.assertEqual({f['properties']['grid'] for f in grid['features']},{'campus','city'})
            journeys=json.loads((out/'journeys.json').read_text())
            self.assertEqual(len(journeys['tracks']),350)
            # Itinerary finish times reproduce CSV delays independently of rendering.
            pairs={}
            for t in journeys['tracks']:pairs.setdefault(t['id'],{})[t['walker']]=t
            for p in pairs.values():
                self.assertAlmostEqual((p['slow']['finish']-p['medium']['finish'])/60,p['slow']['delayMinutes'],delta=.025)

if __name__=='__main__':unittest.main()
