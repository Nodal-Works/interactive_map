/* Pipeline ribbon preparation ahead of display submission, with one job in flight. */
importScripts('cfd-core.js','cfd-visuals.js?v=20260929-wind-gpu');
let field,visuals,generation,tracer,traceBusy=false,lastTrace=-Infinity,settings,traceMs=0;
onmessage=({data})=>{
  try{
    if(data.type==='init'){
      ({field,generation,settings}=data);visuals=new CFDVisuals.Renderer(field,settings);
      visuals.time=data.time||0;visuals.wallTime=data.wallTime||0;
      visuals.externalFacadeUpdates=true;visuals.model.externalTracing=true;
      tracer?.terminate();tracer=new Worker('cfd-ribbon-worker.js?v=20260929-wind-gpu');const owned=tracer;
      tracer.onmessage=({data:result})=>{
        if(tracer!==owned||result.generation!==generation)return;
        traceBusy=false;
        if(result.type==='error'){postMessage(result);return;}
        visuals.model.acceptPaths(result.paths);traceMs=result.traceMs||0;
      };
      tracer.onerror=()=>{if(tracer===owned)postMessage({type:'error',generation,message:'Ribbon tracing worker failed'});};
      tracer.postMessage({type:'init',generation,field});return;
    }
    if(data.generation!==generation)return;
    if(data.type==='settings'){settings=data.settings;visuals.configure(settings);return;}
    if(data.type!=='prepare')return;
    field.ux=data.ux;field.uy=data.uy;
    const start=performance.now();visuals.update(data.dt);visuals.collectSegments();
    let size=0;for(const bucket of visuals.buckets)size+=bucket.length;
    const vertices=data.vertices?.length>=size?data.vertices:new Float32Array(Math.max(size,4096));
    const counts=data.counts||new Uint32Array(288);let offset=0;
    visuals.buckets.forEach((bucket,i)=>{counts[i]=bucket.length/4;vertices.set(bucket,offset);offset+=bucket.length;});
    if(!traceBusy&&visuals.wallTime-lastTrace>=.2-1e-9){
      lastTrace=visuals.wallTime;traceBusy=true;const ux=field.ux.slice(),uy=field.uy.slice();
      tracer.postMessage({type:'trace',generation,seeds:visuals.model.seeds,ux,uy},[ux.buffer,uy.buffer]);
    }
    postMessage({type:'prepared',generation,vertices,counts,ux:data.ux,uy:data.uy,traceMs,prepareMs:performance.now()-start},[vertices.buffer,counts.buffer,data.ux.buffer,data.uy.buffer]);
  }catch(e){postMessage({type:'error',generation,message:e.message});}
};
