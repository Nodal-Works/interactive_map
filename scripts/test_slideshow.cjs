const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture() {
 const messages=[],layers=new Map(),sources=new Map(),frames=new Map(),events={},timers=new Map();let serial=0;
 const element={style:{},classList:{add(){},remove(){}},getContext:()=>({clearRect(){}}),addEventListener(){}};
 const slides=[{type:'geojson',media:'buildings.geojson',metadata:{title:'Buildings',style:{colorProperty:'use',colorMap:{housing:'#f00',school:'#0f0'},fillOpacity:.5}}},{type:'geojson',media:'roads.geojson',metadata:{style:{colorProperty:'use',colorMap:{path:'#00f'}}}}];
 const map={on(){},getLayer:id=>layers.get(id),getSource:id=>sources.get(id),removeLayer:id=>layers.delete(id),removeSource:id=>sources.delete(id),addSource:(id,data)=>sources.set(id,data),addLayer:l=>layers.set(l.id,l),setFilter:(id,v)=>{layers.get(id).filter=v;},setPaintProperty:(id,k,v)=>{layers.get(id).paint[k]=v;}};
 const context={console,map,AbortController,DOMException,HTMLVideoElement:class{},performance:{now:()=>0},
  document:{getElementById:()=>element,addEventListener:(name,fn)=>events[name]=fn},
  computeOverlayPixelSize:()=>({w:100,h:60}),showToast(){},
  requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),
  BroadcastChannel:class{postMessage(m){messages.push(m);}addEventListener(name,fn){events.message=fn;}},
  fetch:async url=>({ok:true,json:async()=>url.includes('config.json')?{slides,settings:{loop:true,autoAdvance:false}}:{features:[]}}),
  mrAsset:p=>p,addEventListener(){},MR_RASTER_SLIDES:{RasterSlides:class{clear(){} async show(){}}}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('animations/slideshow.js','utf8'),context);
 return {context,slides,layers,sources,messages,frames,timers,events,run:code=>vm.runInContext(code,context),state:()=>messages.filter(m=>m.type==='slideshow_update').at(-1)};
}
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
(async()=>{
 const f=fixture();await f.run('startSlideshow()');await flush();assert.equal(f.state().status,'ready');assert.equal(f.state().categoryIndex,-1);
 f.run("categoryControl('category_next')");assert.equal(f.state().category,'housing');
 f.run("categoryControl('category_next')");assert.equal(f.state().category,'school');
 f.run("categoryControl('category_next')");assert.equal(f.state().categoryIndex,1,'Clamped at final category');
 f.run("categoryControl('category_previous')");assert.equal(f.state().categoryIndex,0);
 f.run("categoryControl('show_all')");assert.equal(f.state().categoryIndex,1);
 f.run("categoryControl('auto_reveal')");assert.equal(f.state().autoReveal,true);assert.equal(f.state().categoryIndex,0);
 f.run("categoryControl('pause_reveal')");assert.equal(f.state().autoReveal,false);assert.ok(![...f.timers.values()].some(t=>t.ms===1400));
 f.events.keydown({key:'ArrowRight',shiftKey:true,target:{closest:()=>null},preventDefault(){}});await flush();assert.equal(f.state().currentIndex,1);assert.equal(f.state().categoryIndex,-1);
 f.events.keydown({key:'ArrowRight',target:{closest:()=>true},preventDefault(){throw Error('Typing shortcut intercepted');}});assert.equal(f.state().categoryIndex,-1);
 f.run('navigateSlide(-1)');await flush();assert.equal(f.state().categoryIndex,-1);
 f.run('stopSlideshow()');assert.equal(f.sources.size,0);assert.equal(f.frames.size,0);assert.equal(f.state().isActive,false);
 // A stopped asynchronous load must never recreate map resources.
 let resolve;f.context.fetch=url=>url.includes('config.json')?Promise.resolve({ok:true,json:async()=>({slides:f.slides,settings:{}})}):new Promise(r=>resolve=r);
 f.run('mediaCache.clear()');await f.run('startSlideshow()');await flush();f.run('stopSlideshow()');resolve({ok:true,json:async()=>({features:[]})});await flush();assert.equal(f.sources.size,0);assert.equal(f.state().isActive,false);
 const {project}=require('../session/js/phone-state.js'),MR=require('../session/js/shared.js');
 const phone=project({participants:[],messages:[{type:'slideshow_update',...f.state(),metadata:{title:'Title',secret:'x'.repeat(10000)}}]}, {layer:'slideshow-btn'});
 assert.equal(phone.slideshow.title,'Title');assert.ok(JSON.stringify(phone).length<600);assert.ok(!JSON.stringify(phone).includes('secret'));
 for(const action of ['category_next','category_previous','show_all','auto_reveal','pause_reveal','retry'])assert.ok(MR.validControl({type:'slideshow_control',action}));
 console.log('PASS category boundaries, auto/manual switching, typing, slide navigation, stop during load, resource cleanup and compact phone state');
})().catch(error=>{console.error(error);process.exitCode=1;});
