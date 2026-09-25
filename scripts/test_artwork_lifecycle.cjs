const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Core=require('../animations/artwork-core.js'),MR=require('../session/js/shared.js');
let now=10000,serial=0,frames=new Map(),timers=new Map(),messages=[],loads=[],changes=[];
const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(o[k]=()=>{})});
function element(){const listeners={},classes=new Set(),buttons={};return {dataset:{},style:{},hidden:false,
 classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},
 append(){},setAttribute(){},getContext:()=>context,
 addEventListener(k,f){listeners[k]=f;},removeEventListener(k){delete listeners[k];},listeners,
 querySelector(selector){return buttons[selector]||(buttons[selector]=element());},querySelectorAll:()=>[],
 getBoundingClientRect:()=>({left:0,top:0,width:1920,height:1080})};}
const els=new Map(),get=id=>{if(!els.has(id))els.set(id,element());return els.get(id);};
const document={body:element(),hidden:false,createElement:()=>element(),getElementById:get,addEventListener(){},removeEventListener(){}};
const pendingScene={manifest:{registration:{matrix:[[1,0,0],[0,1,0]]}},items:[],draw(){}};
const sandbox={console,document,Date:{now:()=>now},performance:{now:()=>now},devicePixelRatio:1,innerWidth:1920,innerHeight:1080,
 AbortController,matchMedia:()=>({matches:false,addEventListener(){}}),
 requestAnimationFrame:f=>{frames.set(++serial,f);return serial;},cancelAnimationFrame:id=>frames.delete(id),
 setTimeout:f=>{timers.set(++serial,f);return serial;},clearTimeout:id=>timers.delete(id),
 BroadcastChannel:class {constructor(){this.onmessage=null;}postMessage(m){messages.push(m);}},
 ArtworkCore:{...Core,transition:(state,chapter)=>Core.transition(state,chapter,now),Scene:{load:signal=>new Promise((resolve,reject)=>loads.push({resolve,reject,signal}))}},MR,
 MR_ADAPTER:{active:{'grid-animation-btn':true},setLayer(id,v){this.active[id]=v;changes.push([id,v]);}},
 streetLifeAnimation:{stop(){},updateVisibility(){}},computeOverlayPixelSize:()=>({w:1920,h:1080}),
 map:{getContainer:()=>element(),project:([x,y])=>({x:x*10000,y:y*10000}),on(){},off(){}},
 addEventListener(){},removeEventListener(){}};
sandbox.window=sandbox;vm.runInNewContext(fs.readFileSync(require.resolve('../animations/artwork.js'),'utf8'),sandbox);
const api=sandbox.artworkAnimation;
function tick(ms){now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(now));}
(async()=>{
 const pending=api.start();assert.equal(api.getState().loading,true);api.stop();assert.equal(loads[0].signal.aborted,true);
 loads[0].resolve(pendingScene);await pending;assert.equal(api.isActive(),false);assert.equal(frames.size,0,'Stopping during preload must not resurrect a render loop');
 await api.start();tick(4000);assert.equal(api.getState().transitioning,true);api.control('next');assert.equal(api.getState().chapter,0);tick(6800);assert.equal(api.getState().transitioning,false);
 api.control('next');api.control('next');assert.equal(api.getState().chapter,1,'Burst advances must be ignored');tick(3200);
 api.control('previous');tick(10800);assert.equal(api.getState().chapter,0);
 api.control('show_all');tick(2100);assert.equal(api.getState().chapter,8);
 api.control('set_lens',true);api.control('pin_lens',true);api.control('set_zoom',6);assert.equal(api.getState().lens.pinned,true);assert.equal(api.getState().lens.zoom,6);
 api.control('set_lens_position',{x:.1,y:.2});assert.equal(api.getState().lens.x,.5,'Pinned lens rejects remote movement');api.control('pin_lens',false);api.control('set_lens_position',{x:.1,y:.2});assert.equal(api.getState().lens.x,.1);api.control('set_lens_position',{x:-1,y:0});assert.equal(api.getState().lens.x,.1);
 api.control('set_zoom',7);assert.equal(api.getState().lens.zoom,6);
 api.control('restart');assert.equal(api.getState().chapter,0);assert.ok(Core.frame(api.getState(),now).fields.every(f=>!f.opacity));
 api.stop();assert.equal(frames.size,0);assert.equal(api.getState().lens.enabled,false);
 // A prior selected layer is suspended once and restored after both exits.
 assert.ok(changes.some(([id,on])=>id==='grid-animation-btn'&&!on));assert.equal(sandbox.MR_ADAPTER.active['grid-animation-btn'],true);
 const phone=require('../session/js/phone-state.js').project({participants:[],messages:[{type:'artwork_state',...api.getState(),secretGeometry:[1,2]}]}, {layer:'artwork-btn'});
 assert.equal(phone.artwork.chapter,0);assert.equal(phone.artwork.secretGeometry,undefined);assert.equal(phone.artwork.lens,undefined);
 console.log('PASS Artwork preload cancellation, rapid advance guard, backwards/replay/finale, magnifier controls, layer restoration, cleanup and compact phone state');
})().catch(e=>{console.error(e);process.exitCode=1;});
