/* Reuse the exact canvas drawing methods; simulation remains on the host. */
self.MR_RENDER_WORKER=true;
self.window=self;
self.document={createElement:()=>new OffscreenCanvas(1,1)};
let scale=1,state,canvas;
self.mrTableScale=()=>scale;
importScripts('stormwater-flow.js');
onmessage=({data})=>{
 try{
  if(data.type==='init'){
   canvas=new OffscreenCanvas(data.width,data.height);state=Object.create(StormwaterFlowAnimation.prototype);
   Object.assign(state,data.settings,{canvas,ctx:canvas.getContext('2d'),particles:[],debugFlowLines:false});state.createGlowSprite();postMessage({type:'ready'});
  }else if(data.type==='frame'){
   scale=data.scale;if(canvas.width!==data.width||canvas.height!==data.height){canvas.width=data.width;canvas.height=data.height;}
   const values=data.values,count=values.length/23;state.particles.length=count;
   for(let i=0;i<count;i++){
    const n=i*23,p=state.particles[i] || (state.particles[i]={trail:[]});
    p.x=values[n];p.y=values[n+1];p.age=values[n+2];p.size=values[n+3];p.poolingIntensity=values[n+4];p.isPooling=!!values[n+5];p.trail.length=values[n+6];
    for(let j=0;j<p.trail.length;j++){const point=p.trail[j] || (p.trail[j]={});point.x=values[n+7+j*2];point.y=values[n+8+j*2];}
   }
   state.drawParticles();const bitmap=canvas.transferToImageBitmap();postMessage({type:'frame',bitmap,values},[bitmap,values.buffer]);
  }
 }catch(error){postMessage({type:'error',message:error.message});}
};
