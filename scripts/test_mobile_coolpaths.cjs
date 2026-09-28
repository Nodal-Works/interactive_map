const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {project}=require('../session/js/phone-state.js');
class Element {
 constructor(tag){this.tag=tag;this.attrs={};this.children=[];}
 setAttribute(k,v){this.attrs[k]=String(v);}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 dispatchEvent(){}
}
const sandbox={window:{},document:{createElementNS:(_,tag)=>new Element(tag)},CustomEvent:class{},console};
vm.runInNewContext(fs.readFileSync('session/js/map.js','utf8'),sandbox);
const {CompanionMap,thermalHint}=sandbox.window.MR_MAP;
const view=Object.create(CompanionMap.prototype);
Object.assign(view,{svg:new Element('svg'),element:new Element('div'),identity:()=>({id:'phone'}),map:{project:c=>({x:c[0]*10,y:c[1]*10})},desktop:false,didFit:true,layer:'thermal-comfort-btn',lastInput:{layer:'thermal-comfort-btn',coordinate:[1,1]}});
const base={participants:[],layers:{'thermal-comfort-btn':true},slots:[],table:{corners:[[0,0],[1,0],[1,1],[0,1]],revision:1}};
const A=[11.934,57.706],B=[11.943,57.71],C=[11.94,57.708];
const markers=()=>view.svg.children.filter(n=>n.attrs['data-coolpaths-point']);
const labels=()=>markers().map(n=>n.attrs['data-coolpaths-point']);
function state(thermal){const projected=project({...base,thermal},{layer:'thermal-comfort-btn',tab:'map'});view.setState(projected);return projected;}
let phone=state({mode:'route',origin:A,destination:null,phase:'choose-destination'});
assert.deepEqual(labels(),['A']);assert.match(thermalHint(phone.thermal),/destination B/);
phone=state({mode:'route',origin:A,destination:B,phase:'route-ready',route:{payload:'BIG'.repeat(100000)},inspection:{payload:'PRIVATE'},catalog:{},tour:{image:'data:image/large'}});
assert.deepEqual(labels(),['A','B'],'Both snapped endpoints survive the second tap');
assert.equal(markers()[0].children[1].attrs.cx,String(A[0]*10));
assert.equal(markers()[1].children[1].attrs.cy,String(B[1]*10));
assert.ok(!JSON.stringify(phone).includes('BIG'));assert.ok(!JSON.stringify(phone).includes('PRIVATE'));assert.ok(!JSON.stringify(phone).includes('data:image'));
assert.ok(JSON.stringify(phone).length<1000,'Endpoint state stays compact');
view.lastInput=null;view.setState(phone);assert.deepEqual(labels(),['A','B'],'Reconnect needs no local tap history');
view.map.project=c=>({x:c[0]*20,y:c[1]*20});view.render();assert.equal(markers()[1].children[1].attrs.cx,String(B[0]*20),'Markers follow map movement');
state({mode:'route',origin:null,destination:null});assert.deepEqual(labels(),[],'Clear removes both endpoints and stale last-tap marker');
state({mode:'route',origin:C,destination:null});assert.deepEqual(labels(),['A'],'A new route removes old destination');
state({mode:'inspect',origin:A,destination:B,inspectionPoint:C});assert.deepEqual(labels(),['Inspect'],'Inspection remains a single point');
assert.match(thermalHint({mode:'inspect'}),/inspect/);
assert.match(thermalHint({phase:'snapping',origin:A}),/destination B/);
assert.match(thermalHint({phase:'routing'}),/Finding routes/);
phone=state({mode:'route',origin:A,destination:B});view.layer='isovist-btn';view.render();assert.deepEqual(labels(),[],'No endpoints leak to another layer');
view.layer='thermal-comfort-btn';view.desktop=true;view.render();assert.deepEqual(labels(),[],'Desktop keeps its own route renderer');view.desktop=false;
view.setState({...phone,layers:{'thermal-comfort-btn':false}});assert.deepEqual(labels(),[],'Disabled layer hides its inputs');
state({mode:'route',origin:[Infinity,1],destination:[181,1],inspectionPoint:['x',1]});assert.deepEqual(labels(),[],'Malformed coordinates are discarded');
const other=project({...base,thermal:{origin:A,destination:B}},{layer:'sun-study-btn',tab:'map'});assert.equal(other.thermal,undefined);
console.log('PASS mobile Cool Paths: A/B, snapped coordinates, reconnect, clear, new route, inspect, layer isolation and bounded input-only state');
