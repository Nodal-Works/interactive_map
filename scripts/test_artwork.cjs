const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),C=require('../animations/artwork-core.js'),MR=require('../session/js/shared.js');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'media/artwork/manifest.json')));
assert.equal(manifest.items.length,10);assert.equal(new Set(manifest.stacking).size,10);
for(const item of manifest.items){for(const key of ['field','sculpture'])assert.ok(fs.statSync(path.join(root,'media/artwork',item[key])).size>0);assert.equal(item.fieldBounds.length,4);assert.ok(item.anchor.every(Number.isFinite));}
assert.ok(fs.statSync(path.join(root,'media/artwork',manifest.locations)).size>0);
assert.deepEqual(manifest.stacking,[10,9,8,7,6,5,4,3,2,1]);
assert.ok(manifest.registration.rmsGroundMetres<.1);assert.ok(manifest.registration.validationPoints.every(p=>p.residualGroundMetres<.3));
for(const size of [[1920,1080],[3840,2160]]){const t=C.affine({x:100,y:200},{x:size[0]-100,y:250},{x:20,y:size[1]-50});for(const p of [[0,0],[3370,2384],[1685,1192]]){const q=t.forward(...p),back=t.inverse(q.x,q.y);assert.ok(Math.abs(p[0]-back.x)<1e-8);assert.ok(Math.abs(p[1]-back.y)<1e-8);}}
let state={isActive:true,loading:false,error:null,chapter:0,fromChapter:0,transitioning:true,startedAt:1000,reducedMotion:false};
assert.equal(C.frame(state,1000).black,0);assert.equal(C.frame(state,1800).black,1);assert.equal(C.duration(0,false),10800);assert.ok(C.frame(state,4800).base<.5);assert.equal(C.frame(state,11800).base,1);assert.equal(C.frame(state,11800).done,true);
for(let chapter=1;chapter<=manifest.items.length;chapter++){
 const time=chapter*10000;assert.ok(C.transition(state,chapter,time));assert.equal(C.frame(state,time).fields[chapter-1].reveal,0);
 for(const fps of [30,60,120]){let f;for(let i=0;i<=fps*4;i++)f=C.frame(state,time+i*1000/fps);assert.ok(f.done);assert.equal(f.fields[chapter-1].opacity,1);f.fields.forEach((field,i)=>{if(i<chapter-1)assert.equal(field.opacity,.25);if(i>=chapter)assert.equal(field.opacity,0);});}
}
assert.equal(C.frame(state,104000).locationsOpacity,0,'Location overview stays hidden during chapters');
C.transition(state,C.finale(state),90000);assert.ok(C.frame(state,92000).fields.every(v=>v.opacity===.68&&v.reveal===1));
assert.equal(C.frame(state,92000).locationsOpacity,1);
C.transition(state,0,93000);assert.ok(C.frame(state,93000).fields.every(v=>v.opacity===0),'Replay must not reveal future artwork');
assert.equal(C.frame(state,93000).locationsOpacity,0);
// A future source count must not turn chapter 8 into an early finale.
for(const artworkCount of [7,10,12]){const variable={...state,artworkCount};assert.equal(C.frame(variable,93000).fields.length,artworkCount);assert.ok(C.transition(variable,artworkCount,94000));assert.equal(C.duration(artworkCount,false,artworkCount),3100);assert.ok(C.transition(variable,artworkCount+1,98000));assert.equal(C.duration(artworkCount+1,false,artworkCount),2000);assert.ok(C.frame(variable,100000).fields.every(f=>f.opacity===.68));assert.equal(C.transition(variable,artworkCount+2),false);}
state.reducedMotion=true;C.transition(state,1,94000);assert.ok(C.frame(state,94180).done);assert.equal(C.frame(state,94010).fields[0].reveal,1);
assert.equal(C.transition({...state,loading:true},2),false);assert.equal(C.transition({...state,isActive:false},2),false);assert.equal(C.transition(state,-1),false);assert.equal(C.transition(state,C.finale(state)+1),false);
for(let r=0;r<=.7;r+=.1)assert.equal(C.lensRadius(r),r);
let prev=0;for(let r=0;r<=1;r+=.001){const v=C.lensRadius(r);assert.ok(v>=prev,'Lens mapping folds over');assert.ok(v<=1);prev=v;}assert.equal(C.lensRadius(1),1);
for(const [action,value]of [['set_lens_position',{x:0,y:1}],['set_lens',true],['pin_lens',false],['set_zoom',3],['set_lens_diameter',600],['set_lens_diameter',960],['set_lens_diameter',2160],['next',undefined]])assert.ok(MR.validControl({type:'artwork_control',action,value}));
for(const [action,value]of [['set_lens_position',{x:-.1,y:.5}],['set_lens_position',{x:.5,y:Infinity}],['set_lens_position',{x:'0.5',y:.5}],['set_lens_position',{x:0,y:1,z:2}],['set_lens_position',[0,1]],['set_zoom',NaN],['set_zoom',7],['set_zoom','3'],['set_lens','true'],['pin_lens',{}],['set_lens_diameter',0],['set_lens_diameter',2161],['set_geometry',0],['next',5]])assert.equal(MR.validControl({type:'artwork_control',action,value}),false);
assert.ok(MR.LAYERS.some(l=>l.id==='artwork-btn'));
console.log('PASS Artwork assets, independent registration, 1080p/4K transforms, timing at 30/60/120fps, no future reveals, reduced motion, lens continuity and remote validation');
// Exercise the actual compositor's fallback and static-vector cache without a GPU.
const vm=require('node:vm');let vectorDraws=0,sceneDraws=0;
const fakeContext=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(o[k]=()=>{})});
let lensCssWidth=720;
const makeCanvas=()=>({width:300,height:150,getContext:type=>type==='webgl'?null:fakeContext,getBoundingClientRect:()=>({width:lensCssWidth})});
const environment={document:{createElement:makeCanvas},devicePixelRatio:2};environment.window=environment;
vm.runInNewContext(fs.readFileSync(path.join(root,'animations/artwork-core.js'),'utf8'),environment);
const target=makeCanvas(),lens=new environment.ArtworkCore.Lens(target),scene={awaken(){},lines(){vectorDraws++;},draw(){sceneDraws++;}};
const lensState={...state,lens:{x:.4,y:.6,span:300}};
lens.draw(scene,lensState,95000);lens.draw(scene,lensState,96000);
assert.equal(lens.gl,null);assert.equal(target.width,1440);assert.equal(vectorDraws,2);assert.equal(sceneDraws,2);
lensState.lens.x=.6;lens.draw(scene,lensState,97000);assert.equal(vectorDraws,4);lensCssWidth=1900;lens.draw(scene,lensState,98000);assert.equal(target.width,2048,'4K lenses retain detail with a bounded render texture');lens.dispose();assert.equal(lens.source.width,1);
console.log('PASS circular Canvas fallback at 2× pixel density, native-resolution vector cache reuse/invalidation and disposal');

