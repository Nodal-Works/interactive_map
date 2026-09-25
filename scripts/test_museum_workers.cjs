// Exercise the actual worker scripts, with a recording canvas instead of a GPU.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function worker(file){
 const messages=[],canvases=[];
 class Canvas{
  constructor(width,height){this.width=width;this.height=height;this.ops=[];canvases.push(this);}
  getContext(){return new Proxy({}, {get:(_,key)=>{
   if(key==='createImageData')return (w,h)=>({data:new Uint8ClampedArray(w*h*4)});
   if(key==='createRadialGradient')return ()=>({addColorStop(){}});
   return (...args)=>this.ops.push([key,...args.map(v=>v instanceof Canvas?'canvas':v)]);
  },set:(_,key,value)=>{this.ops.push(['set',key,value]);return true;}});}
  transferToImageBitmap(){return {width:this.width,height:this.height};}
 }
 const context=vm.createContext({console,OffscreenCanvas:Canvas,postMessage:(message,transfer)=>messages.push({message,transfer})});
 context.self=context;context.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../animations',f),'utf8'),context));
 context.importScripts(file);
 return {context,messages,canvases,send:data=>context.onmessage({data})};
}
const water=worker('stormwater-render-worker.js');
water.send({type:'init',width:1440,height:1080,settings:{glowSpriteSize:24,particleLifetime:200,glowIntensity:.8,poolingGlowIntensity:1}});
assert.equal(water.messages.at(-1).message.type,'ready');
const values=new Float32Array(46);
for(let i=0;i<2;i++){const n=i*23;values.set([20+i,30,40,3,.5,i,3,1,2,3,4,5,6],n);}
water.send({type:'frame',values,width:1920,height:1080,scale:1});
const result=water.messages.at(-1);assert.equal(result.message.type,'frame');assert.equal(result.message.bitmap.width,1920);
assert.equal(result.transfer[1],values.buffer,'Particle storage is returned for reuse');
const workerOps=water.canvases[0].ops.slice();water.canvases[0].ops.length=0;
vm.runInContext('state.drawParticles()',water.context);
assert.deepEqual(water.canvases[0].ops,workerOps,'Worker delegates to the exact main-thread water renderer');
assert.equal(water.canvases[0].ops.filter(op=>op[0]==='stroke').length,2,'Both pooled and flowing trails are drawn');
const wind=worker('cfd-render-worker.js'),C=require('../animations/cfd-core.js');
const domain=C.domain(320,240,50,0),length=domain.nx*domain.ny;
const field={...domain,resolution:50,angle:0,windSpeed:5,latticeSpeed:.025,solid:new Uint8Array(length),ux:new Float32Array(length).fill(.025),uy:new Float32Array(length)};
wind.send({type:'init',field,settings:{particles:100,visualStyle:'ribbons',palette:'viridis',colorMaxMps:20},width:320,height:240,scale:1});
assert.equal(wind.messages.at(-1).message.type,'ready');
wind.send({type:'snapshot',value:{ux:field.ux,uy:field.uy,steps:30}});
wind.send({type:'frame',now:100});
assert.equal(wind.messages.at(-1).message.type,'frame');
assert.equal(wind.messages.at(-1).transfer.length,1,'Completed bitmap is transferred');
assert.ok(wind.canvases[0].ops.some(op=>op[0]==='set'&&op[1]==='globalCompositeOperation'&&op[2]==='destination-out'),'Solid masking is retained');
wind.send({type:'settings',settings:{particles:100,visualStyle:'particles',palette:'ember',colorMaxMps:10}});
wind.send({type:'frame',now:116.67});assert.equal(wind.messages.at(-1).message.type,'frame');
assert.equal(wind.messages.some(({message})=>message.type==='error'),false);
console.log('PASS offscreen workers: actual drawing paths, particle buffer recycling, resize, masking, transferred frames and settings updates');
