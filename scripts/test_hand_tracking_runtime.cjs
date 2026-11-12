const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../session/js/hand-tracking-core.js');
class Element {
  constructor(){this.children=[];this.style={};this.value='';this.disabled=false;this.textContent='';this.classList={add(){},remove(){}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  add(child){this.append(child);}
  setAttribute(key,value){this.attributes??={};this.attributes[key]=value;}
  getBoundingClientRect(){return {left:0,top:0,width:640,height:480};}
}
async function fixture(search='?handTracking=1',storage=new Map()) {
  const ids=Object.fromEntries(['start','stop','calibrate','mode','camera','status','flip-x','flip-y','offset-x','offset-y','marker-side','marker-distance','move-panel'].map(id=>['mr-hand-'+id,new Element()]));
  ids['mr-hand-mode'].value='pointer';
  const video=new Element();Object.assign(video,{videoWidth:640,videoHeight:480,readyState:2,currentTime:0,play:async()=>{}});
  const preview=new Element();preview.getContext=()=>({clearRect(){},beginPath(){},arc(){},fill(){},fillText(){}});
  const panel=new Element();panel.querySelector=tag=>tag==='video'?video:preview;
  const events={},documentEvents={},saved=[],selections=[];let callbacks=[],landmarks,closed=0,stopped=0,request;
  const track={stop(){stopped++;},getSettings:()=>({deviceId:'external'}),addEventListener(){}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const api={active:{},setLayer(layer){this.active[layer]=true;},table:()=>({revision:1,widthCm:200,heightCm:100}),coordinate:p=>[p.x,p.y]};
  const map={getLayer:()=>true,queryRenderedFeatures:()=>[{}],project:c=>({x:c[0]*640,y:c[1]*480}),getContainer:()=>preview};
  const context={URLSearchParams,location:{search},MR_HAND_CORE:core,MR_ADAPTER:api,map,
    MR_TABLE:{geometry:()=>({points:[{x:0,y:0},{x:640,y:0},{x:640,y:480},{x:0,y:480}]}),affine:require('../table-layout.js').affine},
    MR_SESSION:{publish(){},canvas:action=>saved.push(action)},MR:{id:()=>String(saved.length)},
    requestAnimationFrame:cb=>{callbacks.push(cb);return callbacks.length;},cancelAnimationFrame(){callbacks=[];},
    Option:class extends Element {constructor(label,value){super();this.value=value;}},
    navigator:{mediaDevices:{getUserMedia:()=>request?request():Promise.resolve(stream),enumerateDevices:async()=>[{kind:'videoinput',deviceId:'external',label:'External webcam'}]}},
    document:{body:new Element(),hidden:false,getElementById:id=>ids[id],createElement:()=>panel,
      createElementNS:()=>Object.assign(new Element(),{namespaceURI:'svg'}),addEventListener:(name,cb)=>documentEvents[name]=cb},
    __vision:{FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async()=>({detectForVideo:()=>({landmarks:landmarks?[landmarks]:[]}),close(){closed++;}})}}};
  context.window={isSecureContext:true,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},mrSelectEpc:c=>selections.push(c),addEventListener:(name,cb)=>events[name]=cb};
  const source=fs.readFileSync(require.resolve('../session/js/hand-tracking.js'),'utf8').replace(/import\('https:[^']+'\)/,"Promise.resolve(__vision)");
  vm.runInNewContext(source,context);
  return {ids,preview,video,context,events,documentEvents,saved,selections,
    resources:()=>({closed,stopped}),setRequest:fn=>request=fn,
    tick(hand){for(let i=0;i<4;i++){landmarks=hand;video.currentTime+=.1;const cb=callbacks.shift();assert.ok(cb,'inference loop scheduled');cb(video.currentTime*1000);}},
    calibrate(){ids['mr-hand-calibrate'].onclick();for(const[x,y]of [[0,0],[640,0],[640,480],[0,480]])preview.onclick({clientX:x,clientY:y});}};
}
function hand(ratio,x=.5,y=.5) {
  const points=Array.from({length:21},()=>({x,y}));
  points[0]={x,y:y+.3};points[9]={x,y:y+.1};points[4]={x:x+.2*ratio,y};return points;
}
(async()=>{
  const disabled=await fixture('');assert.equal(disabled.context.document.body.children.length,0,'normal studio display has no hand-tracking UI');
  const denied=await fixture();denied.setRequest(()=>Promise.reject(Object.assign(Error('Denied'),{name:'NotAllowedError'})));
  await denied.ids['mr-hand-start'].onclick();assert.match(denied.ids['mr-hand-status'].textContent,/permission denied/i);
  assert.equal(denied.ids['mr-hand-start'].disabled,false,'permission denial remains retryable');
  const f=await fixture();await f.ids['mr-hand-start'].onclick();
  f.tick(hand(.8));
  assert.match(f.ids['mr-hand-status'].textContent,/corner matching projected number 1/,'visible landmarks preserve calibration instructions');
  const overlay=f.context.document.body.children[1];
  const cells=overlay.children.filter(el=>el.attributes?.['data-calibration-grid']==='cell');
  assert.equal(cells.length,48,'startup projects an eight by six calibration grid');
  assert.equal(cells[0].attributes.points,'0,0 80,0 80,80 0,80','grid follows projected table coordinates');
  assert.notEqual(cells[0].attributes.fill,cells[1].attributes.fill,'adjacent cells contrast');
  assert.equal(overlay.children.filter(el=>el.textContent).length,4,'all four numbered targets remain visible');
  f.calibrate();
  assert.equal(overlay.children.length,0,'calibration grid disappears immediately after the fourth corner');
  f.tick(hand(.8,1.2));
  assert.match(f.ids['mr-hand-status'].textContent,/outside the calibrated table/);
  f.tick(null);assert.match(f.ids['mr-hand-status'].textContent,/No hand detected/);
  f.tick(hand(.8));
  const indicator=f.context.document.body.children[1].children.at(-1);
  assert.ok(Math.abs(indicator.attributes.cy-182.4)<1e-8,'visible marker sits 12 cm away from the fingertip');
  assert.equal(overlay.children.filter(el=>el.attributes?.['data-hand-shadow']==='finger').length,5,'projected hand shadow contains five fingers');
  f.ids['mr-hand-mode'].value='select';await f.ids['mr-hand-mode'].onchange();
  f.tick(hand(.8));f.tick(hand(.2));f.tick(hand(.2));assert.equal(f.selections.length,1);
  assert.ok(Math.abs(f.selections[0][1]-.38)<1e-8,'EPC selection uses the offset ring rather than the fingertip');
  assert.ok(Math.abs(overlay.children.at(-1).attributes.cy-f.selections[0][1]*480)<1e-8,'selected location matches the rendered ring');
  f.tick(null);f.tick(hand(.2));assert.equal(f.selections.length,1,'loss cannot create a phantom selection');
  f.context.map.queryRenderedFeatures=()=>[];f.tick(hand(.8));f.tick(hand(.2));
  assert.equal(f.selections.length,1);assert.match(f.ids['mr-hand-status'].textContent,/No EPC building/);
  f.ids['mr-hand-mode'].value='draw';await f.ids['mr-hand-mode'].onchange();
  f.tick(hand(.8));f.tick(hand(.2));f.tick(hand(.2,.6));f.tick(hand(.8,.6));
  assert.equal(f.saved.length,1);assert.equal(f.saved[0].operation,'create');assert.equal(f.saved[0].object.tool,'pen');
  assert.ok(f.saved[0].object.points.length>=2);assert.ok(f.context.MR_ADAPTER.active['canvas-btn']);
  assert.ok(f.saved[0].object.points.every(p=>Math.abs(p[1]-.38)<1e-8),'drawing follows the offset ring');
  f.tick(hand(.2));f.tick(null);f.tick(hand(.8));assert.equal(f.saved.length,1,'lost hand cancels unfinished stroke');
  f.events['mr-transform']();f.tick(hand(.2));f.tick(hand(.8));assert.equal(f.saved.length,1,'changed alignment blocks input');
  assert.match(f.ids['mr-hand-status'].textContent,/Calibrate table corners/,'missing calibration remains visible after detecting a hand');
  f.context.document.hidden=true;f.documentEvents.visibilitychange();assert.deepEqual(f.resources(),{closed:1,stopped:1});
  const race=await fixture();let resolve;race.setRequest(()=>new Promise(r=>resolve=r));
  const starting=race.ids['mr-hand-start'].onclick();race.ids['mr-hand-stop'].onclick();
  resolve({getTracks:()=>[{stop(){race.lateStopped=true;}}]});await starting;
  assert.equal(race.lateStopped,true,'Stop during permission request releases a late stream');
  const aligned=await fixture();await aligned.ids['mr-hand-start'].onclick();aligned.calibrate();
  aligned.ids['mr-hand-mode'].value='select';await aligned.ids['mr-hand-mode'].onchange();
  aligned.ids['mr-hand-flip-x'].checked=aligned.ids['mr-hand-flip-y'].checked=true;
  aligned.ids['mr-hand-offset-x'].value='10';aligned.ids['mr-hand-offset-y'].value='-10';
  aligned.ids['mr-hand-flip-x'].onchange();aligned.tick(hand(.8,.2,.3));aligned.tick(hand(.2,.2,.3));
  assert.ok(Math.abs(aligned.selections[0][0]-.85)<1e-8,'horizontal flip and centimetre offset');
  assert.ok(Math.abs(aligned.selections[0][1]-.48)<1e-8,'vertical flip, alignment correction, and cursor offset');
  aligned.ids['mr-hand-marker-side'].value='left';aligned.ids['mr-hand-marker-distance'].value='20';
  aligned.ids['mr-hand-marker-side'].onchange();aligned.tick(hand(.8,.2,.3));aligned.tick(hand(.2,.2,.3));
  assert.ok(Math.abs(aligned.selections[1][0]-.75)<1e-8,'left cursor offset changes the actual selection target');
  aligned.ids['mr-hand-stop'].onclick();
  const seamless=await fixture();await seamless.ids['mr-hand-start'].onclick();seamless.calibrate();
  seamless.ids['mr-hand-mode'].value='select';await seamless.ids['mr-hand-mode'].onchange();seamless.tick(hand(.8));
  const flexed=hand(.2);flexed[8]={x:.36,y:.64};flexed[4]={x:.4,y:.64};
  const shifted=flexed.map(p=>({x:p.x+.04,y:p.y}));seamless.tick(shifted);
  assert.equal(seamless.selections.length,1);
  assert.ok(Math.abs(seamless.selections[0][0]-.5)<1e-8,'EPC target locks before the pinch moves the palm or index finger');
  const shadowOverlay=seamless.context.document.body.children[1];
  assert.ok(Math.abs(shadowOverlay.children.at(-1).attributes.cx-320)<1e-8,'visible EPC ring stays on the locked selection target');
  seamless.tick(null);assert.equal(shadowOverlay.children.length,0,'hand loss removes both the shadow and cursor');
  seamless.ids['mr-hand-stop'].onclick();
  const storage=new Map(),original=await fixture('?handTracking=1',storage);
  await original.ids['mr-hand-start'].onclick();original.calibrate();
  original.ids['mr-hand-flip-x'].checked=true;original.ids['mr-hand-offset-x'].value='5';original.ids['mr-hand-flip-x'].onchange();
  original.ids['mr-hand-marker-side'].value='left';original.ids['mr-hand-marker-distance'].value='20';original.ids['mr-hand-marker-side'].onchange();
  original.ids['mr-hand-stop'].onclick();
  const restored=await fixture('?handTracking=1',storage);await restored.ids['mr-hand-start'].onclick();
  assert.match(restored.ids['mr-hand-status'].textContent,/calibration restored/);
  assert.equal(restored.ids['mr-hand-flip-x'].checked,true);assert.equal(restored.ids['mr-hand-offset-x'].value,'5');
  assert.equal(restored.ids['mr-hand-marker-side'].value,'left');restored.tick(hand(.8));
  assert.equal(restored.context.document.body.children[1].children.filter(el=>el.attributes?.['data-hand-cursor']==='target').length,1,'restored calibration immediately shows cursor without targets');
  const different=await fixture('?handTracking=1',storage);different.video.videoWidth=1280;
  await different.ids['mr-hand-start'].onclick();assert.match(different.ids['mr-hand-status'].textContent,/projected number 1/,'changed camera dimensions require calibration');
  restored.events['mr-transform']();assert.equal(storage.size,0,'projector alignment change invalidates saved calibration');
  storage.set('mr-hand-calibration-v1:external','broken JSON');
  const corrupt=await fixture('?handTracking=1',storage);await corrupt.ids['mr-hand-start'].onclick();
  assert.match(corrupt.ids['mr-hand-status'].textContent,/projected number 1/,'invalid saved data falls back to calibration');
  console.log('Hand runtime: building selection, shared drawing, loss cancellation, alignment invalidation, visibility cleanup, and startup cancellation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
