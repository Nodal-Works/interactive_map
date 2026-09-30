/* Complete 5 Hz traces; the presentation worker continues morphing between results. */
importScripts('cfd-core.js','cfd-visuals.js?v=20260929-wind-gpu');
let field,generation;
onmessage=({data})=>{
  try {
    if(data.type==='init'){field=data.field;generation=data.generation;return;}
    if(data.type!=='trace' || data.generation!==generation)return;
    field.ux=data.ux;field.uy=data.uy;
    const start=performance.now();
    const paths=data.seeds.map(seed=>({id:seed.id,points:CFDVisuals.trace(field,seed,-1).reverse().slice(0,-1).concat(CFDVisuals.trace(field,seed,1))}));
    postMessage({type:'paths',generation,revision:data.revision,paths,traceMs:performance.now()-start});
  }catch(error){postMessage({type:'error',generation,message:error.message});}
};
