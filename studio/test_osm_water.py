import unittest
from .osm_water import water_features

class WaterGeometry(unittest.TestCase):
    def test_split_outer_and_island(self):
        from shapely.geometry import shape
        coords=[(0,0),(4,0),(4,4),(0,4),(1,1),(2,1),(2,2),(1,2)]
        elements=[{'type':'node','id':i+1,'lon':x,'lat':y} for i,(x,y) in enumerate(coords)]
        elements += [{'type':'way','id':11,'nodes':[1,2,3]}, {'type':'way','id':12,'nodes':[3,4,1]}, {'type':'way','id':13,'nodes':[5,6,7,8,5]}]
        elements += [{'type':'relation','id':20,'tags':{'natural':'water'},'members':[{'type':'way','ref':key,'role':role} for key,role in [(11,'outer'),(12,'outer'),(13,'inner')]]}]
        result=water_features({'elements':elements})
        self.assertEqual(len(result),1);self.assertEqual(shape(result[0]['geometry']).area,15)
    def test_do_not_close_open_ways_or_treat_wetland_as_water(self):
        nodes=[{'type':'node','id':i,'lon':i%2,'lat':i//2} for i in range(4)]
        ways=[{'type':'way','id':5,'nodes':[0,1,2,3],'tags':{'natural':'water'}},{'type':'way','id':6,'nodes':[0,1,3,2,0],'tags':{'natural':'wetland'}}]
        self.assertEqual(water_features({'elements':nodes+ways}),[])

if __name__=='__main__':unittest.main()
