// Pure presentation regressions: node scripts/test_cfd_visuals.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../animations/cfd-core.js');
const V = require('../animations/cfd-visuals.js');
const close = (a,b,t=1e-6) => assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function field(resolution=150,angle=0,speed=5) {
  const g=C.domain(1000,600,resolution,angle),wind=C.windVector(angle),latticeSpeed=Math.min(.05,speed*.005);
  return {...g,resolution,angle,windSpeed:speed,latticeSpeed,solid:new Uint8Array(g.nx*g.ny),
    ux:new Float32Array(g.nx*g.ny).fill(wind.x*latticeSpeed),uy:new Float32Array(g.nx*g.ny).fill(wind.y*latticeSpeed)};
}
function wall(g,x,y,w,h) {
  for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++) {
    const n=(j+g.y0)*g.nx+i+g.x0;g.solid[n]=1;g.ux[n]=0;g.uy[n]=0;
  }
}
function segments(model,time=0) { const output=[];model.segments(time,(a,b,speed,white,alpha=1)=>output.push({a,b,speed,white,alpha}));return output; }
function palettes() {
  for(const [name,stops] of Object.entries(C.PALETTES))for(const maximum of C.COLOR_RANGES) {
    assert.deepEqual(C.speedColor(0,name,maximum),stops[0]);
    assert.deepEqual(C.speedColor(maximum,name,maximum),stops.at(-1));
    assert.deepEqual(C.speedColor(maximum*3,name,maximum),stops.at(-1));
    assert.deepEqual(C.speedColor(-2,name,maximum),stops[0]);
    for(let k=0;k<stops.length-1;k++) {
      assert.deepEqual(C.speedColor(maximum*(k+.5)/(stops.length-1),name,maximum),stops[k].map((v,i)=>Math.round((v+stops[k+1][i])/2)));
    }
    const legend=C.colorLegend(name,maximum);
    assert.deepEqual(legend.labels,['0 m/s',`${maximum/2} m/s`,`${maximum}+ m/s`]);
    for(const stop of stops)assert.ok(legend.gradient.includes(`rgb(${stop.join(',')})`));
  }
  assert.deepEqual(C.speedColor(10,'monochrome'),[184,184,184]);
  console.log('PASS palettes: endpoints, interpolation, saturation, shared legend, all ranges');
}
function ribbons() {
  const g=field();wall(g,65,20,10,50);
  const r=new V.Renderer(g,{particles:500});r.update(.01);
  const paths=r.model.paths,seeds=r.model.seeds;
  assert.ok(paths.some(p=>p.points.length>30));
  r.update(.1);assert.equal(paths,r.model.paths,'Paths refresh at most 5 Hz');
  r.update(.1);assert.notEqual(paths,r.model.paths);assert.equal(seeds,r.model.seeds,'Stable seeds');
  for(const p of r.model.paths)for(let i=1;i<p.points.length;i++) {
    assert.equal(C.crossesSolid(g,p.points[i-1].x,p.points[i-1].y,p.points[i].x,p.points[i].y),false);
    assert.ok(p.points[i].x>=p.points[i-1].x,'Downstream path order');
  }
  const before=segments(r.model,r.time),clock=r.time,model=r.model;
  r.configure({palette:'ember',colorMaxMps:5});assert.equal(r.time,clock);assert.equal(r.model,model);
  assert.deepEqual(segments(r.model,r.time),before,'Colors cannot move highlights or marks');
  const refreshed=segments(r.model,r.time);r.model.update(2);
  assert.deepEqual(segments(r.model,r.time),refreshed,'Refreshing a stable field preserves phase');
  const calm=field();calm.ux.fill(0);const calmR=new V.Ribbons(calm,500);calmR.update(0);
  assert.ok(calmR.paths.every(p=>p.points.length===1),'Stop at stagnation');
  const reverse=field();reverse.ux.fill(-.025);
  const backwardsR=new V.Ribbons(reverse,200);backwardsR.update(0);
  assert.ok(backwardsR.paths.every(p=>p.points.at(-1).x<p.points[0].x));
  console.log('PASS Ribbons: stable seeds, cache timing, phase, walls, calm cells, reverse flow');
}
function timingAndResolution() {
  const results=[];
  for(const fps of [30,60,120]) {
    const r=new V.Renderer(field(),{});
    for(let n=0;n<fps;n++)r.update(1/fps);
    results.push(r);
  }
  close(results[0].time,results[1].time);close(results[1].time,results[2].time);
  const slow=new V.Renderer(field(),{playback:10}),fast=new V.Renderer(field(),{playback:20});
  for(let i=0;i<60;i++){slow.update(1/60);fast.update(1/120);}
  close(slow.time,fast.time);
  for(const resolution of [100,150,200,250,300])for(const speed of [1,5,20]) {
    const g=field(resolution,45,speed),view=new V.Renderer(g,{});view.update(.1);
    close(g.latticeSpeed*V.motionRate(g)*g.cellSize,40*speed,1e-4);
    for(const s of segments(view.model,view.time))assert.ok(Number.isFinite(s.a.x+s.b.y+s.speed));
  }
  const r=new V.Renderer(field(),{});r.update(.25);
  const model=r.model,before=segments(model,r.time),time=r.time;
  for(const palette of Object.keys(C.PALETTES))for(const colorMaxMps of C.COLOR_RANGES) {
    r.configure({palette,colorMaxMps});assert.equal(r.model,model);assert.equal(r.time,time);
    assert.deepEqual(segments(model,r.time),before);
  }
  console.log('PASS timing: 30/60/120 FPS, playback parity, all resolutions/speeds, finite fields');
}
function smoothness() {
  const g=field(),r=new V.Ribbons(g,500);r.update(0);r.update(.19);
  const previous=r.displayPaths[0].points.find(p=>p.station===10);
  const old={x:previous.x,y:previous.y};g.uy.fill(.008);
  r.update(.201);
  const fresh=r.displayPaths[0].points.find(p=>p.station===10), target=fresh.target;
  const fullChange=Math.hypot(target.x-old.x,target.y-old.y),firstChange=Math.hypot(fresh.x-old.x,fresh.y-old.y);
  assert.ok(fullChange>.1);assert.ok(firstChange<fullChange*.15,'No 5 Hz geometry snap');
  const first={x:fresh.x,y:fresh.y},cached=r.paths;
  r.update(.217);assert.equal(r.paths,cached);
  assert.ok(Math.hypot(fresh.x-first.x,fresh.y-first.y)>0,'Geometry moves between cache updates');
  for(const segment of segments(r,.4))assert.equal(C.crossesSolid(g,segment.a.x,segment.a.y,segment.b.x,segment.b.y),false);
  const steady=new V.Ribbons(field(),200);steady.update(0);
  const lights=segments(steady,.3).filter(s=>s.white);
  assert.ok(lights.some(s=>s.alpha>.1&&s.alpha<.8),'Ribbon highlights have a soft envelope');
  const before=segments(steady,.3).filter(s=>!s.white),after=segments(steady,.301).filter(s=>!s.white);
  assert.deepEqual(before,after,'Highlight motion cannot jitter the underlying ribbon');
  // Independent moves at every lattice segment used to create capped/dotted lines.
  let moves=0,lines=0,strokes=0;
  const renderer=new V.Renderer(field(),{});renderer.update(.1);
  renderer.draw({beginPath(){},moveTo(){moves++;},lineTo(){lines++;},stroke(){strokes++;}});
  assert.ok(moves<lines/2,'Adjacent render segments form continuous strokes');assert.ok(strokes<=288);
  console.log('PASS smoothness: continuous ribbon morphs, soft light, joined strokes');
}
function particles() {
  const random = () => { let state=7;return ()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296); };
  const displacements=[];
  for(const fps of [30,60,120]) {
    const g=field(),p=new V.Particles(g,1,random()),point=p.particles[0];
    point.x=g.x0+20;point.y=g.y0+30;point.trail=[];const x=point.x;
    for(let i=0;i<fps;i++)p.update(1/fps);
    displacements.push((point.x-x)*g.cellSize);
    assert.ok(point.trail.length<=Math.ceil(fps*.24)+2,'Short, bounded trail storage');
    const marks=segments(p),length=s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)*g.cellSize;
    assert.ok(marks.length>0);
    assert.ok(marks.filter(s=>s.white).reduce((n,s)=>n+length(s),0)<=2.00001,'Small tip at every frame rate');
    assert.ok(marks.filter(s=>!s.white).reduce((n,s)=>n+length(s),0)<=point.tailLength+.00001,'Screen-space tail cap');
    const old=point;p.spawn(point);assert.equal(old,point);assert.equal(point.trail.length,0,'Recycle cannot connect old trail');
    assert.equal(segments(p).length,0,'New births fade in');
  }
  for(const x of displacements)close(x,200,1e-4);
  const g=field();wall(g,65,0,2,g.vh);
  const blocked=new V.Particles(g,200,random());
  for(let i=0;i<240;i++){
    blocked.update(1/60);
    for(const s of segments(blocked))assert.equal(C.crossesSolid(g,s.a.x,s.a.y,s.b.x,s.b.y),false);
  }
  const reverse=field();reverse.ux.fill(-.025);
  const backwards=new V.Particles(reverse,1,random()),point=backwards.particles[0];
  point.x=reverse.x0+80;point.y=reverse.y0+30;const x=point.x;
  backwards.update(.1);assert.ok(point.x<x,'Real reverse flow is retained');
  const r=new V.Renderer(field(),{visualStyle:'particles'});r.update(.3);
  const model=r.model,clock=r.time,marks=segments(model);
  r.configure({palette:'ocean',colorMaxMps:5});assert.equal(r.model,model);assert.equal(r.time,clock);assert.deepEqual(segments(model),marks);
  r.configure({visualStyle:'ribbons'});r.update(.1);r.configure({visualStyle:'particles'});assert.equal(r.model,model);
  r.configure({particles:200});assert.equal(r.model.particles.length,200);
  assert.ok(r.model.particles.some(p=>p.brightness!==r.model.particles[0].brightness));
  console.log('PASS Particles: 30/60/120 FPS, short tails, fine tips, safe recycling, walls, reverse flow, color and style switching');
}
function facadeGlow() {
  const ring=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
  const project=p=>({x:p[0],y:p[1]});
  const features=[{geometry:{type:'MultiPolygon',coordinates:[
    [ring(300,150,200,250),ring(350,220,100,100)], [ring(600,200,80,180)]
  ]}}];
  const setup=(speed=5,resolution=150,source=features)=>{
    const g=field(resolution,0,speed);g.solid=C.rasterizeBuildings(source,project,g);
    g.facadeEdges=V.facadeEdges(source,project,g);
    return g;
  };
  const f=setup(),glow=new V.FacadeGlow(f,f.facadeEdges);
  assert.ok(glow.edges.length>0);assert.ok(glow.edges.length<f.facadeEdges.length+1);
  glow.update(2);
  const left=glow.edges.filter(e=>e.nx<-.9),right=glow.edges.filter(e=>e.nx>.9),parallel=glow.edges.filter(e=>Math.abs(e.ny)>.9);
  assert.ok(left.some(e=>e.intensity>.6),'Windward faces glow');
  assert.ok(right.every(e=>e.intensity===0),'Outgoing flow does not light the rear face');
  assert.ok(parallel.every(e=>e.intensity===0),'Tangential flow is not normal impact');
  assert.ok(glow.edges.some(e=>Math.abs((e.a.x-f.x0)*f.cellSize-450)<1e-4&&e.nx<-.9),'Courtyard normals face the fluid');
  assert.ok(glow.edges.some(e=>(e.a.x-f.x0)*f.cellSize>590),'Every polygon part gets edges');
  const reversed=features.map(feature=>({geometry:{type:'MultiPolygon',coordinates:feature.geometry.coordinates.map(poly=>poly.map(r=>[...r].reverse()))}}));
  const winding=setup(5,150,reversed),reverseGlow=new V.FacadeGlow(winding,winding.facadeEdges);reverseGlow.update(2);
  close(left.reduce((n,e)=>n+e.intensity,0),reverseGlow.edges.filter(e=>e.nx<-.9).reduce((n,e)=>n+e.intensity,0));
  f.ux.fill(-.025);glow.update(3);
  assert.ok(right.some(e=>e.intensity>.6));assert.ok(left.every(e=>e.intensity<.001),'Wind direction changes which faces glow');
  const impacts=[];
  for(const speed of [1,5,20]) {
    const g=setup(speed),v=new V.FacadeGlow(g,g.facadeEdges);v.update(2);
    impacts.push(Math.max(...v.edges.map(e=>e.intensity)));
  }
  assert.ok(impacts[0]<impacts[1]&&impacts[1]<impacts[2],'Increasing real wind speed increases glow');
  const rates=[];
  for(const fps of [30,60,120]) {
    const g=setup(),v=new V.FacadeGlow(g,g.facadeEdges);
    for(let i=0;i<fps;i++)v.update(1/fps);
    rates.push(v.edges.map(e=>e.intensity));
  }
  for(let i=0;i<rates[0].length;i++)close(rates[0][i],rates[2][i]);
  const sheltered=[{geometry:{type:'Polygon',coordinates:[ring(300,150,200,250)]}},
    {geometry:{type:'Polygon',coordinates:[ring(260,100,30,350)]}}];
  const shielded=setup(5,150,sheltered);shielded.ux.fill(0);
  for(let y=0;y<shielded.ny;y++)for(let x=0;x<shielded.nx;x++)if((x-shielded.x0)*shielded.cellSize<260)shielded.ux[y*shielded.nx+x]=.025;
  const shadow=new V.FacadeGlow(shielded,shielded.facadeEdges);shadow.update(2);
  assert.ok(shadow.edges.filter(e=>Math.abs((e.a.x-shielded.x0)*shielded.cellSize-300)<1e-4).every(e=>e.intensity===0),'Probes cannot see wind through an intervening building');
  for(const resolution of [100,150,300]) {
    const g=setup(5,resolution),v=new V.FacadeGlow(g,g.facadeEdges);v.update(2);
    close(Math.max(...v.edges.map(e=>e.intensity)),impacts[1]);
  }
  const g=setup(),view=new V.Renderer(g,{visualStyle:'particles'});view.update(1);
  const facades=view.facades,values=facades.edges.map(e=>e.intensity);
  view.configure({visualStyle:'ribbons',colorMaxMps:5,palette:'monochrome',playback:40});
  assert.equal(view.facades,facades);assert.deepEqual(facades.edges.map(e=>e.intensity),values,'Color scale/playback/style cannot change impact');
  let strokes=0;const ctx={beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
  view.drawFacades(ctx);assert.ok(strokes>0&&strokes<=48);
  view.configure({facadeGlow:false});strokes=0;view.drawFacades(ctx);assert.equal(strokes,0);
  console.log('PASS facade glow: windward/parallel/leeward faces, speed response, courtyards, polygon parts, winding, shelter, frame rates, resolution, controls');
}
function dashboard() {
  const elements=new Map();
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',style:{},dataset:{}});return elements.get(id);}};
  const source=fs.readFileSync(require.resolve('../controller.js'),'utf8');
  const context=vm.createContext({CFD:C,CFDVisuals:V,document});
  vm.runInContext(source.slice(0,source.indexOf('// Controller logic for the secondary screen')),context);
  vm.runInContext("cfdState={...cfdState,visualStyle:'particles',palette:'ocean',colorMaxMps:5};renderCfdState()",context);
  assert.equal(elements.get('wind-facade-glow').checked,true);assert.equal(elements.get('wind-palette').value,'ocean');assert.equal(elements.get('wind-visual-style').value,'particles');
  assert.equal(elements.get('wind-range-label-1').textContent,'2.5 m/s');
  assert.equal(elements.get('wind-color-preview').style.background,C.colorLegend('ocean',5).gradient);
  elements.clear();vm.runInContext('renderCfdState()',context);
  assert.equal(elements.get('wind-color-range').value,5,'Reopened dashboard reflects authoritative state');
  assert.equal(elements.get('wind-style-description').textContent,V.STYLES.particles);
  console.log('PASS dashboard: synchronized controls, descriptions, legend, reopening');
}
palettes();ribbons();timingAndResolution();smoothness();particles();facadeGlow();dashboard();
