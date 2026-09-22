"""Run with: .venv/bin/python -m unittest discover -s scripts -p 'test_*.py'."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import numpy as np
from rasterio.transform import from_origin

from process_dem_flow import (calculate_flow_accumulation, calculate_flow_direction_d8,
                              rasterize_buildings, OFFSETS)


class FlowTests(unittest.TestCase):
    def test_downhill_only_and_nodata(self):
        dem = np.array([[5., 5., 5.], [5., 1., 5.], [np.nan, 5., 5.]])
        directions = calculate_flow_direction_d8(dem)
        self.assertEqual(directions[1, 1], 0)
        self.assertEqual(directions[2, 0], 0)
        self.assertEqual(calculate_flow_accumulation(directions, np.isfinite(dem))[1, 1], 8)

    def test_each_cell_counted_once(self):
        np.testing.assert_array_equal(calculate_flow_accumulation(np.array([[1, 1, 1, 0]])),
                                      [[1, 2, 3, 4]])
        with self.assertRaisesRegex(ValueError, 'cycle'):
            calculate_flow_accumulation(np.array([[1, 16]]))

    def test_building_blocks_flow_and_diagonal_corners(self):
        dem = np.array([[4., 3., 2.], [4., 3., 2.], [4., 3., 2.]])
        buildings = np.zeros(dem.shape, dtype=bool)
        buildings[1, 1] = True
        flow = calculate_flow_direction_d8(dem, buildings)
        self.assertEqual(flow[1, 1], 0)
        # At the west wall water cannot cut diagonally into the adjacent cells.
        self.assertEqual(flow[1, 0], 0)
        acc = calculate_flow_accumulation(flow, ~buildings)
        self.assertEqual(acc[1, 1], 0)
        self.assertEqual(acc[flow == 0].sum(), 8)

    def test_water_is_outlet(self):
        dem = np.array([[2., 1., 0., -1.]])
        flow = calculate_flow_direction_d8(dem, water_mask=dem <= 0)
        np.testing.assert_array_equal(flow, [[1, 1, 0, 0]])

    def test_multipolygons_and_courtyards(self):
        shell = [[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]
        hole = [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]
        other = [[4, 0], [5, 0], [5, 1], [4, 1], [4, 0]]
        features = {'features': [{'geometry': {'type': 'MultiPolygon',
                    'coordinates': [[shell, hole], [other]]}}]}
        mask = rasterize_buildings(features, (3, 5), from_origin(0, 3, 1, 1), 'EPSG:4326')
        self.assertEqual(mask.sum(), 9)
        self.assertFalse(mask[1, 1])
        self.assertTrue(mask[2, 4])

    def test_browser_matches_python(self):
        rng = np.random.default_rng(1234)
        dem = rng.integers(0, 50, (12, 15)).astype(float)
        buildings = rng.random(dem.shape) < .2
        water = (dem <= 0) & ~buildings
        flow = calculate_flow_direction_d8(dem, buildings, water, (2, 3))
        acc = calculate_flow_accumulation(flow, ~buildings)
        fixture = dict(dem=dem.tolist(), buildings=buildings.tolist(), water=water.tolist(),
                       cellSize=[2, 3], directions=flow.tolist(), accumulation=acc.tolist())
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'fixture.json'
            path.write_text(json.dumps(fixture))
            subprocess.run(['node', str(Path(__file__).with_name('test_stormwater_flow.cjs')), str(path)],
                           check=True)


if __name__ == '__main__':
    unittest.main()
