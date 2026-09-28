// Regression tests for the integration boundaries of the Universeum backport.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFrames}=require('../performance-runtime.js');
const queue=new Map();let serial=0;
const frames=createFrames(fn=>{queue.set(++serial,fn);return serial;},id=>queue.delete(id),()=>0);
const mapEvents={};
const ctx=new Proxy({}, {get:()=>()=>{}});
const canvas={width:100,height:100,style:{},getContext:()=>ctx};
const button={remove(){},classList:{toggle(){}},addEventListener(){}};
const map={on:(name,fn)=>{mapEvents[name]=fn;},project:()=>({x:0,y:0})};
const sandbox={console,performance:{now:()=>0},clearTimeout(){},
 document:{getElementById:id=>id==='bird-sounds-canvas'?canvas:button,addEventListener(){}},
 BroadcastChannel:class{postMessage(){}},
 window:{innerWidth:100,innerHeight:100,mrAsset:p=>p,APP_CONFIG:{area:{birdSensors:[]}},MR_FRAMES:frames,addEventListener(){}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('animations/bird-sounds.js','utf8'),sandbox);
const Bird=vm.runInContext('BirdSoundsLayer',sandbox),bird=new Bird(map);
bird.initAudioContext=()=>{};bird.scheduleNextBird=()=>{};
bird.toggle();assert.equal(queue.size,1);
for(let i=0;i<100;i++){mapEvents.move();mapEvents.zoom();mapEvents.moveend();}
assert.equal(queue.size,1,'Map gestures must not spawn additional bird loops');
let tick=[...queue.values()][0];queue.clear();tick(16.67);assert.equal(queue.size,1);
bird.toggle();assert.equal(queue.size,0,'Disabling birds cancels their loop');
mapEvents.move();assert.equal(queue.size,0,'Inactive birds do not redraw');
bird.toggle();assert.equal(queue.size,1);bird.toggle();assert.equal(queue.size,0);
console.log('PASS bird gesture coalescing, stop, inactive events and restart');

// The common capture handler must preserve other layers\' capture listeners.
const listeners={},posts=[];
const runtime={console,performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
 setInterval:()=>1,clearInterval(){},CustomEvent:class{},BroadcastChannel:class{postMessage(m){posts.push(m);}close(){}},
 document:{hidden:false,addEventListener:(name,fn)=>listeners[name]=fn,getElementById:()=>null},
 addEventListener(){},dispatchEvent(){}};
runtime.window=runtime;vm.createContext(runtime);vm.runInContext(fs.readFileSync('performance-runtime.js','utf8'),runtime);
let active=false,stopped=false;
runtime.MR_LAYERS.register('wind',{getEnabled:()=>active,enable:()=>active=true,disable:()=>active=false});
listeners.click({target:{closest:()=>({id:'wind'})},preventDefault(){},stopPropagation(){stopped=true;},stopImmediatePropagation(){throw Error('Artwork switching would be suppressed');}});
assert.equal(active,true);assert.equal(stopped,true);
runtime.MR_LAYERS.dispose();assert.equal(active,false);
console.log('PASS shared lifecycle preserves sibling capture listeners and disposes active layers');

const html=fs.readFileSync('index.html','utf8');
const runtimeIndex=html.indexOf('src="performance-runtime.js');
assert.ok(runtimeIndex>=0 && runtimeIndex<html.indexOf('src="animations/isovist.js'), 'Shared runtime must load before layers in each branch');
