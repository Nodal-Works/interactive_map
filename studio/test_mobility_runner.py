"""Small routing fixtures exercise scientific aggregation and durable resume."""
from pathlib import Path
from types import SimpleNamespace
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

from . import mobility_run as runner


def matrix(rows):
    return pd.DataFrame(rows, columns=['from_id', 'to_id', 'travel_time'])


class RoutingTotals(unittest.TestCase):
    def test_self_locations_are_excluded_and_unrelated_equal_ids_retained(self):
        # o17 and d2 are the same place, whereas o17 and d17 are distinct.
        medium = matrix([('o17', 'd2', 0), ('o17', 'd17', 10), ('o9', 'd2', 20), ('o9', 'd17', np.nan)])
        slow = matrix([('o17', 'd2', 0), ('o17', 'd17', 15), ('o9', 'd2', 30), ('o9', 'd17', np.nan)])
        result = runner.batch_totals(slow, medium, [17, 9],
                                    {'o17': np.array([100, 100]), 'o9': np.array([200, 100])},
                                    {'d2': np.array([100, 100]), 'd17': np.array([300, 100])})
        np.testing.assert_array_equal(result['trips'], [1, 1])
        np.testing.assert_array_equal(result['missed'], [1, 1])
        np.testing.assert_array_equal(result['missed_delay'], [5, 10])

    def test_missing_routes_are_not_counted_as_zero_and_totals_are_weighted(self):
        medium = matrix([(f'o{o}', f'd{d}', {7: [10, 20, 10, 10, np.nan], 8: [10] + [np.nan] * 4,
                                            9: [np.nan] * 5}[o][d - 1])
                         for o in [7, 8, 9] for d in range(1, 6)])
        slow = matrix([(f'o{o}', f'd{d}', {7: [14, 30, 10, np.nan, 20], 8: [10] + [np.nan] * 4,
                                         9: [np.nan] * 5}[o][d - 1])
                       for o in [7, 8, 9] for d in range(1, 6)])
        result = runner.batch_totals(slow, medium, [7, 8, 9],
                                    {f'o{i}': np.array([i * 100, 0]) for i in [7, 8, 9]},
                                    {f'd{i}': np.array([i * 100, 100]) for i in range(1, 6)})
        np.testing.assert_array_equal(result['trips'], [3, 1, 0])
        np.testing.assert_array_equal(result['missed'], [2, 0, 0])
        np.testing.assert_array_equal(result['missed_delay'], [14, 0, 0])
        self.assertEqual(result['unreachable_slow'], 1)
        from .mobility import point_values
        values = point_values(result['trips'], result['missed'], result['missed_delay'])
        self.assertEqual(values[0], 7)
        self.assertEqual(values[1], 0)
        self.assertTrue(np.isnan(values[2]))

    def test_source_rounding_tolerance_and_negative_delay(self):
        expected_walk_penalty = (4.8 / 4.235 - 1) * 10 + 1
        medium = matrix([('o1', 'd1', 10), ('o1', 'd2', 10), ('o1', 'd3', 10)])
        slow = matrix([('o1', 'd1', 10 + expected_walk_penalty),
                       ('o1', 'd2', 10 + expected_walk_penalty + .01), ('o1', 'd3', 9)])
        result = runner.batch_totals(slow, medium, [1], {'o1': np.array([0, 0])},
                                    {f'd{i}': np.array([i * 100, 0]) for i in [1, 2, 3]})
        np.testing.assert_array_equal(result['trips'], [3])
        np.testing.assert_array_equal(result['missed'], [1])
        self.assertAlmostEqual(result['missed_delay'][0], expected_walk_penalty + .01)

    def test_unknown_routing_ids_are_rejected(self):
        bad = matrix([('o2', 'd1', 10)])
        with self.assertRaisesRegex(ValueError, 'Unknown routing origin'):
            runner.batch_totals(bad, bad, [1], {'o1': np.array([0, 0])}, {'d1': np.array([100, 0])})

    def test_duplicate_pairs_and_incomplete_matrices_are_rejected(self):
        good = matrix([('o1', 'd1', 10), ('o1', 'd2', 10)])
        xy, targets = {'o1': np.array([0, 0])}, {'d1': np.array([100, 0]), 'd2': np.array([200, 0])}
        duplicate = matrix([('o1', 'd1', 10), ('o1', 'd1', 10)])
        with self.assertRaisesRegex(ValueError, 'Duplicate routing pairs'):
            runner.batch_totals(duplicate, good, [1], xy, targets)
        with self.assertRaisesRegex(ValueError, 'Incomplete routing matrix'):
            runner.batch_totals(good.iloc[:1], good, [1], xy, targets)


