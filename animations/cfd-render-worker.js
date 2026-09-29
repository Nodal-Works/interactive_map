/* Same fixed-quality wind renderer, on a worker-owned canvas. */
importScripts('cfd-core.js','cfd-visuals.js');
let canvas,ctx,heat,heatCtx,walls,wallCtx,field,visuals,settings,target=null,last=null,heatImage,colors,lastHeat=0,scale=1;
let profiling=false;
self.mrTableScale=()=>scale;
function palette(){colors=Array.from({length:256},(_,i)=>CFD.speedColor(i*settings.colorMaxMps/255,settings.palette,settings.colorMaxMps));}
onmessage=({data})=>{
 try{
  if(data.type==='init'){
   profiling=!!data.profile;
   ({field,settings,scale}=data);canvas=new OffscreenCanvas(data.width,data.height);ctx=canvas.getContext('2d');
   heat=new OffscreenCanvas(field.vw,field.vh);heatCtx=heat.getContext('2d');heatImage=heatCtx.createImageData(field.vw,field.vh);
   walls=new OffscreenCanvas(field.vw,field.vh);wallCtx=walls.getContext('2d');const mask=wallCtx.createImageData(field.vw,field.vh);
   for(let y=0;y<field.vh;y++)for(let x=0;x<field.vw;x++)mask.data[(y*field.vw+x)*4+3]=field.solid[(y+field.y0)*field.nx+x+field.x0]?255:0;
   wallCtx.putImageData(mask,0,0);visuals=new CFDVisuals.Renderer(field,settings);palette();postMessage({type:'ready'});
  }else if(data.type==='snapshot'){
   const {ux,uy,...metadata}=data.value;Object.assign(field,metadata);target={ux,uy};
  }else if(data.type==='settings'){
   settings=data.settings;visuals.configure(settings);palette();lastHeat=-Infinity;
  }else if(data.type==='frame'){
   const profile=profiling?{style:settings.visualStyle,glow:settings.facadeGlow,resolution:settings.resolution,particles:settings.particles}:null;
   const started=profiling?performance.now():0;let stamp=started;
   const mark=name=>{if(profile){const t=performance.now();profile[name]=t-stamp;stamp=t;}};
   const now=data.now,dt=last===null?0:Math.max(0,Math.min(.05,(now-last)/1000));last=now;
   ctx.clearRect(0,0,canvas.width,canvas.height);if(target)CFD.smoothField(field,target,dt);
   mark('smoothMs');
   const g=field;
   if(now-lastHeat>50){
    const pixels=heatImage.data;
    const {vw,vh,nx,x0,y0,ux,uy,windSpeed,latticeSpeed,solid}=g,maximum=settings.colorMaxMps;
    for(let y=0;y<vh;y++)for(let x=0;x<vw;x++){
     const n=(y+y0)*nx+x+x0,offset=(y*vw+x)*4,speed=Math.hypot(ux[n],uy[n])*windSpeed/latticeSpeed;
     const c=colors[Math.max(0,Math.min(255,Math.round(speed*255/maximum)))];
     pixels[offset]=c[0];pixels[offset+1]=c[1];pixels[offset+2]=c[2];pixels[offset+3]=solid[n]?0:51;
    }
    heatCtx.putImageData(heatImage,0,0);lastHeat=now;
   }
   mark('heatMs');
   ctx.imageSmoothingEnabled=false;ctx.globalAlpha=settings.visualStyle==='particles'?.45:1;
   ctx.drawImage(heat,0,0,g.vw*g.cellSize,g.vh*g.cellSize);ctx.globalAlpha=1;
   mark('heatDrawMs');
   visuals.update(dt,profile);mark('visualUpdateMs');
   visuals.draw(ctx);mark('flowDrawMs');ctx.globalCompositeOperation='destination-out';
   ctx.drawImage(walls,0,0,g.vw*g.cellSize,g.vh*g.cellSize);ctx.globalCompositeOperation='source-over';mark('maskMs');
   visuals.drawFacades(ctx);mark('glowDrawMs');
   const bitmap=canvas.transferToImageBitmap();mark('bitmapMs');
   if(profile)profile.totalMs=performance.now()-started;
   postMessage({type:'frame',bitmap,...(profile?{profile}:{})},[bitmap]);
  }
 }catch(error){postMessage({type:'error',message:error.message});}
};
