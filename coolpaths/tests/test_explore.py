import tempfile
from pathlib import Path
import unittest

import geopandas as gpd
import numpy as np
from PIL import Image
from pyproj import Transformer
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box

from coolpaths import explore


class ExploreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.folder = Path(self.directory.name)
        self.point = [11.9778, 57.6884]
        project = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
        x, y = project.transform(*self.point)
        self.affine = from_origin(x - 20, y + 20, 2, 2)
        self.manifest = {
            "bounds": [11.9774, 57.6882, 11.9782, 57.6886],
            "hours": {"14": {"air_temperature_c": 26, "utc": "2026-07-15T12:00:00+00:00"}},
        }
        self.write_raster("pet_14.tif", 31)
        self.write_raster("mrt_14.tif", 44)
        self.write_raster("svf.tif", .75)
        self.write_raster("shade_14.tif", 1)
        self.write_raster("ee_water.tif", 0)
        # Keep the sample outside a building while retaining valid source geometry.
        gpd.GeoDataFrame({"height_m": [6], "source": ["inferred"]},
                         geometry=[box(x + 10, y + 10, x + 14, y + 14)],
                         crs="EPSG:3006").to_file(self.folder / "buildings.gpkg", driver="GPKG")

    def write_raster(self, name, value):
        with rasterio.open(self.folder / name, "w", driver="GTiff", height=20, width=20,
                           count=1, dtype="float32", crs="EPSG:3006",
                           transform=self.affine, nodata=-9999) as dst:
            dst.write(np.full((20, 20), value, dtype=np.float32), 1)

    def test_inspector_samples_projected_cells_and_reports_missing_fields(self):
        sample = explore.inspect_point(self.folder, 1, self.manifest, self.point, 14)
        self.assertEqual(sample["values"]["pet"], 31)
        self.assertEqual(sample["values"]["svf"], .75)
        self.assertIsNone(sample["values"]["canopy"])
        self.assertIn("canopy", sample["missing_layers"])
        self.assertEqual(sample["weather"]["air_temperature_c"], 26)
        with self.assertRaisesRegex(ValueError, "study area"):
            explore.inspect_point(self.folder, 1, self.manifest, [0, 0], 14)

    def test_nodata_is_not_reported_as_temperature(self):
        self.write_raster("pet_14.tif", -9999)
        sample = explore.inspect_point(self.folder, 2, self.manifest, self.point, 14)
        self.assertIsNone(sample["values"]["pet"])
        self.assertIn("No walking PET", sample["message"])

    def test_building_sample_does_not_present_indoor_comfort(self):
        x, y = self.affine * (16, 4)
        point = Transformer.from_crs("EPSG:3006", "EPSG:4326", always_xy=True).transform(x, y)
        sample = explore.inspect_point(self.folder, 1, self.manifest, point, 14)
        self.assertIsNotNone(sample["building"])
        self.assertIsNone(sample["values"]["pet"])
        self.assertIsNone(sample["values"]["mrt"])
        self.assertIsNone(sample["values"]["shade"])

    def test_overlay_uses_whitelist_and_transparency(self):
        with self.assertRaisesRegex(ValueError, "Unknown"):
            explore.render_layer(self.folder, 1, self.manifest, "../../private", 14)
        path = explore.render_layer(self.folder, 1, self.manifest, "water", 14)
        with Image.open(path) as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(np.asarray(image)[..., 3].max(), 0)
        self.assertEqual(path, explore.render_layer(self.folder, 1, self.manifest, "water", 14))

    def test_building_geometry_is_returned_in_wgs84(self):
        feature = explore.buildings(self.folder, 1)["features"][0]
        lon, lat = feature["geometry"]["coordinates"][0][0]
        self.assertTrue(11 < lon < 12)
        self.assertTrue(57 < lat < 58)
        self.assertEqual(feature["properties"]["height_m"], 6)


if __name__ == "__main__":
    unittest.main()
