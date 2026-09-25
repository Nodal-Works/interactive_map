const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
// Exercise the production lifecycle with controlled data loading and map effects.
const source=fs.readFileSync('animations/ecom-energy.js','utf8');
function fixture(){
  const loads=[],events=[],visibility=[];
  const context=vm.createContext({
    loadData:()=>new Promise((resolve,reject)=>loads.push({resolve,reject})),
    addLayers(){},map:{getLayer:()=>true},NODE_LAYER_ID:'nodes',
    setLayerVisibility:on=>visibility.push(on),applyFilters(){},viewFilters:null,
    setHour(){},currentHour:0,window:{},heldCaption:null,showCaption(){},
    syncButton(){},quietTheStreets(){},ecomChannel:{postMessage:e=>events.push(e)},
    buildSummary:()=>null,announceKpis(){},setFlowMode(){},setUniform(){},endChange(){},
    previousBasemap:null,
  });
  vm.runInContext('let isActive=false,desiredActive=false,activationRevision=0,activationPromise=null;'+source.slice(source.indexOf('    async function activate(revision)'),source.indexOf('    function buildSummary()'))+'\nthis.setEnabled=setEnabled;this.toggle=toggle;this.active=()=>isActive;',context);
  return {context,loads,events,visibility};
}
(async()=>{
  let f=fixture(),p=f.context.setEnabled(true);
  assert.equal(f.context.setEnabled(true),p,'Duplicate enable shares activation');
  await f.context.setEnabled(false);f.loads[0].resolve(true);await p;
  assert.equal(f.context.active(),false,'Off during load cancels activation');
  assert.ok(!f.visibility.includes(true));
  p=f.context.setEnabled(true);f.loads[1].resolve(true);await p;
  assert.equal(f.context.active(),true);await f.context.setEnabled(false);assert.equal(f.context.active(),false);
  f=fixture();p=f.context.setEnabled(true);f.loads[0].resolve(false);
  await assert.rejects(p,/could not load/);assert.equal(f.context.active(),false);
  assert.equal(f.events.at(-1).isActive,false,'Failed load broadcasts authoritative off');
  p=f.context.setEnabled(true);f.loads[1].resolve(true);await p;assert.equal(f.context.active(),true,'Failure can be retried');
  f=fixture();p=f.context.setEnabled(true);await f.context.setEnabled(false);
  const newer=f.context.setEnabled(true);f.loads[1].resolve(true);await newer;
  f.loads[0].resolve(true);await p;
  assert.equal(f.events.filter(e=>e.type==='animation_state'&&e.isActive).length,1,'Stale activation cannot overwrite the latest request');
  const fetches=[];
  const dataContext=vm.createContext({Promise,console:{info(){},error(){}},prepare(){},fetch:()=>new Promise(resolve=>fetches.push(resolve))});
  vm.runInContext("let isLoaded=false,layerData=null,nodeData=null,flowData=null;const DATA_URL='buildings',NODES_URL='nodes',FLOWS_URL='flows';"+source.slice(source.indexOf('    let dataPromise ='),source.indexOf('    // The per-feature fields'))+"this.loadData=loadData;this.replace=()=>{dataRevision++;isLoaded=true;layerData={newer:true};};this.data=()=>layerData;",dataContext);
  const load=dataContext.loadData();assert.equal(dataContext.loadData(),load,'Concurrent activations share one export fetch');
  assert.equal(fetches.length,3);
  dataContext.replace();for(const resolve of fetches)resolve({ok:true,json:async()=>({features:[]})});
  assert.equal(await load,true);assert.equal(dataContext.data().newer,true,'An arriving export cannot replace a newer service result');
  const updates=[];
  const cacheContext=vm.createContext({prepare(){},map:{getSource:id=>({setData:data=>updates.push({id,data})})}});
  vm.runInContext("let dataRevision=0,layerKpis=null,layerHours=null,layerData=null,nodeData=null,flowData=null,change=null,solarSweep=0,isActive=false,isLoaded=false;const SOURCE_ID='buildings',NODES_SOURCE_ID='nodes',FLOWS_SOURCE_ID='flows';"+source.slice(source.indexOf('    function applyLayer(layer)'),source.indexOf("    // What the controller\'s View group"))+"this.apply=applyLayer;this.loaded=()=>isLoaded;",cacheContext);
  cacheContext.apply({buildings:{features:[]},nodes:{features:[]},flows:{features:[]}});
  assert.equal(updates.length,3,'Late service results update cached geometry while off');
  assert.equal(cacheContext.loaded(),true);
  console.log('PASS: ECOM repeated enable, cancellation, retry, failure state, stale activation, data loading and late results');
})().catch(error=>{console.error(error);process.exitCode=1;});
