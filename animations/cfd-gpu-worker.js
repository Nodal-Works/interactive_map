/* A transferred display canvas outlives solver/geometry generations. No frame bitmaps. */
importScripts('cfd-core.js','cfd-visuals.js?v=20260929-wind-gpu','cfd-gpu.js?v=20260929-wind-gpu');
let canvas,gpu,field,visuals,settings,generation=0,target=null,frame=null,last=null;
let active=false,visible=true,profiling=false,frameId=0,ribbon=null,ribbonBusy=false;
let lost=false,restoreTimer=null,latestTraceMs=0,latestRibbonPrepareMs=0;
let ribbonResult=null,ribbonBuffers=null,ribbonElapsed=0;
let facadeWorker=null,facadeBusy=false,facadeBuffers=null,facadeElapsed=0,latestExposureMs=0;
const send=(type,value={})=>postMessage({type,generation,...value});
function cancel(){if(frame!==null)cancelAnimationFrame(frame);frame=null;last=null;}
function schedule(){if(active&&visible&&!lost&&frame===null)frame=requestAnimationFrame(tick);}
function error(e){active=false;cancel();send('error',{message:e.message});}
function initRibbons(){
  ribbon?.terminate();ribbon=null;ribbonBusy=false;ribbonResult=null;ribbonElapsed=0;latestTraceMs=0;latestRibbonPrepareMs=0;
  visuals.externalFlowUpdates=settings.visualStyle==='ribbons';
  if(settings.visualStyle!=='ribbons')return;
  ribbonBuffers={ux:new Float32Array(field.ux.length),uy:new Float32Array(field.uy.length),vertices:new Float32Array(0),counts:new Uint32Array(288)};
  ribbon=new Worker('cfd-ribbon-frame-worker.js?v=20260929-wind-gpu');
  const owned=ribbon;
  ribbon.onmessage=({data})=>{
    if(ribbon!==owned||data.generation!==generation)return;
    ribbonBusy=false;
    if(data.type==='error'){error(Error('Ribbon tracing failed: '+data.message));return;}
    ribbonResult=data;ribbonBuffers=data;latestTraceMs=data.traceMs||0;latestRibbonPrepareMs=data.prepareMs;send('geometry-completed');
  };
  ribbon.onerror=()=>{if(ribbon===owned)error(Error('Ribbon preparation worker failed'));};
  ribbon.postMessage({type:'init',generation,field,settings,time:visuals.time,wallTime:visuals.wallTime});
}
function initFacades(){
  facadeWorker?.terminate();facadeBusy=false;facadeElapsed=0;latestExposureMs=0;
  facadeBuffers={ux:new Float32Array(field.ux.length),uy:new Float32Array(field.uy.length),intensity:new Float64Array(visuals.facades.edges.length)};
  visuals.externalFacadeUpdates=true;
  const owned=facadeWorker=new Worker('cfd-facade-worker.js?v=20260929-wind-gpu');
  owned.onmessage=({data})=>{
    if(facadeWorker!==owned||data.generation!==generation)return;
    if(data.type==='error'){error(Error('Facade exposure failed: '+data.message));return;}
    facadeBusy=false;facadeBuffers={ux:data.ux,uy:data.uy,intensity:data.intensity};latestExposureMs=data.exposureMs;
    for(let i=0;i<data.intensity.length;i++)visuals.facades.edges[i].intensity=data.intensity[i];
  };
  owned.onerror=()=>{if(facadeWorker===owned)error(Error('Facade exposure worker failed'));};
  owned.postMessage({type:'init',generation,field});
}
function tick(now){
  frame=null;if(!active||!visible||lost)return;
  // Register the next display tick before CPU preparation. Worker rAF registration
  // crosses threads; registering after drawing can miss the next BeginFrame.
  schedule();
  try {
    const completed=gpu.poll();if(completed.length)send('completed',{frames:completed});
    // Bound outstanding graphics work without synchronously waiting for the GPU.
    if(gpu.pending.length>=2){send('backpressure');schedule();return;}
    const started=performance.now(),interval=last===null?0:now-last,dt=last===null?0:Math.min(.05,Math.max(0,interval/1000));last=now;
    const profile=profiling?{backend:'webgl2',style:settings.visualStyle,glow:settings.facadeGlow,resolution:settings.resolution,particles:settings.particles,intervalMs:interval}:null;
    if(target)CFD.smoothField(field,target,dt);
    if(profile)profile.smoothMs=performance.now()-started;
    const updateStart=performance.now();visuals.update(dt,profile);
    if(settings.facadeGlow){
      facadeElapsed+=dt;
      if(!facadeBusy){
        const {ux,uy,intensity}=facadeBuffers;ux.set(field.ux);uy.set(field.uy);facadeBusy=true;
        facadeWorker.postMessage({type:'exposure',generation,dt:facadeElapsed,ux,uy,intensity},[ux.buffer,uy.buffer,intensity.buffer]);facadeElapsed=0;
      }
    }
    if(ribbon)ribbonElapsed+=dt;
    if(profile){profile.visualUpdateMs=performance.now()-updateStart;profile.traceMs=latestTraceMs;profile.ribbonPrepareMs=latestRibbonPrepareMs;profile.exposureWorkerMs=latestExposureMs;}
    const drawStart=performance.now();gpu.draw(now,++frameId,profile,ribbonResult);ribbonResult=null;
    if(ribbon&&!ribbonBusy){
      const {ux,uy,vertices,counts}=ribbonBuffers;ux.set(field.ux);uy.set(field.uy);ribbonBusy=true;
      ribbon.postMessage({type:'prepare',generation,dt:ribbonElapsed,ux,uy,vertices,counts},[ux.buffer,uy.buffer,vertices.buffer,counts.buffer]);ribbonElapsed=0;
    }
    if(profile){profile.drawMs=performance.now()-drawStart;profile.totalMs=performance.now()-started;}
    send('rendered',{frameId,now,...(profile?{profile}:{})});schedule();
  }catch(e){error(e);}
}
onmessage=({data})=>{
  try {
    if(data.type==='init'){
      canvas=data.canvas;profiling=!!data.profile;
      if(typeof requestAnimationFrame!=='function')throw Error('Worker animation frames unavailable');
      canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault();lost=true;cancel();send('context-lost');
        restoreTimer=setTimeout(()=>error(Error('Wind GPU context restoration timed out')),5000);
      });
      canvas.addEventListener('webglcontextrestored',()=>{
        clearTimeout(restoreTimer);
        try{gpu?.dispose();gpu=field?new CFDGPU.Renderer(canvas,field,visuals,settings,profiling):null;lost=false;send('context-restored');schedule();}catch(e){error(e);}
      });
      return;
    }
    if(data.type==='dispose'){active=false;cancel();clearTimeout(restoreTimer);ribbon?.terminate();facadeWorker?.terminate();gpu?.dispose();close();return;}
    if(data.type==='stop'){
      if(data.generation<generation)return;
      generation=data.generation;active=false;cancel();ribbon?.terminate();ribbon=null;facadeWorker?.terminate();facadeWorker=null;gpu?.clear();return;
    }
    if(data.type==='rebuild'){
      if(data.generation<generation)return;
      cancel();gpu?.dispose();generation=data.generation;({field,settings}=data);target=null;
      canvas.width=data.width;canvas.height=data.height;visible=data.visible;visuals=new CFDVisuals.Renderer(field,settings);
      gpu=new CFDGPU.Renderer(canvas,field,visuals,settings,profiling);initRibbons();initFacades();active=true;
      const debug=gpu.gl?.getExtension('WEBGL_debug_renderer_info');
      send('ready',{backend:'webgl2',width:canvas.width,height:canvas.height,graphics:debug?gpu.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'Unavailable'});schedule();return;
    }
    if(data.generation!==generation)return;
    if(data.type==='context-test'&&profiling){
      const extension=gpu.gl.getExtension('WEBGL_lose_context');
      if(extension){extension.loseContext();setTimeout(()=>extension.restoreContext(),150);}
    }else if(data.type==='snapshot'){const {ux,uy,...metadata}=data.value;Object.assign(field,metadata);target={ux,uy};}
    else if(data.type==='settings'){
      const reset=settings.visualStyle!==data.settings.visualStyle||settings.particles!==data.settings.particles;
      settings=data.settings;visuals.configure(settings);gpu.configure(settings);if(reset)initRibbons();else ribbon?.postMessage({type:'settings',generation,settings});
    }else if(data.type==='visibility'){visible=data.visible;cancel();schedule();}
  }catch(e){error(e);}
};
