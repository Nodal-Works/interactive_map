/* Deterministic colour timing, compositing and optional asset failure coverage. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../animations/artwork-core.js');
const state={isActive:true,loading:false,error:null,chapter:0,fromChapter:0,transitioning:true,startedAt:1000,reducedMotion:false,colourAvailable:true,artworkCount:0};
C.resetColour(state,1000);
assert.equal(C.frame(state,11799).colourMix,0);assert.equal(C.frame(state,11800).base,1);assert.equal(C.frame(state,11800).colourMix,0);
for(const fps of [30,60,120]){
 let previous=0;for(let i=0;i<=fps*5;i++){const f=C.frame(state,11800+i*1000/fps);assert.ok(f.colourMix>=previous);previous=f.colourMix;}
 assert.equal(previous,1);
}
assert.equal(C.frame(state,14300).colourMix,.5);assert.equal(C.frame(state,16800).colourAnimating,false);
assert.equal(C.setAppearance(state,'line',12000),false,'Opening must finish before manual selection');
state.transitioning=false;C.setAppearance(state,'line',14300);assert.equal(C.frame(state,14300).colourMix,.5);
const mid=C.frame(state,14500).colourMix;C.setAppearance(state,'colour',14500);assert.equal(C.frame(state,14500).colourMix,mid,'Reversing starts at the currently rendered mix');
assert.equal(C.frame(state,15150).colourMix,1);
const recipe=JSON.stringify([state.appearance,state.colourFrom,state.colourStartedAt,state.colourDuration]);
C.transition(state,1,15000);assert.equal(JSON.stringify([state.appearance,state.colourFrom,state.colourStartedAt,state.colourDuration]),recipe);
C.resetColour(state,20000);assert.equal(C.frame(state,20000).colourMix,0);assert.equal(state.colourStartedAt,30800);
state.reducedMotion=true;C.resetColour(state,30000);assert.equal(state.colourStartedAt,30180);assert.equal(C.frame(state,30360).colourMix,1);
state.transitioning=false;C.setAppearance(state,'line',30360);assert.equal(C.frame(state,30360).colourMix,0);
assert.equal(C.colourFrame({}).colourMix,0,'Old state packets render lines');
assert.equal(C.setAppearance({...state,colourAvailable:false},'colour',0),false);

function context(){const calls=[],stack=[];const ctx={calls,globalAlpha:1,globalCompositeOperation:'source-over',save(){stack.push([this.globalAlpha,this.globalCompositeOperation]);},restore(){[this.globalAlpha,this.globalCompositeOperation]=stack.pop();},drawImage(image){calls.push([image.name,this.globalAlpha,this.globalCompositeOperation]);},createRadialGradient:()=>({addColorStop(){}})};return new Proxy(ctx,{get:(o,k)=>k in o?o[k]:(o[k]=()=>{})});}
const renderState={...state,chapter:1,fromChapter:1,artworkCount:1,transitioning:false,appearance:'colour',colourFrom:0,colourStartedAt:0,colourDuration:1000};
const manifest={stacking:[1]},items=[{id:1,fieldImage:{name:'field'},sculptureImage:{name:'sculpture'}}];
const scene=new C.Scene(manifest,{name:'base'},[],items,null,{name:'colour'}),ctx=context();
scene.draw(ctx,renderState,500);assert.deepEqual(ctx.calls.map(c=>c[0]),['base','colour','field','sculpture']);assert.equal(ctx.calls[0][1],.5);assert.equal(ctx.calls[1][1],.5);
ctx.calls.length=0;scene.draw(ctx,renderState,1000);assert.deepEqual(ctx.calls.map(c=>c[0]),['colour','field','sculpture'],'Complete colour replaces linework');
ctx.calls.length=0;scene.draw(ctx,renderState,500,{skipBase:true});assert.equal(ctx.calls[0][0],'colour','Magnifier receives colour above its cached linework');
scene.colour=null;ctx.calls.length=0;scene.draw(ctx,renderState,1000);assert.equal(ctx.calls[0][0],'base');assert.equal(ctx.calls[0][1],1,'Local colour failure retains the complete line layer');

const canvases=[];const document={baseURI:'https://example.test/',createElement(){const c={name:'canvas-'+canvases.length,width:300,height:150,ctx:context(),getContext(type){return type==='webgl'?null:this.ctx;},getBoundingClientRect:()=>({width:600})};canvases.push(c);return c;}};
const env={document,devicePixelRatio:1};env.window=env;vm.runInNewContext(fs.readFileSync(require.resolve('../animations/artwork-core.js'),'utf8'),env);
const target=document.createElement('canvas'),lens=new env.ArtworkCore.Lens(target);let vectors=0;
const lensScene={colour:{},lines(){vectors++;},draw(){},awaken(){}};
const lensState={...renderState,lens:{x:.4,y:.6,span:400}};
lens.draw(lensScene,lensState,250);lens.draw(lensScene,lensState,750);assert.equal(vectors,2,'Changing colour never invalidates cached vectors');
lens.source.ctx.calls.length=0;lens.draw(lensScene,lensState,1000);assert.ok(!lens.source.ctx.calls.some(c=>c[2]==='screen'),'Fully coloured magnifier has no white line glow');lens.dispose();

(async()=>{
 for(const failure of ['missing','decode',null]){
  const m={base:'base.svg',items:[],stacking:[],colour:'colour-test.webp'},revoked=[];
  const env={document:{baseURI:'https://example.test/'},URL:class extends URL{static createObjectURL(blob){return blob.type==='image/webp'?'blob:colour':'blob:base';}static revokeObjectURL(url){revoked.push(url);}},Blob,DOMException,
   Image:class{set src(url){queueMicrotask(()=>url==='blob:colour'&&failure==='decode'?this.onerror():this.onload());}},
   DOMParser:class{parseFromString(){return {querySelectorAll:()=>[]};}},
   fetch:async url=>String(url).endsWith('manifest.json')?{ok:true,json:async()=>m}:String(url).endsWith('.webp')?{ok:failure!=='missing',blob:async()=>new Blob(['colour'],{type:'image/webp'})}:{ok:true,text:async()=>'<svg/>'}};
  env.window=env;vm.runInNewContext(fs.readFileSync(require.resolve('../animations/artwork-core.js'),'utf8'),env);
  const loaded=await env.ArtworkCore.Scene.load();assert.equal(!!loaded.colour,!failure);assert.ok(loaded.base);assert.ok(revoked.includes('blob:base'));if(failure!=='missing')assert.ok(revoked.includes('blob:colour'));
 }
 console.log('PASS colour timing at 30/60/120fps, reversible switching, chapter preservation, replay, reduced motion, layering, lens cache/glow and optional fetch/decode fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
