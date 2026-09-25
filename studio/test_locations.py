import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from . import locations as loc

class Packages(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=loc.HOME;loc.HOME=Path(self.temp.name)
    def tearDown(self):
        loc.HOME=self.old;self.temp.cleanup()
    def prepared(self,key='test'):
        value=loc.create(key,'Test',[17.62,59.85,17.65,59.87],['canvas-btn'])
        folder=loc.directory(key)
        loc.write_json(folder/'media/trees.geojson',{'type':'FeatureCollection','features':[]})
        value['capabilities']={'canvas-btn':{'status':'ready'}}
        loc.register_assets(folder,value);loc.write_json(folder/'location.json',value)
        return value
    def test_roundtrip_checksum_and_independent_config(self):
        self.prepared();self.assertTrue(loc.validate('test')['valid'])
        archive=loc.HOME/'test.zip';loc.export_package('test',archive)
        import shutil;shutil.rmtree(loc.directory('test'))
        loc.import_package(archive);loc.activate('test')
        cfg=loc.frontend_config(loc.active())
        self.assertEqual(cfg['layerCatalog'][0]['id'],'canvas-btn')
        self.assertIn('ecom-energy-btn',cfg['disabledLayers'])
        self.assertTrue(cfg['assets']['media/trees.geojson'].startswith('/location-assets/test/'))
        (loc.directory('test')/'media/trees.geojson').write_text('{}')
        self.assertFalse(loc.validate('test')['valid'])
        with self.assertRaises(ValueError):loc.activate('test')
    def test_reject_path_traversal(self):
        for name in ('../private','/etc/passwd','x/../../secret','C:\\secret'):
            with self.assertRaises(ValueError):loc.safe_path(loc.HOME,name)
        with self.assertRaises(ValueError):loc.create('../x','X',[17,59,18,60])
    def test_archive_does_not_extract_extra_files(self):
        value=self.prepared();value['id']='other'
        target=loc.HOME/'bad.zip'
        with zipfile.ZipFile(target,'w') as z:
            z.writestr('location.json',json.dumps(value));z.writestr('../secret','bad')
        with self.assertRaises(ValueError):loc.import_package(target)
        self.assertFalse(loc.directory('other').exists())
    def test_projected_universeum_extent_and_limits(self):
        from pyproj import Transformer
        b=[146087,6395990,150018.2,6401231.6]
        value=loc.create('universeum','Universeum',None,['canvas-btn'],projected_bounds=b,bounds_crs='EPSG:3007')
        recipe=value['recipe']
        self.assertEqual(recipe['sourceBounds'],b)
        self.assertEqual(recipe['sourceCrs'],'EPSG:3007')
        inverse=Transformer.from_crs(4326,3007,always_xy=True)
        to_provider=Transformer.from_crs(3007,3006,always_xy=True)
        g=recipe['generationBounds']
        for corner,expected in zip(recipe['corners'],[(b[0],b[1]),(b[2],b[1]),(b[2],b[3]),(b[0],b[3])]):
            x,y=inverse.transform(*corner)
            self.assertAlmostEqual(x,expected[0],places=4)
            self.assertAlmostEqual(y,expected[1],places=4)
            x,y=to_provider.transform(*expected)
            self.assertTrue(g[0]-1e-6 <= x <= g[2]+1e-6 and g[1]-1e-6 <= y <= g[3]+1e-6)
        self.assertTrue(loc.estimate(value['bounds'],2,g)['supported'])
        self.assertFalse(loc.estimate(value['bounds'],1,g)['supported'])
        config=loc.frontend_config(value)
        self.assertEqual(config['area']['corners'],recipe['corners'])
        self.assertEqual(config['calibration']['fallback']['fitBounds'],value['bounds'])
        old=loc.projected_extent([340000,6460000,342000,6462000],'EPSG:3006')
        self.assertEqual(old['generationBounds'],[340000,6460000,342000,6462000])
        with self.assertRaises(ValueError):loc.projected_extent(b,'EPSG:4326')
        with self.assertRaises(ValueError):loc.create('too-big','Big',None,projected_bounds=[146087,6395990,153087,6401231],bounds_crs='EPSG:3007')

    def test_table_profile_propagation(self):
        p=json.loads((loc.ROOT/'profiles/universeum.json').read_text())
        value=loc.create('universeum','Universeum',None,['canvas-btn'],projected_bounds=p['sourceBounds'],bounds_crs=p['sourceCrs'],table=p['table'],presentation=p['presentation'])
        config=loc.frontend_config(value)
        self.assertEqual(config['table']['columns'],8)
        self.assertEqual(config['table']['rows'],6)
        self.assertEqual(config['table']['tableWidth'],320)
        self.assertTrue(config['calibration']['fallback']['fitToTable'])
        self.assertEqual(config['presentation']['symbolSizing'],'geographic')
        for invalid in ({'columns':1.5},{'tableWidth':0},{'layoutMode':'stretch'}):
            with self.assertRaises(ValueError):loc.create('bad','Bad',[17.62,59.85,17.65,59.87],table=invalid)

    def test_empty_and_large(self):
        loc.create('empty','Empty',[17.62,59.85,17.65,59.87])
        self.assertFalse(loc.validate('empty')['valid'])
        with self.assertRaises(ValueError):loc.create('huge','Huge',[10,55,20,65])
    def test_corrupt_geojson(self):
        value=self.prepared();folder=loc.directory('test')
        loc.write_json(folder/'media/trees.geojson',{'type':'FeatureCollection','features':[{'geometry':{'type':'Point','coordinates':[300000,6400000]}}]})
        loc.register_assets(folder,value);loc.write_json(folder/'location.json',value)
        self.assertFalse(loc.validate('test')['valid'])

if __name__=='__main__':unittest.main()
