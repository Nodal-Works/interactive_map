importScripts('isovist-core.js');
let engine;
onmessage=({data})=>{try{if(data.type==='init'){engine=MR_ISOVIST_CORE.create(data.obstacles,data.trees);postMessage({type:'ready'});}else if(data.type==='calculate'){postMessage({type:'result',id:data.id,result:engine.calculate(data.position,data.cursor,data.options)});}}catch(error){postMessage({type:'error',message:error.message});}};
