const assert=require('node:assert/strict');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const filename=path.resolve(__dirname,'../animations/cfd-worker.js');
const core=path.resolve(__dirname,'../animations/cfd-core.js');
const wrapper=`const {parentPort}=require('node:worker_threads');
global.importScripts=()=>{global.CFD=require(${JSON.stringify(core)});};
global.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);
require('node:vm').runInThisContext(require('node:fs').readFileSync(${JSON.stringify(filename)},'utf8'));
parentPort.on('message',data=>global.onmessage({data}));`;
const worker=new Worker(wrapper,{eval:true});
let fields=0;
worker.on('message',data=>{if(data.type==='field')fields++;});
function next(predicate){return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{worker.off('message',listener);reject(Error('Worker test timeout'));},5000);
  function listener(data){if(data.type==='error'){clearTimeout(timeout);worker.off('message',listener);reject(Error(data.message));}
    else if(predicate(data)){clearTimeout(timeout);worker.off('message',listener);resolve(data);}}
  worker.on('message',listener);
});}
(async()=>{try{
  const advancing=next(data=>data.solverProfile?.stepCount>0);
  worker.postMessage({type:'init',generation:4,profile:true,options:{nx:24,ny:16}});
  const report=await advancing;
  assert.ok(report.solverProfile.stepMs>0);assert.ok(report.solverProfile.snapshotMs>=0);
  const paused=next(data=>data.type==='profile-paused'&&data.paused);
  worker.postMessage({type:'profile-pause',generation:4,paused:true});await paused;
  const count=fields;await new Promise(resolve=>setTimeout(resolve,200));assert.equal(fields,count,'No snapshots while paused');
  const resumed=next(data=>data.type==='field'&&data.steps>report.steps);
  worker.postMessage({type:'profile-pause',generation:4,paused:false});await resumed;
  console.log('PASS opt-in timing and acknowledged pause/resume preserve advancing solver');
}finally{await worker.terminate();}})().catch(error=>{console.error(error);process.exitCode=1;});
