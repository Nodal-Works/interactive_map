const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../session/js/map.js'),'utf8');
function element(tag){return {tag,children:[],attrs:{},style:{},classList:{add(){}},clientWidth:390,clientHeight:500,
  setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(){},dispatchEvent(){}};}
function fixture(script='http://localhost:8097/session/js/map.js'){
  const requests=[],sources={},layers={},handlers={};let resolve;
  const map={on(event,fn){handlers[event]=fn;},loaded:()=>true,getLayer:id=>layers[id],getSource:id=>sources[id],
    setLayoutProperty(id,key,value){layers[id].layout[key]=value;},addSource(id,value){sources[id]=value;},addLayer(layer){layers[layer.id]=structuredClone(layer);},
    project:c=>({x:c[0],y:c[1]}),resize(){},fitBounds(){}};
  const context={window:{},document:{currentScript:{src:script},createElement:element,createElementNS:(ns,tag)=>element(tag)},URL,
    CustomEvent:class{},fetch:url=>{requests.push(String(url));return new Promise(r=>{resolve=r;});}};
  vm.runInNewContext(code,context);
  const view=new context.window.MR_MAP.CompanionMap({element:element('div'),map,send(){},identity:()=>({id:'one'})});
  return {view,requests,sources,layers,handlers,respond:body=>resolve(body)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const f=fixture();f.view.layer='canvas-btn';assert.equal(f.requests.length,0);
  f.view.layer='epc-btn';assert.equal(f.requests[0],'http://localhost:8097/media/building-footprints.geojson');
  f.view.layer='epc-btn';assert.equal(f.requests.length,1,'Coalesce requests while loading');
  f.view.layer='isovist-btn';
  f.respond({ok:true,json:async()=>({features:[{geometry:{type:'Polygon',coordinates:[]},properties:{energyRating:'A'}}]})});await flush();
  assert.equal(f.layers['phone-buildings-fill'].layout.visibility,'none','A late response must not show EPC geometry in another app');
  assert.deepEqual(Object.keys(f.sources['phone-buildings'].data.features[0].properties),[]);
  f.view.layer='epc-btn';assert.equal(f.layers['phone-buildings-outline'].layout.visibility,'visible');assert.equal(f.requests.length,1);
  f.view.layer='canvas-btn';assert.equal(f.layers['phone-buildings-outline'].layout.visibility,'none');
  const failed=fixture('https://example.org/universeum/session/js/map.js');failed.view.layer='epc-btn';
  assert.equal(failed.requests[0],'https://example.org/universeum/media/building-footprints.geojson');
  failed.respond({ok:false});await flush();assert.equal(failed.view.dataStatus.hidden,false);
  failed.view.layer='canvas-btn';assert.equal(failed.view.dataStatus.hidden,true);
  failed.view.layer='epc-btn';assert.equal(failed.requests.length,2,'Reopening retries a failed load');
  f.view.table={corners:[[30,40],[300,70],[270,400],[20,380]]};f.view.render();
  let boundary=f.view.svg.children.find(n=>n.attrs['data-table-boundary']);
  assert.ok(boundary);assert.equal(boundary.children.filter(n=>n.tag==='polygon').length,2);
  assert.equal(boundary.children.find(n=>n.tag==='path').attrs['fill-rule'],'evenodd');
  const before=boundary.children.find(n=>n.tag==='polygon').attrs.points;
  f.view.table.corners[0]=[50,60];f.view.render();boundary=f.view.svg.children.find(n=>n.attrs['data-table-boundary']);
  assert.notEqual(boundary.children.find(n=>n.tag==='polygon').attrs.points,before,'Outline follows calibrated corners');
  console.log('PASS: EPC lazy loading, app switching, geometry-only rendering, deployment paths, retry, calibrated table outline');
})().catch(error=>{console.error(error);process.exitCode=1;});
