const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('animations/ecom-energy.js', 'utf8');
const fn = source.slice(source.indexOf('    function reportEnergyFlow('), source.indexOf('    // Where the cars are this hour'));
function calculate(nodes, flows, hour = 0) {
    let result;
    const context = vm.createContext({ nodeData: {features: nodes.map(properties => ({properties}))}, flowData: {features: flows.map(properties => ({properties}))}, ecomChannel: {postMessage: e => result = e.reading} });
    vm.runInContext(fn + '\nreportEnergyFlow(' + hour + ');', context);
    return result;
}
const flow = (kind, target_kind, amount) => ({kind, target_kind, flow_hourly:[amount]});
const nodes = [{kind:'building', demand_hourly:[100]}, {kind:'battery'}];
let r = calculate(nodes, [flow('grid','building',60), flow('battery','building',10), flow('building','battery',20), flow('building','grid',5), flow('grid','battery',7), flow('grid','charge_point',5)]);
assert.equal(r.demand,105); assert.equal(r.direct,30, 'Roof consumption includes invisible internal links');
assert.equal(r.solar,55); assert.equal(r.gridToDemand,65); assert.equal(r.gridToBattery,7);
assert.equal(r.batteryIn,27); assert.equal(r.batteryOut,10);
assert.equal(r.direct+r.gridToDemand+r.batteryToDemand,r.demand);
r=calculate(nodes,[flow('grid','building',100),flow('grid','battery',8)]);
assert.equal(r.solar,0,'Grid charging at night is not solar'); assert.equal(r.direct,0);
r=calculate([{kind:'building',demand_hourly:[0]}],[]);
assert.equal(r.demand,0); assert.equal(r.solar,0); assert.equal(r.hasBattery,false);
const realNodes=JSON.parse(fs.readFileSync('media/ecom/ecom-nodes.geojson')).features.map(f=>f.properties);
const realFlows=JSON.parse(fs.readFileSync('media/ecom/ecom-flows.geojson')).features.map(f=>f.properties);
for(let hour=0;hour<24;hour++){
    r=calculate(realNodes,realFlows,hour);
    assert.ok(Math.abs(r.direct+r.gridToDemand+r.batteryToDemand-r.demand)<1, 'Export demand balance at hour '+hour);
    assert.ok(Number.isFinite(r.solar));
}
console.log('PASS: hourly solar routing, hidden rooftop supply, battery sources, EV demand, night, empty community and all 24 export hours');
