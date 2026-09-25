import unittest
import numpy as np
from coolpaths.prepare import terrain_without_barriers

class LindholmenTerrainTests(unittest.TestCase):
    def test_barriers_are_not_thermal_terrain(self):
        terrain = np.array([[2., 2., 2.], [2., 200., 2.], [2., 2., np.nan]])
        buildings = np.zeros(terrain.shape, dtype=bool)
        buildings[1, 1] = True
        actual = terrain_without_barriers(terrain, buildings)
        self.assertEqual(actual[1, 1], 2)
        np.testing.assert_equal(actual[~buildings], terrain[~buildings])
        self.assertEqual(terrain[1, 1], 200)

    def test_no_ground_is_explicit_failure(self):
        with self.assertRaisesRegex(ValueError, 'no valid ground'):
            terrain_without_barriers(np.ones((2, 2)), np.ones((2, 2), dtype=bool))

    def test_campus_data_is_not_served_as_lindholmen(self):
        import json, tempfile
        from pathlib import Path
        from unittest.mock import patch
        from coolpaths import api
        with tempfile.TemporaryDirectory() as folder, patch.object(api, "DATA_ROOT", Path(folder)):
            study = api.study_folder()
            study.mkdir(parents=True)
            (study / "manifest.json").write_text(json.dumps({"location":"campus"}))
            api._cache["manifest_mtime"] = None
            self.assertFalse(api.status()["ready"])
