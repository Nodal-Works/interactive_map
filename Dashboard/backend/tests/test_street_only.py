"""The MR layer must never replace a missing street route with an elbow."""

import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import mr_layer
from app.schemas.community import CommunitySpec


def sample_dispatch():
    return {
        "nodes": [
            {"id": "AWL", "type": "building"},
            {"id": "Fysik origo", "type": "building"},
        ],
        "links": [{"source": "AWL", "target": "Fysik origo", "flow": [1.0]}],
        "meta": {"period": "test", "hours": 1, "community": "test"},
    }


class StreetOnlyLayerTests(unittest.TestCase):
    def test_awl_uses_connected_street(self):
        layer = mr_layer.build_layer(sample_dispatch())
        route = layer["flows"]["features"][0]["geometry"]["coordinates"]
        self.assertGreater(len(route), 4)

    def test_missing_street_network_rejects_layer(self):
        with patch.object(mr_layer, "_street_graph", return_value=None), \
             patch.object(mr_layer, "STREETS", Path("/missing/street-network.geojson")):
            with self.assertRaisesRegex(ValueError, "Street network is missing"):
                mr_layer.build_layer(sample_dispatch())

    def test_disconnected_street_route_rejects_layer(self):
        with patch.object(mr_layer, "street_route", return_value=None):
            with self.assertRaisesRegex(ValueError, "No street route for AWL"):
                mr_layer.build_layer(sample_dispatch())

    def test_api_reports_routing_error_to_controller(self):
        from app import main

        spec = CommunitySpec(**main.get_scenario("campus_community"))
        with patch.object(main, "run_dispatch", return_value={}), \
             patch.object(main, "build_layer", side_effect=ValueError("No street route")):
            with self.assertRaises(main.HTTPException) as caught:
                main.mr_layer(spec)
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(caught.exception.detail, "No street route")


if __name__ == "__main__":
    unittest.main()
