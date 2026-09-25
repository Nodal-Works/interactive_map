const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFrames}=require('../museum-runtime.js');
let callbacks=new Map(),serial=0;const frames=createFrames(fn=>{callbacks.set(++serial,fn);return serial;},id=>callbacks.delete(id),()=>0);
let ticks=0;function animate(now){ticks++;frames.request('birds',animate);}
frames.request('birds',animate);frames.request('birds',animate);frames.request('water',()=>{});
assert.equal(callbacks.size,1);const step=now=>{const batch=[...callbacks];callbacks.clear();for(const [,fn]of batch)fn(now);};
step(0);assert.equal(ticks,1);assert.equal(callbacks.size,1,'Scheduling within RAF must not create a second native loop');
step(16);assert.equal(ticks,2);assert.equal(callbacks.size,1);
for(const hz of [30,60,120]){frames.reset();let seconds=0;for(let i=0;i<=hz;i++)seconds+=frames.delta('time',i*1000/hz);assert.ok(Math.abs(seconds-1)<1e-8);}
assert.equal(frames.delta('time',100000),.05);frames.reset();assert.equal(frames.delta('time',100100),0);
const core=require('../animations/isovist-core.js');
const origin=[12,57],to=(x,y)=>[12+x/(111320*Math.cos(57*Math.PI/180)),57+y/110540];
const ring=(x0,y0,x1,y1)=>[to(x0,y0),to(x1,y0),to(x1,y1),to(x0,y1),to(x0,y0)];
const obstacle=(rings)=>({points:rings[0],rings,properties:{objekttyp:'test'},bbox:{minLng:Math.min(...rings[0].map(p=>p[0])),maxLng:Math.max(...rings[0].map(p=>p[0])),minLat:Math.min(...rings[0].map(p=>p[1])),maxLat:Math.max(...rings[0].map(p=>p[1]))}});
const building=obstacle([ring(-20,-20,20,20),ring(-10,-10,10,10)]),engine=core.create([building],[]);
assert.equal(engine.contains(origin),false,'Courtyard is free space');assert.equal(engine.contains(to(15,0)),true);
const courtyard=engine.calculate(origin,null,{humanFov:false,trees:false});assert.equal(courtyard.viewedBuildings.length,1);assert.equal(courtyard.viewedBuildings[0].geometry.coordinates.length,2);assert.equal(courtyard.stats.openRays,0);
const far=core.create([obstacle([ring(390,-20,410,20)])],[]).calculate(origin,to(100,0),{radius:500,fov:30});assert.equal(far.viewedBuildings.length,1,'Radius query at high latitude must include obstacles beyond .003 longitude');
const open=core.create([],[]).calculate(origin,null,{humanFov:false});assert.equal(open.stats.openAreaPercent,'100.0');
const tree={center:to(30,0),radius:5,properties:{},bbox:{minLng:to(25,0)[0],maxLng:to(35,0)[0],minLat:to(0,-5)[1],maxLat:to(0,5)[1]}};
assert.ok(core.create([],[tree]).calculate(origin,to(100,0),{fov:30}).stats.treeRays>0);
const events={},posts=[];const context={console,performance:{now:()=>0},setInterval:()=>1,clearInterval(){},setTimeout,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},BroadcastChannel:class{postMessage(m){posts.push(m);}close(){}},document:{hidden:false,addEventListener(){},getElementById:()=>null},requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){}};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('museum-runtime.js','utf8'),context);
(async()=>{let active=false,resolve,starts=0;const api={getEnabled:()=>active,enable:async current=>{starts++;await new Promise(r=>resolve=r);if(current())active=true;},disable:()=>active=false};const layers=context.MR_LAYERS;layers.register('test',api);const first=layers.setEnabled('test',true);assert.equal(layers.getState().test.status,'loading');await layers.setEnabled('test',true);assert.equal(starts,1);await layers.setEnabled('test',false);resolve();await first;assert.equal(active,false);assert.equal(layers.getState().test.status,'off');const second=layers.setEnabled('test',true);resolve();await second;assert.equal(layers.getState().test.status,'ready');await layers.setEnabled('test',true);assert.equal(starts,2);layers.dispose();assert.equal(active,false);console.log('PASS museum scheduler ownership, 30/60/120 timing, lifecycle cancellation/idempotence/dispose, courtyard holes, latitude/radius bounds, trees and open-space stats');})().catch(e=>{console.error(e);process.exitCode=1;});
