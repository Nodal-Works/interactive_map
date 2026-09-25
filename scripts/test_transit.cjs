const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
 let now=100000,polls=0,resolve,requests=[];const intervals=new Map();
 const ctx=new Proxy({measureText:()=>({width:10}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
 const canvas={style:{},width:100,height:100,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0})};
 const sandbox={console:{log(){},warn(){},error(){}},URL,AbortController,Date:class extends Date{static now(){return now;}},
 document:{createElement:()=>canvas,getElementById:()=>canvas,body:{appendChild(){}}},map:{project:()=>({x:10,y:10})},computeOverlayPixelSize:()=>({w:100,h:100}),
 requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval:fn=>{intervals.set(1,fn);return 1;},clearInterval:id=>intervals.delete(id),
 fetch:async(url,options)=>{
  if(String(url)==='trafik-config.json')return {ok:true,json:async()=>({accessToken:'test-only',tokenExpiry:1e15,bbox:[11,57,12,58]})};
  polls++;requests.push({url:String(url),signal:options.signal});return new Promise(r=>resolve=r);
 },window:{addEventListener(){},APP_CONFIG:{area:{bounds:[11,57,12,58]},transit:{fetchInterval:10000,transportModes:['bus','tram','ferry']}}}};
 let source=fs.readFileSync('animations/trafik.js','utf8');
 source=source.replace('window.trafikAnimation = {','window.trafikAnimation = {update: updateVehicles,');vm.runInNewContext(source,sandbox);
 return {api:sandbox.window.trafikAnimation,intervals,get polls(){return polls;},requests,
 advance:ms=>now+=ms,reply:(status,data=[],retry=null)=>resolve({ok:status===200,status,headers:{get:()=>retry},json:async()=>data})};
}
(async()=>{
 const f=fixture(),start=f.api.start();await flush();assert.equal(f.polls,1);
 f.advance(20000);await f.api.update();assert.equal(f.polls,1,'Slow requests cannot overlap');
 const ferry={detailsReference:'ferry',latitude:57.7,longitude:11.9,line:{transportMode:'ferry',shortName:'286'}};
 f.reply(200,[ferry,{...ferry,detailsReference:'train',line:{transportMode:'train'}}]);await start;
 assert.equal(f.api.getVehicles().length,1);assert.equal(f.api.getVehicles()[0].type,'FERRY');assert.ok(f.requests[0].url.includes('lowerLeftLat=57'));
 let poll=f.api.update();await flush();f.reply(429,[],'45');await poll;
 f.advance(30000);await f.api.update();assert.equal(f.polls,2,'Retry-After delays polling');assert.equal(f.api.getVehicles().length,1);
 f.advance(15000);poll=f.api.update();await flush();f.reply(500);await poll;assert.equal(f.api.getVehicles().length,1,'Transient errors preserve vehicles');
 f.advance(10000);poll=f.api.update();await flush();f.api.stop();assert.equal(f.requests.at(-1).signal.aborted,true);f.reply(200,[ferry]);await poll;
 assert.equal(f.api.getVehicles().length,0);assert.equal(f.intervals.size,0);
 const restart=f.api.start();await flush();f.reply(429);await restart;f.advance(20000);await f.api.update();assert.equal(f.polls,5,'Fallback rate limit waits 30 seconds');
 f.advance(10000);poll=f.api.update();await flush();f.reply(200,[]);await poll;assert.equal(f.api.getVehicles().length,0);f.api.stop();
 console.log('PASS transit single-flight, Retry-After/fallback, ferry filtering, bounds override, transient errors, stop and restart');
})().catch(e=>{console.error(e);process.exitCode=1;});
