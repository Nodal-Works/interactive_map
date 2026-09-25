// Numerical and visualization regressions. Run: node scripts/test_cfd_simulation.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../animations/cfd-core.js');
const V = require('../animations/cfd-visuals.js');
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b} (tol ${tolerance})`);
const steps = (s, n) => { for (let i = 0; i < n; i++) s.step(); };
function solidRect(g, x0, y0, x1, y1) {
  const solid = new Uint8Array(g.nx * g.ny);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) solid[(y + (g.y0 || 0)) * g.nx + x + (g.x0 || 0)] = 1;
  return solid;
}
function rectangularField() {
  return { nx: 80, ny: 40, x0: 0, y0: 0, vw: 80, vh: 40, angle: 0, windSpeed: 5, latticeSpeed: .025,
    solid: new Uint8Array(3200), ux: new Float32Array(3200).fill(.025), uy: new Float32Array(3200) };
}
function numericalTests() {
  for (const windSpeed of [1, 5, 20]) for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const g = C.domain(24, 16, 24, angle), s = new C.Solver({ ...g, windSpeed, angle });
    steps(s, 60);
    const vector = C.windVector(angle);
    for (let n = 0; n < s.size; n++) {
      close(s.ux[n], vector.x * s.latticeSpeed); close(s.uy[n], vector.y * s.latticeSpeed);
    }
    assert.ok(s.latticeSpeed <= .05); close(s.realSpeed(s.latticeSpeed), windSpeed);
    assert.equal(s.diagnostics.invalidPopulations, 0);
  }
  const closed = new C.Solver({ nx: 24, ny: 16, boundary: 'closed', solid: solidRect({ nx: 24, ny: 16 }, 10, 6, 14, 10) });
  const mass = closed.diagnostics.mass;
  steps(closed, 1800);
  assert.ok(Math.abs(closed.diagnostics.mass / mass - 1) < 1e-5, 'Closed mass conservation');
  for (let n = 0; n < closed.size; n++) if (closed.solid[n]) {
    assert.equal(closed.ux[n], 0); assert.equal(closed.uy[n], 0);
  }
  // Plane Poiseuille flow: independently known parabolic profile between halfway walls.
  for (const viscosity of [.03, .06]) {
    const s = new C.Solver({ nx: 8, ny: 16, boundary: 'channel', force: [1e-5, 0], viscosity });
    steps(s, 8000);
    for (let y = 0; y < 16; y++) {
      const expected = 1e-5 * (y + .5) * (16 - y - .5) / (2 * viscosity);
      assert.ok(Math.abs(s.ux[y * 8 + 4] / expected - 1) < .015, `Channel profile at ${y}`);
    }
  }
  const g = { nx: 48, ny: 48 };
  const solid = solidRect(g, 21, 20, 27, 28);
  const a = new C.Solver({ ...g, solid, angle: 0 }), rotated = new Uint8Array(solid.length);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) rotated[x * 48 + (47 - y)] = solid[y * 48 + x];
  const b = new C.Solver({ ...g, solid: rotated, angle: 90 });
  steps(a, 1600); steps(b, 1600);
  for (let y = 1; y < 47; y++) for (let x = 1; x < 47; x++) {
    const n = y * 48 + x, r = x * 48 + 47 - y;
    close(a.ux[n], b.uy[r], 2e-5); close(a.uy[n], -b.ux[r], 2e-5);
  }
  assert.ok(a.ux[24 * 48 + 31] < a.latticeSpeed * .5, 'Sheltered wake');
  assert.ok(a.diagnostics.peakSpeed > a.latticeSpeed * 1.15, 'Side acceleration');
  // Porous forcing must alter the actual distribution momentum and conserve mass.
  const canopy = new Float32Array(16 * 12).fill(.7);
  const drag = new C.Solver({ nx: 16, ny: 12, boundary: 'periodic', canopy });
  const clean = new C.Solver({ nx: 16, ny: 12, boundary: 'periodic', canopy, trees: false });
  const before = drag.diagnostics.mass;
  steps(drag, 100); steps(clean, 100);
  assert.ok(drag.ux[50] < clean.ux[50] * .75);
  close(drag.diagnostics.mass / before, 1, 1e-5);
  let mx = 0, rho = 0;
  for (let k = 0; k < 9; k++) { const f = drag.f[50 * 9 + k]; rho += f; mx += f * [0, 1, 0, -1, 0, 1, -1, -1, 1][k]; }
  close(mx / rho, drag.ux[50]);
  const convergence = new C.Solver({ nx: 12, ny: 8, along: 4 });
  assert.equal(convergence.snapshot().developing, true);
  for (let i = 0; i < 6; i++) { steps(convergence, 100); convergence.snapshot(); }
  assert.equal(convergence.snapshot().developing, false);
  const invalid = new C.Solver({ nx: 4, ny: 4 });
  invalid.f[0] = -.1;
  assert.throws(() => invalid.measure(), /numerical limit/);
  invalid.f[0] = NaN;
  assert.throws(() => invalid.measure(), /numerical limit/);
  console.log('PASS numerical: uniform winds, mass, walls, channel profile, rotated wakes, drag, convergence, failure reporting');
}
function geometryAndTracerTests() {
  const ring = (x, y, w, h) => [[x,y], [x+w,y], [x+w,y+h], [x,y+h], [x,y]];
  const g = { nx: 20, ny: 20, x0: 0, y0: 0, cellSize: 1 };
  const features = [{ geometry: { type: 'MultiPolygon', coordinates: [[ring(1,1,8,8), ring(3,3,4,4)], [ring(12,1,4,4)]] } },
    { geometry: { type: 'Polygon', coordinates: [ring(1,12,4,6)] } },
    { geometry: { type: 'Polygon', coordinates: [ring(6,12,4,6)] } }];
  const mask = C.rasterizeBuildings(features, c => ({ x:c[0], y:c[1] }), g);
  assert.equal(mask[2*20+2],1); assert.equal(mask[4*20+4],0); assert.equal(mask[2*20+13],1);
  assert.equal(mask[14*20+5],0, 'One-cell passage preserved');
  const moved = C.rasterizeBuildings(features, c => ({ x:c[0]+2, y:c[1] }), g);
  assert.equal(moved[2*20+2],0); assert.equal(moved[2*20+4],1);
  const trees = [{ geometry: { type:'Point', coordinates:[10.3,10.7] }, properties:{height:2} }];
  const canopy = C.rasterizeTrees(trees, c => ({x:c[0],y:c[1]}), () => .8, g);
  assert.ok(canopy.some(v => v > 0 && v < 1));
  assert.deepEqual(canopy, C.rasterizeTrees(trees, c => ({x:c[0],y:c[1]}), () => .8, g));
  const field = rectangularField();
  const positions = [];
  for (const fps of [30,60,120]) {
    const p = {x:10,y:15};
    for (let i=0; i<fps; i++) assert.ok(C.advect(field,p,1/fps,600));
    positions.push(p.x);
  }
  close(positions[0],positions[1],1e-8); close(positions[1],positions[2],1e-8);
  close(positions[0],25,1e-5);
  for(const resolution of [100,150,300]){
    const f=rectangularField();f.resolution=resolution;
    const t=new C.Tracers(f,1);t.particles[0].x=10;t.particles[0].y=15;
    for(let i=0;i<60;i++)t.update(1/60,20);
    close((t.particles[0].x-10)*1000/resolution,200,1e-4,'Resolution-independent screen speed');
  }
  const smoothed=[];
  for(const fps of [30,60,120]){
    const f=rectangularField(),target=rectangularField();target.ux.fill(-.025);
    for(let i=0;i<fps;i++)C.smoothField(f,target,1/fps);
    smoothed.push(f.ux[0]);assert.ok(f.ux[0]<0,'Sustained reverse flow is preserved');
  }
  close(smoothed[0],smoothed[1]);close(smoothed[1],smoothed[2]);
  for(let y=0;y<40;y++)field.solid[y*80+40]=1;
  assert.equal(C.crossesSolid(field,10,15,60,15),true);
  const p={x:39.7,y:15};
  C.advect(field,p,.1,4000);
  assert.ok(p.x < 40,'Tracer cannot cross wall');
  // Interpolation uses cell centers and wall velocity, even with stale solid buffers.
  close(C.sample(field,39.75,15.5).x,.025*.75);
  assert.equal(C.sample(field,40.5,15.5).x,0);
  field.solid[20*80+20]=1;
  assert.equal(C.crossesSolid(field,19.5,20.5,20.5,19.5),true,'Conservative corner collision');
  const tracers = new C.Tracers(field,100);
  for(const p of tracers.particles)assert.equal(field.solid[Math.floor(p.y)*80+Math.floor(p.x)],0);
  const old=tracers.particles[0];old.trail=[{x:10,y:10,t:0}];tracers.spawn(old);
  assert.equal(old.trail.length,0,'Recycle clears history');
  for(let i=0;i<120;i++)tracers.update(1/60,20);
  for(const p of tracers.particles){
    assert.ok(p.trail.every(v=>v.t>=tracers.time-.800001));
    for(let i=1;i<p.trail.length;i++)assert.equal(C.crossesSolid(field,p.trail[i-1].x,p.trail[i-1].y,p.trail[i].x,p.trail[i].y),false);
  }
  // Diagonal inlet births are weighted by edge length as well as the wind component.
  let seed=9;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const diagonal=rectangularField();diagonal.angle=45;
  const births=new C.Tracers(diagonal,0,random);let vertical=0;
  for(let i=0;i<6000;i++){const p={};births.spawn(p);if(p.x===.05)vertical++;}
  close(vertical/6000,1/3,.025);
  assert.deepEqual(C.speedColor(20),C.speedColor(30));assert.notDeepEqual(C.speedColor(5),C.speedColor(10));
  console.log('PASS geometry/tracers: polygon parts, holes, passages, projected trees, frame rates, walls, trails, inlet flux');
}
function makeAppHarness() {
  let now=0, sequence=0, frame=null, strokeCount=0;
  const timers=new Map(), events={}, mapEvents={}, messages=[], workers=[], requests=[];
  const context2d={clearRect(){},drawImage(){},putImageData(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokeCount++;},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};}};
  const element=()=>({style:{},classList:{add(){},remove(){}},addEventListener(type,fn){this[type]=fn;},
    getContext(){return context2d;},getBoundingClientRect(){return {left:0,top:0};},
    insertAdjacentElement(){},setAttribute(){}});
  const canvas=element(),button=element();button.id='cfd-simulation-btn';
  const map={getSource(){return null;},getContainer(){return canvas;},project(c){return {x:c[0],y:c[1]};},
    on(type,fn){mapEvents[type]=fn;}};
  class Worker {constructor(){workers.push(this);}postMessage(data){this.init=data;}terminate(){this.terminated=true;}}
  const window={mrAsset:path=>path,addEventListener(type,fn){events[type]=fn;}};
  let channel;
  const sandbox={CFD:C,CFDVisuals:V,console:{...console,error(){},warn(){}},Math,Number,Float32Array,Uint8Array,Map,Worker,window,map,
    document:{getElementById:id=>id===button.id?button:canvas,createElement:element,addEventListener(){}},
    performance:{now:()=>now},setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(fn){frame=fn;return ++sequence;},cancelAnimationFrame(){frame=null;},computeOverlayPixelSize:()=>({w:1000,h:600}),
    Audio:function(){this.play=()=>Promise.resolve();this.pause=()=>{};},
    BroadcastChannel:function(){channel=this;this.postMessage=d=>messages.push(d);},
    fetch(url){return new Promise(resolve=>requests.push({url,resolve}));}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../animations/cfd-simulation.js'),'utf8'),sandbox);
  return {button,workers,requests,messages,events,mapEvents,channel,
    render(time){now=time;strokeCount=0;frame?.(time);return strokeCount;},
    runTimers(){const jobs=[...timers.values()];timers.clear();jobs.forEach(f=>f());},
    resolveRequests(){requests.splice(0).forEach(r=>r.resolve({ok:true,json:async()=>({features:[]})}));},
    command(action,value){channel.onmessage({data:{type:'cfd_control',action,value}});},
    latest(){return messages.filter(m=>m.type==='cfd_state').at(-1);}};
}
async function lifecycleTests() {
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  const h=makeAppHarness();h.button.click();assert.equal(h.requests.length,2);
  h.button.click();h.resolveRequests();await flush();assert.equal(h.workers.length,0,'Stopped loads cannot start worker');
  h.button.click();await flush();assert.equal(h.workers.length,1,'Geometry cache reused');
  const first=h.workers[0];
  const snapshot=new C.Solver(first.init.options).snapshot();
  first.onmessage({data:{...snapshot,type:'field',generation:first.init.generation}});
  h.render(0);let draws=0;
  for(let n=1;n<=60;n++){draws=h.render(n*1000/60);assert.ok(draws<=288,'Batched wind rendering');}
  assert.ok(draws>0,'Wind styles render visible segments');
  snapshot.steps=1234;
  first.onmessage({data:{...snapshot,type:'field',generation:first.init.generation}});
  for(const style of ['ribbons','particles','ribbons']) {
    h.command('set_visual_style',style);
    for(const palette of Object.keys(C.PALETTES))for(const range of C.COLOR_RANGES) {
      h.command('set_color_palette',palette);h.command('set_color_range',range);
      h.render(1100);h.command('get_state');
      assert.equal(h.latest().visualStyle,style);assert.equal(h.latest().palette,palette);
      assert.equal(h.latest().colorMaxMps,range);assert.equal(h.latest().steps,1234);
      assert.equal(h.latest().windSpeed,5);assert.equal(h.latest().viscosity,.03);
      assert.equal(first.terminated,undefined);assert.equal(h.workers.length,1,'Appearance preserves worker identity');
    }
  }
  for(const enabled of [false,true]) {
    h.command('set_facade_glow',enabled);assert.equal(h.latest().facadeGlow,enabled);
    assert.equal(h.workers.length,1);assert.equal(first.terminated,undefined);assert.equal(h.latest().steps,1234);
  }
  h.command('set_facade_glow','invalid');assert.equal(h.latest().facadeGlow,true);
  h.command('set_color_palette','constructor');h.command('set_visual_style','invalid');h.command('set_visual_style','garden');h.command('set_visual_style','pulses');h.command('set_color_range',0);
  assert.equal(h.latest().visualStyle,'ribbons');assert.equal(h.latest().palette,'monochrome');assert.equal(h.latest().colorMaxMps,40);
  h.command('set_wind_speed',20);assert.ok(first.terminated);h.runTimers();await flush();
  assert.equal(h.workers.at(-1).init.options.windSpeed,20);
  first.onmessage({data:{generation:first.init.generation,type:'error',message:'stale'}});
  h.command('get_state');assert.equal(h.latest().active,true,'Stale worker errors ignored');
  h.command('toggle_trees',false);h.runTimers();await flush();
  const count=h.workers.length;h.command('toggle_trees',false);h.runTimers();await flush();
  assert.equal(h.workers.length,count,'Tree setter is idempotent');
  h.command('set_particle_speed',32);h.command('set_particles',1000);h.command('get_state');
  assert.equal(h.latest().playback,32);assert.equal(h.latest().particles,1000);assert.equal(h.latest().trees,false);
  h.command('set_wind_speed','invalid');assert.equal(h.latest().windSpeed,20);
  for(const reset of [h.events.resize,h.events['cfd-geometry-changed'],h.mapEvents.moveend]){
    const count=h.workers.length;reset();h.runTimers();await flush();assert.equal(h.workers.length,count+1);
  }
  const current=h.workers.at(-1);
  current.onmessage({data:{generation:current.init.generation,type:'error',message:'test numerical failure'}});
  assert.equal(h.latest().active,false);assert.match(h.latest().phase,/test numerical failure/);
  h.button.click();await flush();assert.equal(h.latest().active,true,'Restart after numerical failure');
  h.command('get_state');assert.equal(h.latest().visualStyle,'ribbons');assert.equal(h.latest().palette,'monochrome');assert.equal(h.latest().colorMaxMps,40);
  h.button.click();h.button.click();await flush();h.command('get_state');
  assert.equal(h.latest().visualStyle,'ribbons');assert.equal(h.latest().palette,'monochrome');assert.equal(h.latest().colorMaxMps,40);
  h.command('set_wind_direction',135);h.runTimers();await flush();
  assert.equal(h.workers.at(-1).init.options.angle,135);assert.equal(h.latest().visualStyle,'ribbons');
  h.button.click();
  const fallback=makeAppHarness();fallback.button.click();fallback.resolveRequests();await flush();
  fallback.workers[0].onerror({preventDefault(){}});fallback.runTimers();await flush();
  assert.equal(fallback.latest().resolution,150,'Fixed quality must not be silently lowered');
  assert.equal(fallback.latest().active,false);
  assert.match(fallback.latest().phase,/worker is required/);
  fallback.runTimers();fallback.button.click();
  console.log('PASS lifecycle: asynchronous cancellation, caching, worker generations, controls, idempotent trees, resize, calibration, failure/restart');
}
function resolutionTests() {
  // All supported quality settings and inlet extremes, including diagonal boundaries.
  for (const resolution of [100,150,200,250,300]) for(const windSpeed of [1,5,20]) {
    const angle=windSpeed===5?0:45;
    const g=C.domain(1000,600,resolution,angle);
    const solid=solidRect(g,Math.floor(g.vw*.45),Math.floor(g.vh*.4),Math.floor(g.vw*.55),Math.floor(g.vh*.6));
    const s=new C.Solver({...g,angle,windSpeed,solid});steps(s,20);
    assert.equal(s.diagnostics.invalidPopulations,0);
  }
  console.log('PASS supported resolutions and speeds with obstacles');
}
function campusTests() {
  const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',name),'utf8'));
  const buildings=read('media/building-footprints.geojson').features,trees=read('media/trees.geojson').features;
  const calibration=read('map-calibration.json'),rad=Math.PI/180,world=512*2**calibration.zoom;
  const merc=c=>[world*(c[0]+180)/360,world*(1-Math.log(Math.tan(Math.PI/4+c[1]*rad/2))/Math.PI)/2];
  const center=merc([calibration.center.lng,calibration.center.lat]),bearing=calibration.bearing*rad;
  const project=c=>{const p=merc(c),x=p[0]-center[0],y=p[1]-center[1];return {
    x:500+Math.cos(bearing)*x+Math.sin(bearing)*y,y:300-Math.sin(bearing)*x+Math.cos(bearing)*y};};
  const radiusPixels=(c,r)=>r/(40075016.686*Math.cos(c[1]*rad)/world);
  for(const [windSpeed,angle] of [[5,0],[20,45]]){
    const g=C.domain(1000,600,150,angle),solid=C.rasterizeBuildings(buildings,project,g);
    const canopy=C.rasterizeTrees(trees,project,radiusPixels,g);
    const solver=new C.Solver({...g,solid,canopy,windSpeed,angle,dragReferenceCellSize:10});
    const wind=C.windVector(angle),duration=process.argv.includes('--campus-long')?8000:2400;
    for(let t=0;t<duration;t++){
      solver.step();
      if(t>=600&&t%100===0){
        let sum=0,count=0;
        for(let y=g.y0;y<g.y0+g.vh;y++)for(let x=g.x0;x<g.x0+g.vw;x++){
          const n=y*g.nx+x;
          assert.equal(solver.sponge[n],0,'Absorber must not force visible flow');
          if(!solid[n]){sum+=solver.ux[n]*wind.x+solver.uy[n]*wind.y;count++;}
        }
        assert.ok(sum/count>0,`Campus bulk wind reversed at ${windSpeed} m/s, ${angle}°, step ${t}`);
      }
    }
    assert.equal(solver.diagnostics.invalidPopulations,0);
    console.log(`PASS campus ${windSpeed} m/s, ${angle}°: ${duration} steps, downstream bulk flow, no clipping`);
  }
}
async function workerTests() {
  const { Worker }=require('node:worker_threads');
  const filename=path.join(__dirname,'../animations/cfd-worker.js');
  const core=path.join(__dirname,'../animations/cfd-core.js');
  const wrapper=`const {parentPort}=require('node:worker_threads');
    global.importScripts=()=>{global.CFD=require(${JSON.stringify(core)});};
    global.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);
    require('node:vm').runInThisContext(require('node:fs').readFileSync(${JSON.stringify(filename)},'utf8'));
    parentPort.on('message',data=>global.onmessage({data}));`;
  const worker=new Worker(wrapper,{eval:true});
  try {
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Worker snapshot timeout')),5000);
      worker.on('error',e=>{clearTimeout(timeout);reject(e);});
      let initial;
      worker.on('message',data=>{
        try {
          assert.equal(data.generation,7);assert.notEqual(data.type,'error');
          assert.ok(data.ux instanceof Float32Array);assert.ok(data.timestamp>0);
          if(!initial)initial=data;
          else if(data.steps>initial.steps){assert.equal(initial.ux.length,24*16);clearTimeout(timeout);resolve();}
        }catch(e){clearTimeout(timeout);reject(e);}
      });
      worker.postMessage({type:'init',generation:7,options:{nx:24,ny:16}});
    });
  }finally{await worker.terminate();}
  console.log('PASS worker: advancing, timestamped transferable snapshots preserve solver buffers');
}
(async()=>{if(process.argv.includes('--lifecycle-only')){await lifecycleTests();return;}numericalTests();geometryAndTracerTests();await lifecycleTests();await workerTests();resolutionTests();campusTests();})().catch(e=>{console.error(e);process.exitCode=1;});
