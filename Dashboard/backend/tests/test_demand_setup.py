import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from app import main

class DemandSetupTests(unittest.TestCase):
    def test_portable_paths_and_missing_files_are_aggregated(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(main,'DEMAND_DIR',Path(directory).resolve()):
            names=['07.01_Fysik_origo_2022.csv','07.18 Idelära/electricity_2022.csv']
            definition={'buildings':[{'demand':{'csv_path':'media/ecom/energy_data/'+n}} for n in names]}
            with self.assertRaises(main.HTTPException) as caught:main.local_demand_paths(definition)
            self.assertEqual(caught.exception.status_code,503)
            for name in names:self.assertIn(name,caught.exception.detail.replace('\\','/'))
            for name in names:
                p=Path(directory)/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('fixture')
            self.assertEqual(len(main.local_demand_paths(definition)['buildings']),2)
            self.assertEqual(main.demand_path('media\\ecom\\energy_data\\07.01_Fysik_origo_2022.csv'),Path(directory)/names[0])
            with self.assertRaises(main.HTTPException):main.demand_path('media/ecom/energy_data/../../secret.csv')

if __name__=='__main__':unittest.main()
