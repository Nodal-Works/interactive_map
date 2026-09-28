// Run via test_dem_flow.py, which supplies independent Python reference results.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({
  window: {mrAsset:path=>path}, console, Audio: function () {},
  document: { readyState: 'loading', addEventListener() {} },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../animations/stormwater-flow.js'), 'utf8'), context);
const Flow = vm.runInContext('StormwaterFlowAnimation', context);
const f = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const a = new Flow({}, { width: f.dem.length * 10, height: f.dem[0].length * 10,
  getContext() { return {}; } });
a.dem = f.dem;
a.demHeight = f.dem.length;
a.demWidth = f.dem[0].length;
a.buildingMask = f.buildings;
a.waterMask = f.water;
a.cellSize = f.cellSize;
a.flowDir = a.computeD8FlowDirection();
a.flowAcc = a.computeFlowAccumulation();
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(a.flowDir), f.directions);
assert.deepEqual(Array.from(a.flowAcc, row => Array.from(row)), f.accumulation);
a.flowData = a.generateFlowData();
a.scaleFlowToScreen();
for (const point of a.flowData.start_points_screen) {
  assert.equal(a.isBlockedCell(a.screenToCell(point.x, point.y)), false);
}
// One-cell wall between two open cells: endpoints alone must not suffice.
a.dem = [[3, 2, 1]]; a.demHeight = 1; a.demWidth = 3;
a.canvas.width = 10; a.canvas.height = 30;
a.buildingMask = [[false, true, false]]; a.waterMask = [[false, false, false]];
assert.equal(a.crossesBarrier(5, 5, 5, 25), true);
assert.equal(a.crossesBarrier(5, 3, 5, 7), false);
console.log('Browser/Python parity, spawn exclusion, and particle wall collision passed');

// Equal rainfall must reach every eligible cell, regardless of accumulation.
// The only open cells are between the old five-cell sample positions.
a.dem = [[NaN, 3, 2, 1, 0, 3, 3, 3]];
a.demHeight = 1; a.demWidth = 8;
a.canvas.width = 100; a.canvas.height = 800;
a.buildingMask = [[false, false, true, false, false, true, true, true]];
a.waterMask = [[false, false, false, false, true, false, false, false]];
a.flowDir = [[0, 0, 0, 0, 0, 0, 0, 0]];
a.flowAcc = [[0, 1, 0, 10000, 1, 0, 0, 0]];
a.flowData = a.generateFlowData();
a.scaleFlowToScreen();
assert.deepEqual(Array.from(a.spawnCells), [1, 3]);
let seed = 42;
context.seededRandom = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
vm.runInContext('Math.random = seededRandom', context);
const births = [0, 0];
for (let i = 0; i < 20000; i++) {
  const p = a.createParticle();
  assert.ok(p, 'Rainfall should not be rejected near building edges');
  const cell = a.screenToCell(p.x, p.y);
  assert.equal(a.isBlockedCell(cell), false);
  births[cell.col === 1 ? 0 : 1]++;
}
assert.ok(Math.abs(births[0] / 20000 - .5) < .02, `Rainfall biased by accumulation: ${births}`);
console.log(`Uniform rain in narrow passages passed: ${births.join(' / ')} births despite 1:10000 accumulation`);

// Calibrated DEM coordinates preserve collisions and rainfall under pan,
// rotation and scale, independently of the legacy rotated export format.
const {affine}=require('../table-layout.js');
for(const angle of [0,.4,Math.PI/2])for(const scale of [.5,2]){
  const project=(x,y)=>({x:230+scale*(x*Math.cos(angle)-y*Math.sin(angle)),y:-180+scale*(x*Math.sin(angle)+y*Math.cos(angle))});
  a.demTransform=affine([[0,0],[800,0],[800,100],[0,100]].map(p=>project(...p)),8,1);
  a.scaleFlowToScreen();
  for(const point of a.flowData.start_points_screen)assert.equal(a.isBlockedCell(a.screenToCell(point.x,point.y)),false);
  for(let i=0;i<200;i++){
    const p=a.createParticle();assert.equal(a.isBlockedCell(a.screenToCell(p.x,p.y)),false);
  }
  const from=a.cellToScreen(.5,1.5),to=a.cellToScreen(.5,3.5);
  assert.equal(a.crossesBarrier(from.x,from.y,to.x,to.y),true);
}
console.log('PASS calibrated DEM debug points, rainfall and barriers under pan/rotation/scale');
