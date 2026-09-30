/* Exposure uses identical Float64 arithmetic, independently of stroke preparation. */
importScripts('cfd-core.js','cfd-visuals.js?v=20260929-wind-gpu');
let field,facades,generation;
onmessage=({data})=>{
  try {
    if(data.type==='init'){field=data.field;generation=data.generation;facades=new CFDVisuals.FacadeGlow(field,field.facadeEdges);return;}
    if(data.type!=='exposure'||data.generation!==generation)return;
    field.ux=data.ux;field.uy=data.uy;
    const start=performance.now();facades.update(data.dt);
    const intensity=data.intensity;
    for(let i=0;i<facades.edges.length;i++)intensity[i]=facades.edges[i].intensity;
    postMessage({type:'exposure',generation,ux:data.ux,uy:data.uy,intensity,exposureMs:performance.now()-start},[data.ux.buffer,data.uy.buffer,intensity.buffer]);
  }catch(e){postMessage({type:'error',generation,message:e.message});}
};
