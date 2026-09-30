/* Reuse the exact canvas drawing methods; simulation remains on the host. */
self.MR_RENDER_WORKER=true;
self.window=self;
self.document={createElement:()=>new OffscreenCanvas(1,1)};
let scale=1,state,canvas,generation=0,revision=0,active=false,direct=false;
self.mrTableScale=()=>scale;
importScripts('stormwater-flow.js?v=20260929-direct2');
function handle(data){
 try{
  if(data.type==='init'){
   generation=data.generation||0;active=true;direct=!!data.canvas;canvas=data.canvas||new OffscreenCanvas(data.width,data.height);state=Object.create(StormwaterFlowAnimation.prototype);
   Object.assign(state,data.settings,{canvas,ctx:canvas.getContext('2d'),particles:[],debugFlowLines:false});state.createGlowSprite();postMessage({type:'ready',generation});
  }else if(data.type==='resume'){
   if(data.generation<generation)return;generation=data.generation;active=true;postMessage({type:'ready',generation});
  }else if(data.type==='stop'){
   if(data.generation<generation)return;generation=data.generation;active=false;state.ctx.clearRect(0,0,canvas.width,canvas.height);
  }else if(data.type==='resize'){
   if(data.generation<generation)return;revision=data.revision;canvas.width=data.width;canvas.height=data.height;
  }else if(data.type==='frame'){
   if(!active || (data.generation||0)!==generation)return;
   if(data.revision<revision){postMessage({type:'frame',generation,revision:data.revision,values:data.values},[data.values.buffer]);return;}
   revision=data.revision;
   scale=data.scale;if(canvas.width!==data.width||canvas.height!==data.height){canvas.width=data.width;canvas.height=data.height;}
   const values=data.values,count=values.length/23;state.particles.length=count;
   for(let i=0;i<count;i++){
    const n=i*23,p=state.particles[i] || (state.particles[i]={trail:[]});
    p.x=values[n];p.y=values[n+1];p.age=values[n+2];p.size=values[n+3];p.poolingIntensity=values[n+4];p.isPooling=!!values[n+5];p.trail.length=values[n+6];
    for(let j=0;j<p.trail.length;j++){const point=p.trail[j] || (p.trail[j]={});point.x=values[n+7+j*2];point.y=values[n+8+j*2];}
   }
   state.debugFlowLines=!!data.debugLines;state.flowData={flow_lines_screen:data.debugLines};
   state.drawParticles();
   if(direct)postMessage({type:'frame',generation,revision:data.revision,values},[values.buffer]);
   else{const bitmap=canvas.transferToImageBitmap();postMessage({type:'frame',generation,revision:data.revision,bitmap,values},[bitmap,values.buffer]);}
  }
 }catch(error){postMessage({type:'error',generation,message:error.message});}
}
// Submit persistent-canvas drawing on the worker display clock. Acknowledging
// before this point can feed deferred Canvas raster work faster than presentation.
let queued=null,frame=null;
onmessage=({data})=>{
 if(data.type==='frame' && direct && typeof requestAnimationFrame==='function'){
  queued=data;
  if(frame===null)frame=requestAnimationFrame(()=>{frame=null;const next=queued;queued=null;if(next)handle(next);});
 }else{
  if(data.type==='stop' && data.generation>=generation){
   if(frame!==null)cancelAnimationFrame(frame);frame=null;queued=null;
  }
  handle(data);
 }
};
