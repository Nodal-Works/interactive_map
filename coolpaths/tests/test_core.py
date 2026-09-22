import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from pyproj import Transformer
from rasterio.transform import from_origin

from coolpaths import api
from coolpaths.prepare import edge_samples, render_png
from coolpaths.routing import RouteError, Router
from coolpaths.thermal import pet_equal_pmv, pet_memi, radiant_temperature, shadow_mask, sky_view_factor


def sample_graph():
    nodes = {
        "a": [11.0, 57.0], "b": [11.001, 57.0],
        "c": [11.0, 57.001], "d": [11.001, 57.001],
    }
    edges = []
    for name, u, v, length in (("ab", "a", "b", 100), ("bd", "b", "d", 100),
                                ("ac", "a", "c", 120), ("cd", "c", "d", 120)):
        edges.append({"id": name, "u": u, "v": v, "length_m": length,
                      "coordinates": [nodes[u], nodes[v]], "name": name, "highway": "footway"})
    return {"nodes": nodes, "edges": edges}


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.graph = sample_graph()
        self.pet = {"ab": 40, "bd": 40, "ac": 20, "cd": 20}

    def test_cooler_route_respects_detour_and_reduces_heat(self):
        result = Router(self.graph, self.pet).route(self.graph["nodes"]["a"],
                                                      self.graph["nodes"]["d"])
        self.assertEqual(result["shortest"]["properties"]["distance_m"], 200)
        self.assertEqual(result["coolest"]["properties"]["distance_m"], 240)
        self.assertEqual(result["coolest"]["properties"]["heat_exposure_c_m"], 4800)
        self.assertEqual(result["comparison"]["heat_reduction_pct"], 40)
        self.assertLessEqual(result["coolest"]["properties"]["distance_m"], 1.5 * 200)

    def test_zero_detour_and_disconnected_path(self):
        router = Router(self.graph, self.pet)
        result = router.route(self.graph["nodes"]["a"], self.graph["nodes"]["d"], 0)
        self.assertEqual(result["coolest"]["properties"]["distance_m"], 200)
        with self.assertRaisesRegex(RouteError, "No walking route"):
            Router(self.graph, {"ab": 40, "cd": 20}).route(self.graph["nodes"]["a"],
                                                 self.graph["nodes"]["d"])

    def test_snap_rejects_click_far_from_network(self):
        with self.assertRaisesRegex(RouteError, "closer"):
            Router(self.graph, self.pet).snap([12, 58])


class ThermalTests(unittest.TestCase):
    def test_standard_pet_and_body_projection(self):
        # With air and radiation at 26.25 °C, the published MEMI model returns
        # a PET close to ambient; the notebook's PMV fallback returns ~40.7 °C.
        baseline = float(pet_memi(26.25, np.array([26.25]), 1.05, 49.18)[0])
        self.assertAlmostEqual(baseline, 25.74, delta=0.3)
        shade = radiant_temperature(26.25, np.array([0]), 214.8,
                                    np.array([0.9]), np.array([0.15]),
                                    np.array([False]), solar_elevation_deg=50)
        sun = radiant_temperature(26.25, np.array([422]), 214.8,
                                  np.array([0.9]), np.array([0.15]),
                                  np.array([False]), solar_elevation_deg=50)
        self.assertLess(float(shade[0]), float(sun[0]))
        self.assertLess(float(sun[0]), 65)

    def test_equal_pmv_matches_reference_notebook_samples(self):
        # Evaluated with the upstream notebook's pet_equal_pmv, met=2.3,
        # clo=0.9, vectorized numpy PMV fallback.
        actual = pet_equal_pmv(
            np.array([24, 30, 34]), np.array([27, 39, 52]),
            np.array([0.5, 1.1, 0.8]), np.array([45, 60, 70]))
        np.testing.assert_allclose(actual, [32.068634, 47.71927, 51.380768], atol=0.001)

    def test_flat_sky_and_building_shadow(self):
        ground = np.zeros((15, 15), dtype=np.float32)
        building = ground.copy()
        building[7, 9] = 10
        self.assertAlmostEqual(float(sky_view_factor(ground, ground, 2)[7, 7]), 1)
        self.assertLess(float(sky_view_factor(building, ground, 2)[7, 7]), 1)
        self.assertTrue(shadow_mask(building, ground, 2, azimuth_deg=90,
                                    elevation_deg=30)[7, 7])

    def test_raster_sampling_and_png_bounds_in_wgs84(self):
        point = [11.9778, 57.6884]
        project = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
        x, y = project.transform(*point)
        affine = from_origin(x - 20, y + 20, 2, 2)
        raster = np.full((20, 20), 31.25, dtype=np.float32)
        graph = {"nodes": {"a": point, "b": [point[0] + .0001, point[1]]},
                 "edges": [{"id": "e", "u": "a", "v": "b", "length_m": 6,
                            "coordinates": [point, [point[0] + .0001, point[1]]]}]}
        values = edge_samples(graph, raster, affine, project.transform)
        self.assertAlmostEqual(values["e"], 31.25)
        with tempfile.TemporaryDirectory() as directory:
            bounds = render_png(raster, affine, Path(directory) / "sample.png")
            self.assertLess(bounds[0], point[0])
            self.assertGreater(bounds[2], point[0])
            self.assertLess(bounds[1], point[1])
            self.assertGreater(bounds[3], point[1])


class ApiTests(unittest.TestCase):
    def test_unprepared_and_route_error(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(api, "DATA_ROOT", Path(directory)):
                api._cache["manifest_mtime"] = None
                self.assertFalse(api.status()["ready"])
                folder = api.study_folder()
                folder.mkdir()
                (folder / "manifest.json").write_text(json.dumps({"study_date": "2026-07-15", "hours": {"14": {}}}))
                (folder / "graph.json").write_text(json.dumps(sample_graph()))
                (folder / "edge_pet_14.json").write_text(json.dumps({"ab": 40}))
                self.assertTrue(api.status()["ready"])
                with self.assertRaises(api.HTTPException) as caught:
                    api.route(api.RouteRequest(origin=[11, 57], destination=[11.001, 57.001], hour=14))
                self.assertEqual(caught.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