// The projection and lens share this renderer: neither may paint future assets.
const drawn=[];
const drawContext=new Proxy({drawImage:image=>drawn.push(image.name),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(o[k]=()=>{})});
const renderScene=new C.Scene(manifest,{name:'base'},[],manifest.items.map(item=>({...item,fieldImage:{name:`field-${item.id}`},sculptureImage:{name:`sculpture-${item.id}`}})),{name:'locations'});
for(let chapter=1;chapter<=10;chapter++){
 drawn.length=0;renderScene.draw(drawContext,{...state,chapter,fromChapter:chapter,artworkCount:10,transitioning:false},100000);
 for(let future=chapter+1;future<=10;future++)assert.ok(!drawn.includes(`field-${future}`)&&!drawn.includes(`sculpture-${future}`));
 assert.ok(!drawn.includes('locations'),'Overview markers are finale-only');
}
drawn.length=0;renderScene.draw(drawContext,{...state,chapter:11,fromChapter:10,artworkCount:10,transitioning:false},100000);
assert.deepEqual(drawn.filter(name=>name.startsWith('field-')),manifest.stacking.map(id=>`field-${id}`));
assert.ok(drawn.findIndex(name=>name.startsWith('sculpture-'))>drawn.lastIndexOf('field-1'));
assert.equal(drawn.at(-1),'locations');
console.log('PASS shared scene chapter isolation, source field stacking, sculptures above fields and finale location overlay');
