"""Exercise display mesh coordinates against the installed DTCC backend."""
import unittest
from types import SimpleNamespace

class DisplayMesh(unittest.TestCase):
    def test_terrain_and_both_buildings_keep_coordinates(self):
        import numpy as np
        from affine import Affine
        from scripts.generate_assets import build_display_mesh, dtcc
        raster=dtcc.Raster(data=np.full((4,4),2.0),georef=Affine(2,0,100,0,-2,208))
        def building(x,y,height):
            points=np.array([[x,y,2],[x+1,y,2],[x+1,y+1,2],[x,y+1,2],
                             [x,y,height],[x+1,y,height],[x+1,y+1,height],[x,y+1,height]],dtype=float)
            rings=((4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7))
            surfaces=[dtcc.Surface(vertices=points[list(ring)]) for ring in rings]
            return SimpleNamespace(id=str(x),lod1=dtcc.MultiSurface(surfaces=surfaces))
        mesh=build_display_mesh([building(102,202,10),building(105,205,20)],raster)
        self.assertTrue(np.isfinite(mesh.vertices).all())
        np.testing.assert_allclose(mesh.vertices.min(axis=0),[100,200,2])
        np.testing.assert_allclose(mesh.vertices.max(axis=0),[108,208,20])
        for x,y,z in ((102,202,10),(105,205,20)):
            self.assertTrue(np.any(np.all(np.isclose(mesh.vertices,[x,y,z]),axis=1)))
        self.assertGreater(len(mesh.faces),20)
        with self.assertRaisesRegex(ValueError,'no LOD1'):
            build_display_mesh([SimpleNamespace(id='missing',lod1=None)],raster)

if __name__=='__main__':unittest.main()
