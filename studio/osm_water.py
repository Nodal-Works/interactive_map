"""Convert OSM water polygons, joining split relation rings and retaining islands."""
def water_features(data):
    from shapely.geometry import LineString, Polygon, mapping
    from shapely.ops import polygonize, unary_union
    from shapely import make_valid
    nodes={item['id']:(item['lon'],item['lat']) for item in data['elements'] if item['type']=='node'}
    ways={item['id']:item for item in data['elements'] if item['type']=='way'}
    def is_water(tags):
        return tags.get('natural')=='water' or tags.get('waterway') in ('riverbank','dock') or tags.get('landuse')=='reservoir' or bool(tags.get('water'))
    def coordinates(way):
        if any(key not in nodes for key in way.get('nodes',[])):raise ValueError('Incomplete OSM water geometry')
        return [nodes[key] for key in way.get('nodes',[])]
    features=[]; used=set()
    def append(geometry,item):
        geometry=make_valid(geometry)
        if geometry.is_empty:return
        if geometry.geom_type not in ('Polygon','MultiPolygon'):raise ValueError('Invalid OSM water polygon')
        tags=item.get('tags',{})
        features.append({'type':'Feature','geometry':mapping(geometry),'properties':{'osm_id':str(item['id']),'water_type':tags.get('water',tags.get('natural','water')),'name':tags.get('name',''),'source':'OpenStreetMap contributors'}})
    for item in data['elements']:
        if item['type']!='relation' or not is_water(item.get('tags',{})):continue
        rings={'outer':[],'inner':[]}
        for member in item.get('members',[]):
            if member['type']!='way':continue
            role=member.get('role') or 'outer'
            if role not in rings:continue
            if member['ref'] not in ways:raise ValueError('Incomplete OSM water relation')
            used.add(member['ref']);coords=coordinates(ways[member['ref']])
            if len(coords)>1:rings[role].append(LineString(coords))
        outer=unary_union(list(polygonize(rings['outer'])))
        inner=unary_union(list(polygonize(rings['inner'])))
        if outer.is_empty and rings['outer']:raise ValueError('Unclosed OSM water relation')
        append(outer.difference(inner),item)
    for key,item in ways.items():
        if key in used or not is_water(item.get('tags',{})):continue
        coords=coordinates(item)
        if len(coords)>=4 and coords[0]==coords[-1]:append(Polygon(coords),item)
    return features
