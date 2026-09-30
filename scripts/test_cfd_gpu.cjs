const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../animations/cfd-core.js'),V=require('../animations/cfd-visuals.js');
const {makeAppHarness}=require('./test_cfd_simulation.cjs');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function host(){
  const h=makeAppHarness(false,true);h.button.click();h.resolveRequests();await flush();
  const draw=h.workers.find(w=>w.url.split('?')[0].endsWith('cfd-gpu-worker.js'));
  assert.ok(draw,'GPU is selected without a URL flag');assert.equal(draw.sent[0].type,'init');
  assert.equal(h.window.MR_CFD_RENDERER.requested,'webgl2');
  const reference=makeAppHarness(false,true,'?cfdBackend=canvas2d');
  reference.button.click();reference.resolveRequests();await flush();
  assert.equal(reference.window.MR_CFD_RENDERER.backend,'canvas2d');
  assert.ok(!reference.workers.some(w=>w.url.includes('cfd-gpu-worker')),'Canvas override skips GPU ownership');
  const build=draw.sent.find(m=>m.type==='rebuild');assert.ok(build.field.facadeEdges);
  h.render(0);h.command('set_visual_style','particles');assert.equal(draw.sent.at(-1).type,'settings');
  h.document.hidden=true;h.events.visibilitychange();assert.equal(draw.sent.at(-1).visible,false);
  h.document.hidden=false;h.events.visibilitychange();assert.equal(draw.sent.at(-1).visible,true);
  h.events.resize();h.runTimers();await flush();
  assert.equal(h.workers.filter(w=>w.url.split('?')[0].endsWith('cfd-gpu-worker.js')).length,1,'Display worker persists across generations');
  draw.onmessage({data:{type:'error',generation:build.generation,message:'stale'}});assert.equal(draw.terminated,undefined);
  h.button.click();assert.equal(draw.sent.at(-1).type,'stop');h.button.click();await flush();
  assert.equal(h.workers.filter(w=>w.url.split('?')[0].endsWith('cfd-gpu-worker.js')).length,1,'Restart reuses transferred canvas');
  const current=draw.sent.filter(m=>m.type==='rebuild').at(-1).generation;
  draw.onmessage({data:{type:'error',generation:current,message:'context restoration failed'}});await flush();
  assert.equal(draw.terminated,true);assert.equal(h.window.MR_CFD_RENDERER.backend,'canvas2d');
  assert.match(h.window.MR_CFD_RENDERER.fallbackReason,/context/);h.render(100);
  assert.ok(h.workers.at(-1).url.endsWith('cfd-worker.js'),'Solver restarts on reference canvas');
  console.log('PASS GPU host: persistent canvas, resize, visibility, stale errors, restart and explicit fallback');
}
function worker(){
  const messages=[],queue=new Map(),events={},renderers=[],tracers=[],exposures=[];let serial=0;
  class GPU {constructor(){this.pending=[];renderers.push(this);}poll(){return [];}clear(){this.cleared=true;}draw(){this.drawn=(this.drawn||0)+1;}dispose(){this.disposed=true;}configure(){}}
  class Worker {constructor(url){(url.includes('ribbon')?tracers:exposures).push(this);}postMessage(m){this.last=m;}terminate(){this.terminated=true;}}
  const context={CFD:C,CFDVisuals:V,CFDGPU:{Renderer:GPU},Worker,console,performance:{now:()=>0},
    importScripts(){},postMessage:m=>messages.push(m),requestAnimationFrame:fn=>{queue.set(++serial,fn);return serial;},cancelAnimationFrame:id=>queue.delete(id),setTimeout:()=>1,clearTimeout(){},close(){}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('animations/cfd-gpu-worker.js','utf8'),context);
  const send=data=>context.onmessage({data}),tick=t=>{const callbacks=[...queue.values()];queue.clear();callbacks.forEach(f=>f(t));};
  const canvas={addEventListener:(n,fn)=>events[n]=fn};
  const grid=C.domain(320,240,50,0),field={...grid,...C.DEFAULTS,latticeSpeed:.025,solid:new Uint8Array(grid.nx*grid.ny),ux:new Float32Array(grid.nx*grid.ny).fill(.025),uy:new Float32Array(grid.nx*grid.ny)};
  send({type:'init',canvas,profile:true});send({type:'rebuild',generation:1,field,settings:{...C.DEFAULTS,particles:200},width:320,height:240,visible:true});
  tick(0);assert.equal(tracers[0].last.type,'prepare');const firstJob=tracers[0].last;tick(210);assert.equal(tracers[0].last,firstJob,'Only one geometry job in flight');assert.equal(exposures[0].last.type,'exposure');
  const first=tracers[0];send({type:'rebuild',generation:2,field,settings:{...C.DEFAULTS,visualStyle:'particles'},width:640,height:480,visible:true});
  assert.equal(renderers[0].disposed,true);assert.equal(first.terminated,true);assert.equal(exposures[0].terminated,true);assert.equal(canvas.width,640);
  first.onmessage({data:{type:'error',generation:1,message:'late'}});assert.equal(messages.some(m=>m.type==='error'),false);
  send({type:'visibility',generation:2,visible:false});assert.equal(queue.size,0);
  send({type:'visibility',generation:2,visible:true});send({type:'visibility',generation:2,visible:true});assert.equal(queue.size,1);
  events.webglcontextlost({preventDefault(){}});assert.equal(queue.size,0);events.webglcontextrestored();assert.equal(queue.size,1);
  send({type:'stop',generation:3});assert.equal(queue.size,0);send({type:'visibility',generation:2,visible:true});assert.equal(queue.size,0);
  send({type:'dispose'});assert.equal(renderers.at(-1).disposed,true);
  console.log('PASS GPU worker: bounded trace work, generation guards, resources, visibility, context restoration and disposal');
}
function exactProbes(){
  const g={nx:32,ny:32,x0:0,y0:0,vw:32,vh:32,cellSize:8,windSpeed:5,latticeSpeed:.025,solid:new Uint8Array(1024),ux:new Float32Array(1024).fill(-.025),uy:new Float32Array(1024)};
  for(let y=3;y<28;y++)g.solid[y*32+10]=1;
  const glow=new V.FacadeGlow(g,[{a:{x:11,y:5},b:{x:11,y:24},nx:1,ny:0}]);assert.ok(glow.edges.length);
  for(let frame=0;frame<120;frame++){
    const previous=glow.edges[0].intensity,edge=glow.edges[0];let incoming=0;
    for(const point of edge.probes){const v=C.sample(g,point.x,point.y);incoming=Math.max(incoming,-(v.x*edge.nx+v.y*edge.ny)*g.windSpeed/g.latticeSpeed);}
    const target=1-Math.exp(-incoming*incoming/9),expected=previous+(target-previous)*(1-Math.exp(-(1/60)/(target>previous?1.5:.3)));
    glow.update(1/60);assert.equal(edge.intensity,expected);
  }
  console.log('PASS contiguous facade probes preserve reference arithmetic exactly');
  let seed=3;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<10000;i++){
    const a={x:random()*32,y:random()*32},b={x:a.x+(random()-.5)*4,y:a.y+(random()-.5)*4};
    assert.equal(V.sampledSpeed(g,a.x,a.y),V.speedMps(g,C.sample(g,a.x,a.y)));
    const inside=p=>p.x>=.01&&p.x<31.99&&p.y>=.01&&p.y<31.99;
    assert.equal(V.clearSegment(g,a,b),inside(a)&&inside(b)&&!C.crossesSolid(g,a.x,a.y,b.x,b.y));
  }
  console.log('PASS fast sampling and short-segment wall checks match reference over 10000 probes');
  const messages=[],context={CFD:C,CFDVisuals:V,importScripts(){},postMessage:m=>messages.push(m),performance:{now:()=>0}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('animations/cfd-facade-worker.js','utf8'),context);
  g.facadeEdges=[{a:{x:11,y:5},b:{x:11,y:24},nx:1,ny:0}];
  const reference=new V.FacadeGlow(g,g.facadeEdges);
  context.onmessage({data:{type:'init',generation:8,field:g}});
  const intensity=new Float64Array(reference.edges.length);
  for(let i=0;i<60;i++){
    const dt=i%3?.016:.033;g.ux.fill(-.025*Math.cos(i/20));reference.update(dt);
    context.onmessage({data:{type:'exposure',generation:8,dt,ux:g.ux,uy:g.uy,intensity}});
    assert.equal(messages.at(-1).intensity[0],reference.edges[0].intensity);
  }
  context.onmessage({data:{type:'exposure',generation:7}});assert.equal(messages.length,60);
  console.log('PASS exposure worker matches synchronous intensity exactly and ignores stale generations');
  const r=new V.Renderer({...g,resolution:100,angle:0},{...C.DEFAULTS,particles:200});
  for(let frame=0;frame<40;frame++){
    r.update(1/60);r.collectSegments();
    const expected=Array.from({length:288},()=>[]);
    r.model.segments(r.time,(a,b,speed,highlight,alpha)=>{
      if(alpha<=.015)return;
      const color=Math.max(0,Math.min(31,Math.round(speed/r.settings.colorMaxMps*31)));
      const bin=highlight?256+Math.min(31,Math.floor(alpha*32)):Math.min(7,Math.floor(alpha*8))*32+color;
      expected[bin].push((a.x-g.x0)*g.cellSize,(a.y-g.y0)*g.cellSize,(b.x-g.x0)*g.cellSize,(b.y-g.y0)*g.cellSize);
    });
    assert.deepEqual(r.buckets,expected);
  }
  console.log('PASS fused ribbon buckets preserve segment geometry, visibility, styles and order');
}
function ribbonPipeline(){
  const grid=C.domain(320,240,50,0),g={...grid,...C.DEFAULTS,resolution:50,latticeSpeed:.025};
  g.solid=new Uint8Array(g.nx*g.ny);g.ux=new Float32Array(g.nx*g.ny).fill(.025);g.uy=new Float32Array(g.nx*g.ny);
  const messages=[],children=[];class Worker{constructor(){children.push(this);}postMessage(m){this.last=m;}terminate(){}}
  const context={CFD:C,CFDVisuals:V,Worker,importScripts(){},postMessage:m=>messages.push(m),performance:{now:()=>0}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('animations/cfd-ribbon-frame-worker.js','utf8'),context);
  const settings={...C.DEFAULTS,particles:200};context.onmessage({data:{type:'init',generation:4,field:g,settings}});
  const prepare=dt=>context.onmessage({data:{type:'prepare',generation:4,dt,ux:g.ux,uy:g.uy}});
  prepare(0);const trace=children[0].last;assert.equal(trace.type,'trace');
  const paths=trace.seeds.map(seed=>({id:seed.id,points:V.trace(g,seed,-1).reverse().slice(0,-1).concat(V.trace(g,seed,1))}));
  children[0].onmessage({data:{type:'paths',generation:4,paths}});prepare(1/60);
  const reference=new V.Renderer(g,settings);reference.externalFacadeUpdates=true;reference.model.externalTracing=true;
  reference.update(0);reference.model.acceptPaths(paths);reference.update(1/60);reference.collectSegments();
  const output=messages.at(-1),expected=Float32Array.from(reference.buckets.flat());
  assert.ok(expected.length>0);assert.deepEqual(Array.from(output.vertices.subarray(0,expected.length)),Array.from(expected));
  assert.deepEqual(Array.from(output.counts),reference.buckets.map(b=>b.length/4));
  context.onmessage({data:{type:'prepare',generation:3}});assert.equal(messages.length,2);
  console.log('PASS pipelined ribbon geometry matches synchronous morphed vertices/buckets and rejects stale frames');
}
(async()=>{await host();worker();exactProbes();ribbonPipeline();})().catch(e=>{console.error(e);process.exitCode=1;});
