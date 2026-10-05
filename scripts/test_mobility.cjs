const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../animations/mobility-core.js'),MR=require('../session/js/shared.js');
const {project}=require('../session/js/phone-state.js');
const leg=(start,duration,coordinates,stations=[0,1])=>({start,duration,coordinates,stations});
const track={legs:[leg(0,10,[[0,0],[10,0]]),leg(20,10,[[10,0],[10,10]])]};
assert.deepEqual(core.position(track,5).coordinate,[5,0]);
assert.deepEqual(core.position(track,15),{coordinate:[10,0],waiting:true,arrived:false});
assert.deepEqual(core.position(track,25).coordinate,[10,5]);
assert.equal(core.position(track,30).arrived,true);
const bent={legs:[leg(0,20,[[0,0],[9,0],[9,1]],[0,.9,1])]};
assert.deepEqual(core.position(bent,10).coordinate,[5,0]);
const data=JSON.parse(fs.readFileSync('media/universeum/mobility/journeys.json'));
assert.equal(data.tracks.length,350);
for(const walker of ['medium','slow'])assert.equal(data.tracks.filter(t=>t.walker===walker).length,175);
let gaps=0;
for(const t of data.tracks){
 assert.equal(core.position(t,t.finish).arrived,true);
 for(let i=1;i<t.legs.length;i++){const previous=t.legs[i-1],next=t.legs[i],end=previous.start+previous.duration;
  if(next.start>end+.1){gaps++;const p=core.position(t,(end+next.start)/2);assert.equal(p.waiting,true);assert.deepEqual(p.coordinate,previous.coordinates.at(-1));}}
}
assert.ok(gaps>0,'Research itineraries preserve waiting intervals');
for(const message of [{type:'synthpop_control',action:'play'},{type:'slow_walkers_control',action:'set_departure',value:3}])assert.equal(MR.validControl(message),true);
const bulky={features:[{payload:'geometry'.repeat(10000)}]},state={participants:[],table:{},synthpop:{...data.metadata,key:'synthpop',statistics:{...data.metadata,geometry:bulky},journeys:bulky},slow_walkers:{key:'slow_walkers',departure:2,geometry:bulky}};
assert.ok(!JSON.stringify(project(state,{layer:'slow-walkers-btn'})).includes('geometry'));
assert.ok(!JSON.stringify(project(state,{layer:'synthpop-heatmap-btn'})).includes('geometry'));
// Run the actual host lifecycle: stale loads, seeks, pause, disable and source disposal.
async function hostTests(){
 const entries={},sources=new Map(),layers=new Map(),tasks=new Map(),loads=[],messages=[];let serial=0;
 const context2d={clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
 const canvas=()=>({style:{},hidden:true,setAttribute(){},getContext:()=>context2d,remove(){this.removed=true;}});
 const map={getContainer:()=>({getBoundingClientRect:()=>({left:0,top:0})}),project:c=>({x:c[0],y:c[1]}),on(){},off(){},getSource:id=>sources.get(id),addSource(id,options){sources.set(id,{data:options.data,setData(value){this.data=value;}});},getLayer:id=>layers.get(id),addLayer(l){layers.set(l.id,l);},setFilter(){},setLayoutProperty(id,key,value){layers.get(id).layout={[key]:value};},removeLayer:id=>layers.delete(id),removeSource:id=>sources.delete(id)};
 const window={MR_MOBILITY_CORE:core,MR_RENDER:{map,ready:Promise.resolve()},map,MR_LAYERS:{register:(id,api)=>entries[id]=api},MR_FRAMES:{request(owner,fn){const id=++serial;tasks.set(id,fn);return id;},cancel:id=>tasks.delete(id),recordRender(){}},mrAsset:p=>p,getTableLayout:()=>({left:0,top:0,w:100,h:100}),addEventListener(){},removeEventListener(){},dispatchEvent(){}};
 const document={hidden:false,addEventListener(){},createElement:canvas,body:{append(){}}};
 const fixtures={'synthpop.geojson':{type:'FeatureCollection',features:[],metadata:{bins:[0,1],colors:['white','red'],destination:{coordinates:[50,50]},qualifyingTrips:1}},'journeys.json':{duration:30,tracks:[{...track,walker:'medium'},{...track,walker:'slow'}]},'slow-walkers.geojson':{features:[{properties:{values:[5,null,0,15,20,25,30]}}],metadata:{bins:[0,5],colors:['white','red'],departures:['06:25','06:49','07:15','07:38','08:09','08:31'],completedDepartures:6,plannedDepartures:32}},'districts.geojson':{features:[{properties:{name:'Test',values:[5,null,0,15,20,25,30]}}]}};
 vm.runInNewContext(fs.readFileSync('animations/mobility.js','utf8'),{window,document,AbortController,CustomEvent:function(){},BroadcastChannel:class{postMessage(m){messages.push(m);}addEventListener(){}close(){}},fetch:(url)=>new Promise(resolve=>loads.push(()=>resolve({ok:true,json:async()=>fixtures[url.split('/').at(-1)]})))});
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const synth=entries['synthpop-heatmap-btn'];let desired=true;
 const stale=synth.enable(()=>desired);await flush();desired=false;synth.disable();loads.splice(0).forEach(f=>f());await stale;assert.equal(synth.getEnabled(),false);assert.equal(tasks.size,0);
 desired=true;const loading=synth.enable(()=>desired);await flush();loads.splice(0).forEach(f=>f());await loading;assert.equal(synth.getEnabled(),true);
 const api=window.MR_MOBILITY.synthpop;api.control({type:'synthpop_control',action:'set_view',value:'journeys'});api.control({type:'synthpop_control',action:'set_time',value:30});assert.equal(api.getState().arrivals.medium,1);assert.equal(api.getState().arrivals.slow,1);
 api.control({type:'synthpop_control',action:'restart'});assert.equal(api.getState().timeSeconds,0);api.control({type:'synthpop_control',action:'play'});assert.equal(tasks.size,1);api.control({type:'synthpop_control',action:'pause'});assert.equal(tasks.size,0);
 api.control({type:'synthpop_control',action:'play'});synth.disable();assert.equal(tasks.size,0);assert.equal(api.getState().playing,false);synth.dispose();assert.equal(sources.size,0);
 const slow=entries['slow-walkers-btn'],promise=slow.enable(()=>true);await flush();loads.splice(0).forEach(f=>f());await promise;
 const slowApi=window.MR_MOBILITY.slow_walkers;assert.equal(slowApi.getState().departure,-1);
 slowApi.control({type:'slow_walkers_control',action:'set_departure',value:0});assert.equal(sources.get('slow-walkers-cells').data.features[0].properties.delay,null);
 slowApi.control({type:'slow_walkers_control',action:'set_departure',value:1});assert.equal(sources.get('slow-walkers-cells').data.features[0].properties.delay,0);
 slowApi.control({type:'slow_walkers_control',action:'play'});slow.disable();assert.equal(tasks.size,0);slow.dispose();
}
hostTests().then(()=>console.log('PASS mobility: research waiting gaps, paired arrivals, elapsed seeking, source isolation, cancellation and released animation work')).catch(e=>{console.error(e);process.exitCode=1;});
