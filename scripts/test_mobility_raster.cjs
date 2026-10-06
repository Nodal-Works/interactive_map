const assert=require('node:assert/strict');
const raster=require('../animations/mobility-raster.js'),core=require('../animations/mobility-core.js');
const polygon=(west,east)=>({geometry:{type:'Polygon',coordinates:[[[west,57.68],[east,57.68],[east,57.69],[west,57.69],[west,57.68]]]},properties:{values:[0,null]}});
const features=[polygon(11.95,11.96),polygon(11.96,11.97)],original=JSON.stringify(features);
const display=core.displayCells({features});
assert.equal(JSON.stringify(features),original);assert.equal(display.features[0].properties,features[0].properties);
for(const [x,y]of display.features[0].geometry.coordinates[0]){assert.ok(x>11.95&&x<11.96);assert.ok(y>57.68&&y<57.69);}
const plan=raster.geometry(features,512);
assert.ok(plan.width<=512&&plan.height<=512);
assert.equal(plan.polygons.length,2);
for(const parts of plan.polygons)for(const rings of parts)for(const ring of rings)for(const [x,y]of ring){assert.ok(x>=0&&x<=plan.width);assert.ok(y>=0&&y<=plan.height);}
assert.ok(Math.abs(plan.polygons[0][0][0][1][0]-plan.polygons[1][0][0][0][0])<1e-8,'Shared cell edges project identically');
assert.ok(Math.abs(plan.coordinates[0][0]-11.95)<1e-8);assert.ok(Math.abs(plan.coordinates[0][1]-57.69)<1e-8);
assert.equal(JSON.stringify(features),original,'Display projection cannot modify geographic research data');
assert.equal(raster.geometry([]),null);
assert.equal(raster.colour(null,[0,10],['#000000','#ffffff']),null);
assert.equal(raster.colour(NaN,[0,10],['#000000','#ffffff']),null);
assert.equal(raster.colour(0,[0,10],['#000000','#ffffff']),'rgb(0,0,0)','Zero is visible, not missing');
assert.equal(raster.colour(5,[0,10],['#000000','#ffffff']),'rgb(128,128,128)');
assert.equal(raster.colour(50,[0,10],['#000000','#ffffff']),'rgb(255,255,255)');
const custom={bins:[0,1],colors:['#000000','#ffffff']};assert.deepEqual(core.palette('synthpop',custom),custom.colors,'Unknown research scales retain their own legend');
const local=core.story({key:'synthpop',statistics:{localRoutedTrips:1018,localRoutedResidents:1006,qualifyingTrips:175}});
assert.equal(local.metric,'17%');assert.ok(local.detail.includes('1,018 trips'));assert.ok(local.detail.includes('1,006 synthetic residents'));assert.ok(local.legendTitle.includes('all healthcare trips'));
assert.equal(core.story({key:'synthpop',statistics:{localRoutedTrips:0,qualifyingTrips:0}}).metric,'—');
const city=core.story({key:'slow_walkers',departure:1,departures:['06:25','06:49'],maximumDistrict:{name:'Local',value:14.7},completedDepartures:8});
assert.equal(city.metric,'14.7 min');assert.equal(city.view,'Departure 06:49');assert.ok(city.detail.includes('inside the table only'));assert.ok(city.legendTitle.includes('missed connections only'));
console.log('PASS mobility display: shared edges, geographic registration, fixed colour scale, missing/zero separation and scoped story statistics');
