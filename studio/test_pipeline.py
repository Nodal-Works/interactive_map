import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from . import locations as loc
from .pipeline import generate

class FailurePreservation(unittest.TestCase):
    def test_missing_dependencies_do_not_replace_prepared_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(loc,'HOME',Path(tmp)):
                value=loc.create('test','Test',[17.62,59.85,17.65,59.87],['canvas-btn'])
                folder=loc.directory('test');loc.write_json(folder/'media/trees.geojson',{'type':'FeatureCollection','features':[]})
                loc.register_assets(folder,value);loc.write_json(folder/'location.json',value)
                before=(folder/'location.json').read_bytes()
                with patch('studio.pipeline.generator',side_effect=ImportError('missing dependency')):
                    report=generate('test')
                self.assertEqual(report['state'],'failed')
                self.assertEqual(before,(folder/'location.json').read_bytes())
                self.assertTrue(loc.validate('test')['valid'])


class CachedGeneration(unittest.TestCase):
    def test_successful_resume_reuses_assets_and_exports_portably(self):
        import types
        try:
            import numpy as np
            import rasterio
            from rasterio.transform import from_origin
        except ImportError:
            self.skipTest('Run with preparation Python for raster integration test')
        calls=[]
        received_bounds=[]
        def geo(name):
            def run(bounds,media,*args):
                received_bounds.append(bounds)
                calls.append(name);loc.write_json(media/name,{'type':'FeatureCollection','features':[]})
            return run
        def dem(bounds,media):
            calls.append('dem')
            with rasterio.open(media/'clipped_dem.geotiff.tif','w',driver='GTiff',width=4,height=4,count=1,dtype='float32',crs='EPSG:3006',transform=from_origin(340000,6460008,2,2)) as output:output.write(np.ones((4,4),dtype='float32'),1)
        def model(bounds,media,mode="conditioned"):
            calls.append('mesh');(media/'mesh.stl').write_text('solid empty\nendsolid empty\n')
        def trees(media):
            calls.append('tree-model');(media/'trees_instanced.glb').write_bytes(b'test fixture')
        module=types.SimpleNamespace(dtcc=types.SimpleNamespace(Bounds=lambda *b:b),wgs84_to_sweref=lambda *b:(340000,6460000,340008,6460008),generate_footprints=geo('building-footprints.geojson'),generate_road_network=geo('street-network.geojson'),generate_water_bodies=geo('water-bodies.geojson'),generate_dem=dem,generate_mesh=model,generate_trees=geo('trees.geojson'),generate_trees_glb=trees)
        with tempfile.TemporaryDirectory() as temporary,patch.object(loc,'HOME',Path(temporary)),patch('studio.pipeline.generator',return_value=module):
            loc.create('test','Test',None,['canvas-btn'],projected_bounds=[340000,6460000,340008,6460008],bounds_crs='EPSG:3006')
            first=generate('test');self.assertEqual(first['state'],'completed')
            self.assertTrue(received_bounds)
            self.assertTrue(all(b == (340000,6460000,340008,6460008) for b in received_bounds))
            before=dict(loc.load('test')['assets']);count=len(calls)
            second=generate('test');self.assertEqual(second['state'],'completed')
            self.assertEqual(len(calls),count)
            self.assertTrue(all(stage.get('cached') for stage in second['stages'].values()))
            self.assertEqual(loc.load('test')['assets'],before)
            archive=loc.HOME/'test.zip';loc.export_package('test',archive)
            with patch.object(loc,'HOME',Path(temporary)/'other-host'):
                loc.import_package(archive);self.assertTrue(loc.validate('test')['valid'])

if __name__=='__main__':unittest.main()
