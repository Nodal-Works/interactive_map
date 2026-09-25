const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
require('../table-layout.js');
const source=fs.readFileSync('main.js','utf8'),profile=JSON.parse(fs.readFileSync('profiles/universeum.json'));
const original={center:{lng:12,lat:58},zoom:13,bearing:0,fitToTable:true,tableFlip:false};
const config={location:{id:'universeum'},table:{screenWidth:111.93,screenHeight:62.96,...profile.table},calibration:{fallback:original,path:'none'},
 area:{corners:[[11.9344054585786,57.68310112498583],[12.00030509100461,57.68311812110051],[12.0003054870228,57.73018181877855],[11.934320314774519,57.73016479189264]]}};
let camera={...original},messages=[],store=new Map();
const context={window:{APP_CONFIG:config,MR_TABLE,dispatchEvent(){},getTableLayout:()=>({w:960,h:720,mapLeft:100,mapTop:0})},
 Event:class{},console,XMLHttpRequest:class{open(){}send(){this.status=404;}},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
 document:{getElementById:()=>({style:{}})},showToast(){},showOverlay(){},clipTableLayers(){},setTimeout(){},
 map:{getContainer:()=>({getBoundingClientRect:()=>({left:60,top:0,width:1160,height:720})}),getCenter:()=>camera.center,getZoom:()=>camera.zoom,getBearing:()=>camera.bearing,
 jumpTo:v=>camera={...camera,...v},flyTo:v=>camera={...camera,...v},panBy:()=>{},zoomTo:z=>camera.zoom=z,rotateTo:b=>camera.bearing=b},
 controllerChannel:{postMessage:data=>messages.push(data)},CONTROLLER_DEBUG:false};
vm.createContext(context);vm.runInContext(fs.readFileSync('calibration-config.js','utf8'),context);
vm.runInContext('let autoTableFit=true,tableFlip=false,fittingTable=false,tableCenter,initialZoom,initialBearing;',context);
vm.runInContext(source.slice(source.indexOf('function fitTableCamera()'),source.indexOf('if (autoTableFit) fitTableCamera();')),context);
vm.runInContext(source.slice(source.indexOf('controllerChannel.onmessage ='),source.indexOf('// Broadcast state changes to controller')),context);
const send=(action,extra={})=>context.controllerChannel.onmessage({data:{type:'calibrate_action',action,...extra}});
send('fit_table',{dimensions:config.table});assert.ok(Math.abs(camera.bearing-90)<.2);
send('flip_table',{dimensions:config.table});assert.ok(Math.abs(camera.bearing+90)<.2);
send('save_calibration',{name:'Test',dimensions:config.table});
const saved=messages.find(m=>m.type==='calibration_saved').calibration;
assert.equal(saved.fitToTable,true);assert.equal(saved.tableFlip,true);assert.equal(saved.dimensions.columns,8);
send('pan_left');assert.equal(vm.runInContext('autoTableFit',context),false);
send('load_calibration',{calibration:{id:'old',center:{lng:12,lat:58},zoom:15,bearing:20,dimensions:{tableWidth:100,tableHeight:60}}});
assert.equal(camera.zoom,15);assert.equal(context.window.MR_CALIBRATION.dimensions.layoutMode,'legacy');
assert.equal(MR_TABLE.grid(context.window.MR_CALIBRATION.dimensions).columns,5);
send('load_calibration',{calibration:saved});assert.ok(Math.abs(camera.bearing+90)<.2);
assert.equal(context.window.MR_CALIBRATION.dimensions.layoutMode,'preview');
send('flip_table',{dimensions:config.table});assert.ok(Math.abs(camera.bearing-90)<.2);
context.controllerChannel.onmessage({data:{type:'reset_view'}});assert.ok(Math.abs(camera.bearing+90)<.2,'Reset restores saved orientation, not temporary flip');
send('load_calibration',{calibration:{...original,id:'original',dimensions:config.table}});assert.ok(Math.abs(camera.bearing-90)<.2);
console.log('PASS actual host calibration handler: fit/flip, save, manual navigation, legacy restore, automatic restore, reset orientation');
