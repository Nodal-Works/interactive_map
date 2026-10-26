/* Real dashboard orchestration with deterministic clock and canvas stand-ins. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../animations/artwork-core.js');
let now=1000,serial=0,raf=new Map(),draws=[],messages=[],colour=true,channel;
function element(){const classes=new Set(),queries=new Map();return {children:[],dataset:{},style:{},listeners:{},hidden:false,
 classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},
 setAttribute(k,v){this[k]=v;},getBoundingClientRect:()=>({width:500,height:350}),
 addEventListener(k,f){this.listeners[k]=f;},removeEventListener(k){delete this.listeners[k];},
 querySelector(s){if(!queries.has(s))queries.set(s,element());return queries.get(s);},querySelectorAll:()=>[],
 getContext:()=>new Proxy({},{get:(o,k)=>o[k]||(o[k]=()=>{})})};}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const buttons=['previous','next','set_lens','pin_lens','restart','show_all','retry'].map(action=>Object.assign(element(),{dataset:{artworkAction:action}}));
for(const appearance of ['line','colour'])buttons.push(Object.assign(element(),{dataset:{artworkAction:'set_appearance',appearance}}));
get('artwork-dashboard').querySelectorAll=s=>s==='[data-artwork-action]'?buttons:[];
const document={hidden:false,body:element(),getElementById:get,createElement:element,addEventListener(){},removeEventListener(){},querySelector:s=>buttons.find(b=>s.includes(b.dataset.artworkAction))};
const scene=()=>({manifest:{colour:'colour.webp'},colour:colour?{}:null,draw(ctx,state,time){draws.push({time,mix:C.colourFrame(state,time).colourMix});}});
const env={document,URLSearchParams,AbortController,location:{search:'?sessionController=1'},Date:{now:()=>now},performance:{now:()=>now},devicePixelRatio:1,
 requestAnimationFrame:f=>{raf.set(++serial,f);return serial;},cancelAnimationFrame:id=>raf.delete(id),setTimeout(){},clearTimeout(){},addEventListener(){},removeEventListener(){},
 BroadcastChannel:class{constructor(){channel=this;}postMessage(m){messages.push(m);}},
 ArtworkCore:{...C,Scene:{load:async()=>scene()},Lens:class{draw(){}dispose(){}}}};env.window=env;
vm.runInNewContext(fs.readFileSync(require.resolve('../controller/artwork-dashboard.js'),'utf8'),env);
const art={type:'artwork_state',isActive:true,chapter:0,fromChapter:0,transitioning:false,startedAt:-10000,sentAt:6000,reducedMotion:true,loading:false,error:null,colourAvailable:true,appearance:'colour',colourFrom:0,colourStartedAt:6000,colourDuration:5000,lens:{enabled:false,pinned:false,x:.5,y:.5,span:400,zoom:3}};
const receive=()=>channel.onmessage({data:{...art,lens:{...art.lens}}});
function tick(ms){now+=ms;const next=[...raf.values()];raf.clear();next.forEach(f=>f(now));}
(async()=>{
 env.ArtworkDashboard.show();receive();await new Promise(setImmediate);tick(2500);
 assert.equal(draws.at(-1).mix,.5,'Controller applies the host clock offset');assert.ok(raf.size,'Colour keeps reduced-motion preview rendering independently of chapters');
 tick(2500);assert.equal(draws.at(-1).mix,1);assert.equal(raf.size,0,'Preview sleeps after colour settles');
 const line=buttons.find(b=>b.dataset.appearance==='line');get('artwork-dashboard').listeners.click({target:{closest:()=>line}});assert.equal(messages.at(-1).action,'set_appearance');assert.equal(messages.at(-1).value,'line');
 document.body.classList.add('mr-readonly');const count=messages.length;get('artwork-dashboard').listeners.click({target:{closest:()=>line}});assert.equal(messages.length,count,'Read-only phone cannot change appearance');document.body.classList.remove('mr-readonly');
 art.lens.enabled=true;art.colourStartedAt=now+5000;art.sentAt=now+5000;receive();tick(1000);const previous=draws.length;tick(1000);assert.equal(draws.length,previous+1,'Navigator cache follows an independent colour fade');assert.equal(draws.at(-1).mix,C.ease(.4));
 art.isActive=false;receive();colour=false;art.isActive=true;art.sentAt=now;receive();await new Promise(setImmediate);
 assert.match(get('artwork-dashboard-status').textContent,/Colour unavailable/);assert.ok(buttons.filter(b=>b.dataset.artworkAction==='set_appearance').every(b=>b.disabled),'Failed local colour asset disables its controls');
 env.ArtworkDashboard.hide();assert.equal(raf.size,0);
 console.log('PASS dashboard host clock, independent colour render loop, switch forwarding, read-only phone, navigator cache, optional asset fallback and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
