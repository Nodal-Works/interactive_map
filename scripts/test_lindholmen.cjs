const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const context = {window:{}};
vm.createContext(context);
for (const file of ['app-config.js','session/js/shared.js','animations/introduction.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context);
const {APP_CONFIG:config,MR,createLindholmenIntroduction:createIntro}=context.window;
assert.equal(config.app.title,'KultVis Lindholmen');
assert.equal(config.calibration.fallback.zoom,16.2299329163497);
assert.equal(config.calibration.fallback.bearing,-2.58546386659737);
for(const id of ['epc-btn','thermal-comfort-btn','cultural-gravity-btn'])assert.ok(MR.LAYERS.some(l=>l.id===id),id);
for(const id of ['campus-demo-btn','fcc-demo-btn','ecom-energy-btn'])assert.ok(!MR.LAYERS.some(l=>l.id===id),id);
assert.ok(MR.validControl({type:'cultural_gravity_control',action:'advance'}));
assert.ok(!MR.validControl({type:'cultural_gravity_control',action:'set_sites'}));
const events=[],scheduled=[];
const map={jumpTo:view=>events.push(['jump',view]),once:(name,fn)=>events.push([name,fn]),flyTo:view=>events.push(['fly',view])};
const intro=createIntro(map,config.calibration.fallback,(fn,ms)=>scheduled.push([fn,ms]));
intro.start();intro.start();assert.equal(events.length,2);
assert.equal(events[0][1].zoom,config.calibration.fallback.zoom-2);
assert.equal(events[1][0],'click');events[1][1]();assert.equal(scheduled[0][1],900);
scheduled[0][0]();const fly=events[2][1];assert.equal(fly.duration,6500);assert.equal(fly.zoom,config.calibration.fallback.zoom);assert.equal(fly.easing(.5),.5);assert.equal(fly.easing(1),1);
const base=JSON.parse(fs.readFileSync('media/building-footprints.geojson'));
const epc=JSON.parse(fs.readFileSync('media/building-footprints-epc.geojson'));
assert.equal(epc.features.length,458);assert.deepEqual(epc.features.map(f=>f.geometry),base.features.map(f=>f.geometry));
assert.ok(epc.features.some(f=>f.properties.energy_class));
assert.ok(epc.features.some(f=>!f.properties.energy_class));
// Exercise the actual Cultural Gravity lifecycle and remote handlers with a canvas stub.
const messages=[],callbacks={},button={classList:{toggle(){}},addEventListener:(event,fn)=>callbacks[event]=fn};
const draw=new Proxy({},{get:()=>()=>({addColorStop(){}})});
const canvas={style:{},getContext:()=>draw,getBoundingClientRect:()=>({left:0,top:0})};
const cultural={console:{log(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval:fn=>{callbacks.init=fn;return 1;},clearInterval(){},
  document:{readyState:'complete',createElement:()=>canvas,body:{appendChild(){}},getElementById:id=>id==='cultural-gravity-btn'?button:{getBoundingClientRect:()=>({left:0,top:0})}},
  window:{computeOverlayPixelSize:()=>({w:100,h:60}),addEventListener(){},map:{getCenter:()=>({lat:57.708}),getZoom:()=>16,project:()=>({x:0,y:0})}},
  BroadcastChannel:class{constructor(){callbacks.channel=this;}postMessage(m){messages.push(m);}}};
vm.runInNewContext(fs.readFileSync('animations/cultural-gravity.js','utf8'),cultural);callbacks.init();
callbacks.click();assert.equal(cultural.window.culturalGravityAnimation.isActive(),true);
assert.ok(messages.some(m=>m.type==='animation_state'&&m.isActive));
callbacks.channel.onmessage({data:{type:'cultural_gravity_control',action:'advance'}});
assert.equal(cultural.window.culturalGravityAnimation.getState().sequenceStage,1);
cultural.window.culturalGravityAnimation.stop();assert.equal(messages.filter(m=>m.type==='animation_state').at(-1).isActive,false);
console.log('PASS Lindholmen layer availability, introduction timing, EPC geometry, Cultural Gravity lifecycle and remote advance');
