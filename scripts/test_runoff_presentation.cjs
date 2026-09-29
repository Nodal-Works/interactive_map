// Runoff compositor lifecycle, with both bitmap and 2D presentation paths.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
for(const bitmapMode of [true,false]){
 const workers=[],presented=[],copies=[],failures=[];
 const ctx={clearRect(){},drawImage(bitmap){copies.push(bitmap);}};
 const canvas={width:300,height:200,style:{},classList:{add(){},remove(){}},getContext(type){return type==='bitmaprenderer'?(bitmapMode?{transferFromImageBitmap:b=>presented.push(b)}:null):ctx;}};
 const sandbox={console:{log(){},warn(){},error(){}},OffscreenCanvas:class{},
  Worker:class{constructor(){workers.push(this);}postMessage(data){this.last=data;}terminate(){this.terminated=true;}},
  window:{mrAsset:p=>p,addEventListener(){},removeEventListener(){},MR_LAYERS:{fail:(...args)=>failures.push(args)}},
  document:{readyState:'loading',addEventListener(){}},computeOverlayPixelSize:()=>({w:400,h:300}),
  Audio:class{play(){return Promise.resolve();}pause(){}},BroadcastChannel:class{postMessage(){}close(){}},
  cancelAnimationFrame(){}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('animations/stormwater-flow.js','utf8'),sandbox);
 const Flow=vm.runInContext('StormwaterFlowAnimation',sandbox),flow=new Flow({off(){}},canvas);
 flow.flowData={flow_lines_screen:[{from_x:0,from_y:0,to_x:1,to_y:1}]};
 flow.createGlowSprite=()=>{};flow.scaleFlowToScreen=()=>{};flow.animate=()=>{};
 await flow.start();const worker=workers[0];assert.ok(worker);
 flow.drawParticles();assert.equal(worker.last.type,'init','No drawing before worker ready');
 worker.onmessage({data:{type:'ready'}});flow.debugFlowLines=true;flow.drawParticles();
 assert.equal(worker.last.type,'frame');assert.equal(worker.last.debugLines,flow.flowData.flow_lines_screen);
 const revision=worker.last.revision;let closed=0;const bitmap={close(){closed++;}};
 worker.onmessage({data:{type:'frame',revision,bitmap,values:new Float32Array(0)}});
 assert.equal((bitmapMode?presented:copies).at(-1),bitmap);
 const count=(bitmapMode?presented:copies).length;
 flow.drawParticles();flow.handleResize();
 worker.onmessage({data:{type:'frame',revision,bitmap,values:new Float32Array(0)}});
 assert.equal((bitmapMode?presented:copies).length,count,'Pre-resize frames must not flash on the new canvas');
 assert.equal(flow.renderBusy,false,'Stale frame releases backpressure');
 flow.drawParticles();assert.equal(worker.last.revision,flow.renderRevision);
 flow.stop();assert.ok(worker.terminated);if(bitmapMode)assert.equal(presented.at(-1),null);
 worker.onmessage({data:{type:'frame',revision:flow.renderRevision,bitmap}});
 worker.onerror();assert.equal(failures.length,0,'Old worker errors do not stop another generation');
 assert.equal(closed,3,'Presented, resized and stopped bitmaps are all released');
}
console.log('PASS runoff: direct bitmap and 2D fallback, debug lines, resize revision, stop cleanup and stale worker guards');
})().catch(e=>{console.error(e);process.exitCode=1;});