class DurablePreparation(unittest.TestCase):
    def test_fingerprint_is_order_independent_but_scientific_changes_invalidate(self):
        base = {'date': '2026-09-22', 'speed': {'medium': 4.8, 'slow': 4.235}}
        reordered = {'speed': {'slow': 4.235, 'medium': 4.8}, 'date': '2026-09-22'}
        self.assertEqual(runner.fingerprint(base), runner.fingerprint(reordered))
        self.assertNotEqual(runner.fingerprint(base), runner.fingerprint({**base, 'date': '2026-09-23'}))

    def test_checkpoint_roundtrip_order_fingerprint_and_malformed_arrays(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'batch.npz'
            self.assertIsNone(runner.checkpoint(file, np.array([9, 3]), 'run-a'))
            values = dict(point_id=np.array([9, 3]), fingerprint=np.array('run-a'),
                          trips=np.array([4, 2]), missed=np.array([2, 0]),
                          missed_delay=np.array([9., 0.]), unreachable_slow=1)
            runner.save_npz(file, **values)
            result = runner.checkpoint(file, np.array([9, 3]), 'run-a')
            np.testing.assert_array_equal(result['missed_delay'], [9, 0])
            self.assertEqual(result['unreachable_slow'], 1)
            self.assertIsNone(runner.checkpoint(file, np.array([3, 9]), 'run-a'))
            self.assertIsNone(runner.checkpoint(file, np.array([9, 3]), 'different'))
            for change in [dict(trips=np.array([4])), dict(trips=np.array([-1, 2])),
                           dict(missed=np.array([5, 0])), dict(missed_delay=np.array([np.nan, 0.])),
                           dict(missed_delay=np.array([9., 1.])), dict(trips=np.array([4.5, 2])),
                           dict(missed=np.array([1.5, 0])), dict(unreachable_slow=-1), dict(unreachable_slow=.5)]:
                runner.save_npz(file, **{**values, **change})
                self.assertIsNone(runner.checkpoint(file, np.array([9, 3]), 'run-a'), change)
            file.write_bytes(b'incomplete write')
            self.assertIsNone(runner.checkpoint(file, np.array([9, 3]), 'run-a'))

    def test_spatial_sample_spans_region_and_is_stable(self):
        origins = gpd.GeoDataFrame({'id': np.arange(25)},
                                   geometry=[Point(x * 100, y * 100) for y in range(5) for x in range(5)], crs=3006)
        sample = runner.spatial_sample(origins, 5)
        self.assertEqual(sample.id.tolist(), [0, 4, 12, 20, 24])
        self.assertEqual(runner.spatial_sample(origins, 100).id.tolist(), list(range(25)))
        self.assertEqual(sample.id.tolist(), runner.spatial_sample(origins, 5).id.tolist())

    def test_partial_benchmark_resumes_completed_departures_and_cached_batches(self):
        origins = gpd.GeoDataFrame({'id': np.arange(4)}, geometry=[Point(i * 100, 0) for i in range(4)], crs=3006)
        destinations = gpd.GeoDataFrame({'id': [0, 1]}, geometry=[Point(0, 100), Point(100, 100)], crs=3006)
        called = []

        def travel_times(network, starts, ends, speed, departure):
            called.append((departure.strftime('%H:%M'), speed, starts.id.tolist()))
            return matrix([(a, b, 10 if speed == 4.8 else 15) for a in starts.id for b in ends.id])

        model = SimpleNamespace(prepare_gtfs=lambda original, prepared: prepared,
                                r5py=SimpleNamespace(TransportNetwork=lambda *args: object()),
                                travel_times=travel_times)
        original_import = runner.importlib.import_module
        original_path = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), original_path))

        def import_model(name, *args, **kwargs):
            return {'config': SimpleNamespace(), 'compute_delays': model}.get(name) or original_import(name, *args, **kwargs)

        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            run = {'fingerprint': 'fixture'}
            (output / 'benchmark.json').write_text(json.dumps({'fingerprint': 'fixture', 'originIds': [0, 1, 2, 3],
                'samples': [{'departure': runner.DEPARTURES[0], 'seconds': 17, 'routedPairs': 8, 'unreachableSlow': 0}],
                'peakRssMiB': 42, 'estimatedFullSeconds': 17}))
            # A crash after saving a batch but before extending benchmark.json must reuse that batch.
            runner.save_npz(output / 'benchmark-batches' / '0649' / '0.npz',
                            fingerprint=np.array('fixture'), point_id=np.arange(4),
                            trips=np.full(4, 2), missed=np.full(4, 2), missed_delay=np.full(4, 10.), unreachable_slow=0,
                            runtime_seconds=9.25)
            with patch.object(runner.importlib, 'import_module', side_effect=import_model), \
                 patch.object(runner.importlib.metadata, 'version', return_value='1.1.7'), \
                 patch.object(runner, 'memory_mb', return_value=50), \
                 patch.object(sys, 'argv', ['test']), patch('builtins.print'):
                runner.routing(output, output, run, origins, destinations, benchmark_only=True)
                report = json.loads((output / 'benchmark.json').read_text())
                self.assertEqual(len(report['samples']), 8)
                self.assertEqual(report['samples'][0]['seconds'], 17)
                self.assertEqual(report['samples'][1]['seconds'], 9.25)
                self.assertEqual([item['departure'] for item in report['samples']], runner.DEPARTURES)
                self.assertEqual({item[0] for item in called}, set(runner.DEPARTURES[2:]))
                self.assertEqual(len(called), 12)
                called.clear()
                runner.routing(output, output, run, origins, destinations, benchmark_only=True)
                self.assertEqual(called, [], 'A complete benchmark must not route again')


if __name__ == '__main__':
    unittest.main()
