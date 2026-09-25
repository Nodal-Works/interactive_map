const assert=require('node:assert/strict');
require('../table-layout.js');
const fs=require('node:fs'), vm=require('node:vm');
const profile=JSON.parse(fs.readFileSync('profiles/universeum.json'));
const corners=[[11.9344054585786,57.68310112498583],[12.00030509100461,57.68311812110051],[12.0003054870228,57.73018181877855],[11.934320314774519,57.73016479189264]];
const d={screenWidth:111.93,screenHeight:62.96,...profile.table};
assert.deepEqual(MR_TABLE.grid(d),{columns:8,rows:6});
assert.deepEqual(MR_TABLE.grid({tableWidth:100,tableHeight:60,tileSize:20}),{columns:5,rows:3});
assert.ok(Math.abs((profile.sourceBounds[3]-profile.sourceBounds[1])/8-655.2)<1e-8);
assert.ok(Math.abs((profile.sourceBounds[2]-profile.sourceBounds[0])/6-655.2)<1e-8);
function project(coord,camera,rect) {
 const p=MR_TABLE.mercator(coord),center=MR_TABLE.mercator([camera.center.lng,camera.center.lat]);
 const x=(p.x-center.x)*2**camera.zoom,y=(p.y-center.y)*2**camera.zoom,b=camera.bearing*Math.PI/180;
 return {x:rect.width/2+x*Math.cos(b)+y*Math.sin(b),y:rect.height/2-x*Math.sin(b)+y*Math.cos(b)};
}
for(const [width,height] of [[1280,720],[1920,1080],[720,1280],[2560,1440]]) {
 const r={left:0,top:0,width,height},t=MR_TABLE.rectangle(d,{width,height},r);
 assert.ok(t.w<=r.width && t.h<=height);
 assert.ok(Math.abs(t.w/t.h-4/3)<1e-12);
 const presentation=MR_TABLE.presentation(d,t);
 assert.ok(Math.abs(presentation.rail/t.w*d.tableWidth-7.5)<1e-12);
 assert.ok(t.left-presentation.rail>=-1e-8 && t.left+t.w+presentation.rail<=width+1e-8);
 assert.ok(Math.abs(t.w/8-t.h/6)<1e-10,'Tiles stay square');
 for(const flip of [false,true]) {
  const camera=MR_TABLE.fit(corners,t,r,flip),points=corners.map(p=>project(p,camera,r));
  for(const p of points){assert.ok(p.x>=t.mapLeft-1e-6&&p.x<=t.mapLeft+t.w+1e-6);assert.ok(p.y>=t.mapTop-1e-6&&p.y<=t.mapTop+t.h+1e-6);}
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  assert.ok((t.w-(Math.max(...xs)-Math.min(...xs)))/2<2);
  assert.ok((t.h-(Math.max(...ys)-Math.min(...ys)))/2<2);
  assert.equal(points[3].x<points[0].x,!flip,'North left, reversed after flip');
 }
}
const physical=MR_TABLE.rectangle({...d,layoutMode:'projector',screenWidth:400,screenHeight:300},{width:1600,height:1200},{left:60,top:0,width:1480,height:1200});
assert.equal(physical.w,1280);assert.equal(physical.h,960);
assert.throws(()=>MR_TABLE.fit([[0,0],[0,0],[0,0],[0,0]],{w:1,h:1},{width:1,height:1}));
for(const zoom of [10,13,16,19]) {
 const ppm=MR_TABLE.pixelsPerMetre(zoom,57.7),car=MR_TABLE.symbol(4.5,1.8,3,ppm);
 assert.ok(car.length>=3);assert.ok(Math.abs(car.length/car.width-2.5)<1e-12);
 assert.ok(Math.abs(MR_TABLE.pixelsPerMetre(zoom+1,57.7)/ppm-2)<1e-12);
}
function calibration(saved) {
 const config={location:{id:'universeum'},table:d,calibration:{path:'none',fallback:{center:{lng:12,lat:58},zoom:12,bearing:90,fitToTable:true}}};
 const context={window:{APP_CONFIG:config,dispatchEvent(){}},Event:class{},console,localStorage:{getItem:key=>key.includes('default_calibration')&&saved?JSON.stringify(saved):null},XMLHttpRequest:class{open(){}send(){this.status=404;}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('calibration-config.js','utf8'),context);return context.window.MR_CALIBRATION;
}
assert.equal(calibration().dimensions.layoutMode,'preview');
const old=calibration({center:{lng:12,lat:58},zoom:15,bearing:0,dimensions:{tableWidth:100,tableHeight:60}});
assert.equal(old.dimensions.layoutMode,'legacy');assert.equal(MR_TABLE.grid(old.dimensions).columns,5);assert.equal(old.current.fitToTable,undefined);
const saved={center:{lng:12,lat:58},zoom:13,bearing:90,fitToTable:true,tableFlip:true,dimensions:d};
assert.equal(calibration(saved).current.tableFlip,true);assert.equal(calibration(saved).dimensions.columns,8);
console.log('PASS table geometry: 48 cells, source fitting, flip, portrait/fullscreen, physical scale, symbol scale and legacy/automatic presets');
// Exercise the host adapter's actual table conversion and revision rejection.
const events={},mapEvents={};let layout={w:960,h:720,mapLeft:100,mapTop:0};
const context={window:{MR_CALIBRATION:{dimensions:d},getTableLayout:()=>layout,addEventListener:(key,fn)=>events[key]=fn,dispatchEvent(){}},
 MR:{LAYERS:[]},map:{unproject:([x,y])=>({toArray:()=>[x/100,y/100]}),getBearing:()=>90,on:(key,fn)=>mapEvents[key]=fn},
 BroadcastChannel:class{addEventListener(){}postMessage(){}},Event:class{},setTimeout(){}};
vm.createContext(context);vm.runInContext(fs.readFileSync('session/js/adapter.js','utf8'),context);
const adapter=context.window.MR_ADAPTER;
for(const [x,y] of [[0,0],[1,0],[1,1],[0,1],[.5,.5],[.23,.71]]){
 const p=adapter.coordinate({x,y,transform:0});
 assert.equal(p[0],(100+x*960)/100);assert.equal(p[1],y*720/100);
}
events.resize();assert.throws(()=>adapter.coordinate({x:.5,y:.5,transform:0}),/alignment changed/);
assert.equal(adapter.table().revision,1);mapEvents.moveend();assert.equal(adapter.table().revision,2);
assert.throws(()=>adapter.coordinate({x:1.1,y:0,transform:2}),/outside/);
console.log('PASS host phone coordinates: corners/interior, resize and camera revisions, stale/outside input rejection');
// Exercise the renderer's real geographic alignment method without WebGL.
require('../georeference.js');
const rasterCorners=[[11.930429335018315,57.73008443654797],[12.00018629376449,57.731757129594634],[12.004201347010623,57.68321055361768],[11.93453740058287,57.68154097854356]];
const bounds=[317234.43,6397389.39,321394.43,6402801.39];
const source=fs.readFileSync('animations/sun-study.js','utf8');
const method=source.slice(source.indexOf('  fitCameraToModel() {'),source.indexOf('  onResize() {'));
assert.ok(method.includes('fitCameraToModel()'));
for(const flip of [false,true]) {
 const rect={left:60,top:0,width:1160,height:720},target=MR_TABLE.rectangle(d,{width:1280,height:720},rect);
 const camera=MR_TABLE.fit(corners,target,rect,flip);
 for(const pan of [0,50]){
  const projectPoint=p=>{const q=project(p,camera,rect);return {x:q.x+pan,y:q.y-pan/2};};
  const sandbox={window:{innerWidth:1280,innerHeight:720,APP_CONFIG:{model:{alignment:'geographic',boundsSweref:bounds},raster:{corners:rasterCorners}},MR_GEO,
   map:{getBearing:()=>camera.bearing,getContainer:()=>({getBoundingClientRect:()=>rect}),project:projectPoint}}};
  vm.createContext(sandbox);const Renderer=vm.runInContext('(class {'+method+'})',sandbox),r=new Renderer();
  r.mesh={scale:{setScalar(v){this.value=v;}},rotation:{},position:{}};r.modelSize={x:4160,z:5412};r.scaleMultiplier=1;r.rotationOffset=0;r.offsetX=0;r.offsetZ=0;
  r.buildingsCenter={x:(bounds[0]+bounds[2])/2,z:-(bounds[1]+bounds[3])/2};
  r.renderer={domElement:{getBoundingClientRect:()=>rect}};r.camera={up:{set(){}},lookAt(){},updateProjectionMatrix(){}};r.updateSunPosition=()=>{};
  r.fitCameraToModel();
  const affine=MR_GEO.affine(rasterCorners,projectPoint);
  for(const [u,v] of [[0,0],[1,0],[1,1],[0,1],[.5,.5],[.23,.71]]){
   const x=(u-.5)*(bounds[2]-bounds[0]),z=(v-.5)*(bounds[3]-bounds[1]),theta=r.mesh.rotation.y,k=r.mesh.scale.value;
   const actual={x:580+r.mesh.position.x+k*(x*Math.cos(theta)+z*Math.sin(theta)),y:360+r.mesh.position.z+k*(-x*Math.sin(theta)+z*Math.cos(theta))};
   const expected=affine.forward(u,v);
   assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<2,'Model and raster agree within 2 CSS pixels');
  }
 }
}
console.log('PASS real 3D alignment method: model/raster corners and interior agree within 2 px after fit, flip and pan');
