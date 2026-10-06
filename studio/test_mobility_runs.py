"""Uniform rerouting acceptance, provenance and paired synthetic-trip checks."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, box, shape

from .mobility import NEW_DEPARTURES, PINNED_SOURCE_SHA256, bounded_cells, download, footprint, prepare, write


class UniformInterpolation(unittest.TestCase):
    def test_nearest_valid_neighbours_and_every_distance_is_bounded(self):
        points = gpd.GeoDataFrame(geometry=[Point(25, 25), Point(35, 25), Point(45, 25),
                                          Point(55, 25), Point(165, 25), Point(185, 25)], crs=3006)
        # Missing nearby origins do not consume the four valid-neighbour slots.
        values = np.array([[np.nan, 0], [np.nan, np.nan], [np.nan, np.nan],
                           [np.nan, np.nan], [10, 20], [1000, 1000]])
        cells, result = bounded_cells(points, values, box(0, 0, 50, 50))
        self.assertEqual(len(cells), 1)
        self.assertEqual(result[0, 0], 10)  # 140 m away, while 160 m is excluded.
        self.assertLess(result[0, 1], .01)

    def test_missing_display_cells_are_not_fabricated(self):
        points = gpd.GeoDataFrame(geometry=[Point(25, 25)], crs=3006)
        cells, result = bounded_cells(points, np.array([[np.nan, np.nan]]), box(0, 0, 50, 50))
        self.assertEqual(cells, [])
        self.assertEqual(result.shape, (0, 2))
        cells, result = bounded_cells(points, np.array([[0, 0]]), box(0, 0, 50, 50))
        self.assertEqual(len(cells), 1)
        np.testing.assert_equal(result, [[0, 0]])


class LocalRun(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source, self.output = self.root/'run', self.root/'assets'
        self.source.mkdir()
        (self.source/'data').mkdir()
        (self.source/'output').mkdir()
        self.x, self.y = 300000, 6390000
        self.manifest = {'recipe': {'sourceBounds': [self.x, self.y, self.x+400, self.y+200], 'sourceCrs': 'EPSG:3006'}}
        self.districts = gpd.GeoDataFrame({'district': ['west', 'east'], 'regsonamn': ['West', 'East']},
            geometry=[box(self.x, self.y, self.x+200, self.y+200),
                      box(self.x+200, self.y, self.x+400, self.y+200)], crs=3006)
        self.districts.to_file(self.source/'data/regso_goteborg.gpkg')
        self.points = gpd.GeoDataFrame({'id': [0, 1, 2, 3], 'district': ['west', 'west', 'east', 'east']},
            geometry=[Point(self.x+50, self.y+50), Point(self.x+150, self.y+50),
                      Point(self.x+250, self.y+50), Point(self.x+350, self.y+50)], crs=3006)
        self.points.to_file(self.source/'origins.gpkg')
        self.trips = np.tile([10, 10, 10, 0], (8, 1))
        self.missed = np.tile([1, 3, 0, 0], (8, 1))
        self.delay = np.tile([2, 30, 0, 0], (8, 1)).astype(float)
        self.delay[0, :2] = [10, 60]
        self._npz()
        homes = gpd.GeoSeries([Point(self.x+50, self.y+50), Point(self.x+50, self.y+60),
            Point(self.x+250, self.y+50), Point(self.x+250, self.y+60),
            Point(self.x+150, self.y+50), Point(self.x+150, self.y+60)], crs=3006).to_crs(4326)
        self.csv = pd.DataFrame({'trip_id': ['trip-a', 'trip-b', 'trip-c', 'trip-d', 'trip-e', 'trip-f'],
            'resident_id': ['resident-a', 'resident-a', 'resident-b', 'resident-c', 'resident-d', 'resident-e'],
            'lon': homes.x, 'lat': homes.y, 'age': [75]*6, 'hour': [7, 7, 8, 9, 12, 15], 'minute': [0]*6,
            'medium_min': [3, 3, 3, np.nan, 3, 3], 'slow_min': [5, 3.2, 6, np.nan, 3.5, 4],
            'delay_min': [2, .2, 3, np.nan, .5, 1], 'route_status': ['routed', 'routed', 'routed', 'missing', 'routed', 'routed']})
        self.csv.to_csv(self.source/'synthetic.csv', index=False)
        home = [self.csv.loc[0, 'lon'], self.csv.loc[0, 'lat']]
        middle, end = [home[0]+.0001, home[1]], [home[0]+.0002, home[1]]
        self.legs = gpd.GeoDataFrame({'trip_id': ['trip-a']*4, 'walker': ['medium']*2+['slow']*2,
            'segment': [0, 1, 0, 1], 'mode': ['walk', 'transit']*2,
            'start_s': [0, 120, 0, 240], 'travel_time_s': [60]*4},
            geometry=[LineString([home, middle]), LineString([middle, end])]*2, crs=4326)
        self.legs.to_file(self.source/'legs.gpkg')
        self.run = {'schemaVersion': 2, 'routingDate': '2026-09-22', 'completedDepartures': 8, 'plannedDepartures': 8,
            'originSpacingMetres': 100, 'displaySpacingMetres': 50,
            'interpolation': {'neighbours': 4, 'maximumMetres': 150}, 'recipe': self.manifest['recipe'],
            'dependencies': {'r5py': '1.1.7', 'java': '21'},
            'source': {'commit': '530a93530baf450041075a9c0dd28b6f4787d890', 'path': str(self.source),
                       'upstreamSha256': {'data/regso_goteborg.gpkg': self._digest('data/regso_goteborg.gpkg')}}}
        self._metadata()

    def tearDown(self):
        self.temporary.cleanup()

    def _digest(self, relative):
        return hashlib.sha256((self.source/relative).read_bytes()).hexdigest()

    def _metadata(self):
        self.run['outputSha256'] = {p: self._digest(p) for p in
            ['origins.gpkg', 'output/delays_by_departure.npz', 'synthetic.csv', 'legs.gpkg']}
        write(self.source/'run.json', self.run)

    def _npz(self, point_ids=None, done=8, departures=None):
        np.savez(self.source/'output/delays_by_departure.npz', point_id=point_ids if point_ids is not None else np.arange(4),
            done=done, departures=departures if departures is not None else NEW_DEPARTURES,
            trips=self.trips, missed=self.missed, missed_delay=self.delay)

    def _read(self, name):
        return json.loads((self.output/name).read_text())

    def test_complete_run_weighted_values_scope_cohort_and_waiting(self):
        result = prepare(self.source, self.output, self.manifest)
        self.assertEqual(result['completedDepartures'], 8)
        self.assertEqual(result['routingOrigins'], 4)
        self.assertEqual(result['syntheticTrips'], 5)
        self.assertEqual(result['journeys'], 1)
        self.assertEqual(result['failedPairs'], 2)
        grid = self._read('slow-walkers.geojson')
        self.assertEqual(grid['metadata']['legendMode'], 'continuous')
        self.assertEqual(grid['metadata']['departures'], NEW_DEPARTURES)
        self.assertEqual(grid['metadata']['districtScope'], 'Origins within the table area')
        self.assertEqual(grid['metadata']['missingOriginSamples'], 8)
        self.assertTrue(all(len(f['properties']['values']) == 9 for f in grid['features']))
        areas = {f['properties']['id']: f['properties'] for f in self._read('districts.geojson')['features']}
        # (8*2+8 + 8*30+30) / (8+24) = 294 / 32, not the mean of origin averages.
        self.assertEqual(areas['west']['values'][0], 9.188)
        self.assertEqual(areas['west']['values'][1], 17.5)
        self.assertEqual(areas['east']['values'][0], 0)
        self.assertEqual(areas['east']['origins'], 2)
        synthetic = self._read('synthpop.geojson')
        stats = synthetic['metadata']
        self.assertEqual((stats['localTrips'], stats['localRoutedTrips'], stats['localResidents'], stats['localRoutedResidents']), (6, 5, 5, 4))
        self.assertEqual((stats['qualifyingTrips'], stats['journeyTrips'], stats['failedPairs']), (2, 1, 2))
        self.assertEqual(sum(f['properties']['trips'] for f in synthetic['features']), 5)
        # Four routed western trips occupy one 200 m cell, including zero/low losses.
        self.assertAlmostEqual(min(f['properties']['delay'] for f in synthetic['features']), .925)
        journeys = self._read('journeys.json')
        self.assertEqual({t['id'] for t in journeys['tracks']}, {'trip-a'})
        self.assertEqual(journeys['duration'], 300)
        medium = next(t for t in journeys['tracks'] if t['walker'] == 'medium')
        self.assertEqual(medium['legs'][1]['start'], 120)
        self.assertEqual(medium['legs'][0]['duration'], 60)
        self.assertEqual(medium['finish'], 180)
        manifest = self._read('manifest.json')
        self.assertEqual(manifest['schemaVersion'], 2)
        self.assertEqual(manifest['source']['upstreamSha256'], self.run['source']['upstreamSha256'])
        self.assertEqual(manifest['source']['outputSha256'], self.run['outputSha256'])
        self.assertNotIn('path', manifest['source'])
        visible = footprint(self.manifest)
        for name in ['synthpop.geojson', 'slow-walkers.geojson', 'districts.geojson']:
            projected = gpd.GeoSeries([shape(f['geometry']) for f in self._read(name)['features']], crs=4326).to_crs(3006)
            self.assertTrue(all(g.difference(visible.buffer(.05)).area < 1e-6 for g in projected), name)

    def test_incomplete_departures_point_order_and_tampering_are_rejected(self):
        for kind in ['metadata', 'point-order', 'npz-done', 'departures', 'checksum']:
            with self.subTest(kind=kind):
                original = copy.deepcopy(self.run)
                self._npz()
                if kind == 'metadata':
                    self.run['completedDepartures'] = 7
                elif kind == 'point-order':
                    self._npz(point_ids=np.array([1, 0, 2, 3]))
                elif kind == 'npz-done':
                    self._npz(done=7)
                elif kind == 'departures':
                    self._npz(departures=NEW_DEPARTURES[:-1]+['09:31'])
                self._metadata()
                if kind == 'checksum':
                    with (self.source/'synthetic.csv').open('a') as stream:
                        stream.write('\n')
                with self.assertRaises(ValueError):
                    prepare(self.source, self.output, self.manifest)
                self.run = original
                self.csv.to_csv(self.source/'synthetic.csv', index=False)

    def test_wrong_crs_wrong_district_and_outside_origins_are_rejected(self):
        for kind in ['crs', 'district', 'outside', 'grid', 'ids']:
            with self.subTest(kind=kind):
                points = self.points.copy()
                if kind == 'crs':
                    points = points.to_crs(4326)
                elif kind == 'district':
                    points.loc[0, 'district'] = 'east'
                elif kind == 'outside':
                    points.loc[0, 'geometry'] = Point(self.x-50, self.y+50)
                elif kind == 'grid':
                    points.loc[0, 'geometry'] = Point(self.x+55, self.y+50)
                else:
                    points.loc[0, 'id'] = 1
                points.to_file(self.source/'origins.gpkg')
                self._metadata()
                with self.assertRaises(ValueError):
                    prepare(self.source, self.output, self.manifest)
        self.points.to_file(self.source/'origins.gpkg')

    def test_no_qualifying_journeys_is_a_valid_heatmap(self):
        csv = self.csv.copy()
        csv.loc[[0, 2], 'delay_min'] = .5
        csv.loc[[0, 2], 'slow_min'] = 3.5
        csv.to_csv(self.source/'synthetic.csv', index=False)
        self._metadata()
        result = prepare(self.source, self.output, self.manifest)
        self.assertEqual(result['journeys'], 0)
        self.assertGreater(result['heatmapCells'], 0)
        self.assertEqual(self._read('journeys.json')['duration'], 0)
        self.assertEqual(self._read('journeys.json')['tracks'], [])
        self.assertEqual(self._read('synthpop.geojson')['metadata']['qualifyingTrips'], 0)

    def test_invalid_pair_is_excluded_without_losing_heatmap(self):
        legs = self.legs.copy()
        legs.loc[1, 'start_s'] = 30  # Overlapping travel intervals.
        legs.to_file(self.source/'legs.gpkg')
        self._metadata()
        prepare(self.source, self.output, self.manifest)
        self.assertEqual(self._read('journeys.json')['tracks'], [])
        stats = self._read('synthpop.geojson')['metadata']
        self.assertEqual(stats['localRoutedTrips'], 5)
        self.assertEqual(stats['failedJourneyPairs'], 2)


class ImmutableDownload(unittest.TestCase):
    def test_download_uses_pinned_upstream_instead_of_active_asset_manifest(self):
        # A generated package may replace the active manifest with local checksums.
        # Correct cached upstream bytes should never require a network read.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            contents = b'pinned source'
            target = root/'input.txt'
            target.write_bytes(contents)
            checksum = hashlib.sha256(contents).hexdigest()
            with patch.dict(PINNED_SOURCE_SHA256, {'input.txt': checksum}, clear=True), \
                    patch('urllib.request.urlopen', side_effect=AssertionError('Cache should suffice')):
                self.assertEqual(download(root), root)


if __name__ == '__main__':
    unittest.main()
