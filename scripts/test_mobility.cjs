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
assert.deepEqual(core.position({legs:[]},0),{coordinate:null,waiting:false,arrived:true});
const data=JSON.parse(fs.readFileSync('media/universeum/mobility/journeys.json'));
const pairedTrips=data.metadata.journeyTrips??data.metadata.qualifyingTrips;
assert.equal(data.tracks.length,pairedTrips*2);
for(const walker of ['medium','slow'])assert.equal(data.tracks.filter(t=>t.walker===walker).length,pairedTrips);
let gaps=0;
for(const t of data.tracks){
 assert.equal(core.position(t,t.finish).arrived,true);
 for(let i=1;i<t.legs.length;i++){const previous=t.legs[i-1],next=t.legs[i],end=previous.start+previous.duration;
  if(next.start>end+.1){gaps++;const p=core.position(t,(end+next.start)/2);assert.equal(p.waiting,true);assert.deepEqual(p.coordinate,previous.coordinates.at(-1));}}
}
assert.ok(gaps>0,'Research itineraries preserve waiting intervals');
const departures=['06:25','06:49','07:15','07:38','08:09','08:31','09:02','09:30'];
const gridMetadata={routingDate:'2026-09-22',sampling:'Eight morning departures',originSpacingMetres:100,displaySpacingMetres:50,interpolation:{neighbours:4,maximumMetres:150},districtScope:'Origins within the table area'};
const continuousBins=[0,5,10,15,20,25,30],continuousColors=['#ffffb2','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#b10026'];
assert.deepEqual(core.legend(continuousBins,continuousColors,'continuous').map(entry=>entry.label),['0 min','5 min','10 min','15 min','20 min','25 min','30+ min']);
assert.equal(core.legend([0,.5,1],['a','b','c'])[0].label,'0–0.5 min');
assert.deepEqual(core.colorExpression([0,10],['white','red'],'continuous'),['interpolate',['linear'],['get','delay'],0,'white',10,'red']);
const gridNote=core.note({key:'slow_walkers',statistics:gridMetadata});
for(const text of ['2026-09-22','100 m','50 m','4 valid origins','150 m'])assert.ok(gridNote.includes(text),gridNote);
assert.ok(!gridNote.includes('Chalmers'));assert.ok(!gridNote.includes('500 m'));
assert.equal(core.note({key:'slow_walkers',statistics:{note:'Prepared metadata explanation'}}),'Prepared metadata explanation');
const districtSummary=core.summary({key:'slow_walkers',ready:true,departure:7,departures,completedDepartures:8,plannedDepartures:8,districtScope:gridMetadata.districtScope,maximumDistrict:{name:'Test',value:12.5}});
assert.ok(districtSummary.includes('09:30'));assert.ok(districtSummary.includes('8 of 8'));assert.ok(districtSummary.includes('origins within the table area'));assert.ok(!districtSummary.includes('whole area'));
assert.ok(core.summary({key:'synthpop',ready:true,statistics:{localRoutedTrips:10,localRoutedResidents:9,failedPairs:2},journeysAvailable:false}).includes('10 routed healthcare trips from 9 synthetic residents'));
for(const message of [{type:'synthpop_control',action:'play'},{type:'slow_walkers_control',action:'set_departure',value:3}])assert.equal(MR.validControl(message),true);
const bulky={features:[{payload:'geometry'.repeat(10000)}]},state={participants:[],table:{},synthpop:{...data.metadata,key:'synthpop',note:'Healthcare departures 07:00–15:00',journeysAvailable:false,journeyUnavailableReason:'No complete paired journeys lose more than one minute.',statistics:{...data.metadata,localRoutedResidents:9,failedPairs:2,journeyTrips:0,geometry:bulky},journeys:bulky},slow_walkers:{key:'slow_walkers',departure:7,departures,legendMode:'continuous',note:gridNote,routingDate:'2026-09-22',districtScope:gridMetadata.districtScope,geometry:bulky}};
assert.ok(!JSON.stringify(project(state,{layer:'slow-walkers-btn'})).includes('geometry'));
assert.ok(!JSON.stringify(project(state,{layer:'synthpop-heatmap-btn'})).includes('geometry'));
assert.equal(project(state,{layer:'slow-walkers-btn'}).slow_walkers.departures.length,8);
assert.equal(project(state,{layer:'slow-walkers-btn'}).slow_walkers.note,gridNote);
assert.equal(project(state,{layer:'slow-walkers-btn'}).slow_walkers.legendMode,'continuous');
assert.equal(project(state,{layer:'synthpop-heatmap-btn'}).synthpop.journeysAvailable,false);
assert.equal(project(state,{layer:'synthpop-heatmap-btn'}).synthpop.statistics.failedPairs,2);
assert.equal(project(state,{layer:'synthpop-heatmap-btn'}).synthpop.statistics.localRoutedResidents,9);
// Exercise the shared phone/staff controls, including a read-only spectator
// and a prepared heatmap that has no valid paired animation cohort.
function controlsTests(){
 class Element{
  constructor(tag,text=''){this.tagName=tag.toUpperCase();this.textContent=text;this.children=[];this.style={};this.dataset={};this.classList={add(){}};this.value='';}
  setAttribute(key,value){this[key]=value;}
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  add(option){this.append(option);if(this.options.length===1)this.value=option.value;}
  get options(){return this.children.filter(child=>child.tagName==='OPTION');}
 }
 const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text),activeElement:null},window={MR_MOBILITY_CORE:core,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('controller/mobility-dashboard.js','utf8'),{window,document,Option:class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},BroadcastChannel:class{addEventListener(){}close(){}}});
 const controls=new window.MR_MOBILITY_CONTROLS(new Element('section'),()=>{});
 controls.open('synthpop-heatmap-btn');controls.update({...state.synthpop,ready:true,active:true,view:'heatmap',duration:0,statistics:{localRoutedTrips:10,localRoutedResidents:9}},true);
 assert.equal(controls.inputs.find(input=>input.key==='view').input.options.find(option=>option.value==='journeys').disabled,true);
 for(const action of ['play','restart'])assert.equal(controls.buttons.find(button=>button.dataset.action===action).disabled,true);
 assert.ok(controls.summary.textContent.includes('No complete paired journeys'));assert.equal(controls.note.textContent,state.synthpop.note);
 controls.open('slow-walkers-btn');controls.update({...state.slow_walkers,ready:true,active:true,legend:core.legend(continuousBins,continuousColors,'continuous'),completedDepartures:8,plannedDepartures:8},false);
 assert.equal(controls.departure.options.length,9);assert.ok(controls.inputs.every(({input})=>input.disabled));assert.ok(controls.buttons.every(button=>button.disabled));
 assert.ok(controls.legend.children[0].style.background.includes('linear-gradient'));assert.equal(controls.note.textContent,gridNote);
 controls.update({...state.slow_walkers,ready:true,active:true,legend:core.legend(continuousBins,continuousColors,'continuous'),completedDepartures:8,plannedDepartures:8},true);assert.equal(controls.departure.disabled,false);
}
controlsTests();
// Run the actual host lifecycle: stale loads, seeks, pause, disable and source disposal.
async function hostTests(){
 const entries={},sources=new Map(),layers=new Map(),tasks=new Map(),loads=[],messages=[];let serial=0;
 const context2d={clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
 const canvas=()=>({style:{},hidden:true,setAttribute(){},getContext:()=>context2d,remove(){this.removed=true;}});
 const map={getContainer:()=>({getBoundingClientRect:()=>({left:0,top:0})}),project:c=>({x:c[0],y:c[1]}),on(){},off(){},getSource:id=>sources.get(id),addSource(id,options){sources.set(id,{data:options.data,setData(value){this.data=value;}});},getLayer:id=>layers.get(id),addLayer(l){layers.set(l.id,l);},setFilter(){},setLayoutProperty(id,key,value){layers.get(id).layout={[key]:value};},removeLayer:id=>layers.delete(id),removeSource:id=>sources.delete(id)};
 const window={MR_MOBILITY_CORE:core,MR_RENDER:{map,ready:Promise.resolve()},map,MR_LAYERS:{register:(id,api)=>entries[id]=api},MR_FRAMES:{request(owner,fn){const id=++serial;tasks.set(id,fn);return id;},cancel:id=>tasks.delete(id),recordRender(){}},mrAsset:p=>p,getTableLayout:()=>({left:0,top:0,w:100,h:100}),addEventListener(){},removeEventListener(){},dispatchEvent(){}};
 const document={hidden:false,addEventListener(){},createElement:canvas,body:{append(){}}};
 const fixtures={'synthpop.geojson':{type:'FeatureCollection',features:[],metadata:{bins:[0,1],colors:['white','red'],destination:{coordinates:[50,50]},qualifyingTrips:1,journeyTrips:1,note:'Healthcare departures 07:00–15:00'}},'journeys.json':{duration:30,tracks:[{...track,walker:'medium'},{...track,walker:'slow'}]},'slow-walkers.geojson':{features:[{properties:{values:[5,null,0,15,20,25,30,35,40]}}],metadata:{...gridMetadata,bins:continuousBins,colors:continuousColors,legendMode:'continuous',departures,completedDepartures:8,plannedDepartures:8}},'districts.geojson':{features:[{properties:{name:'Test',values:[5,null,0,15,20,25,30,35,40]}}]}};
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
 assert.equal(slowApi.getState().departures.length,8);assert.equal(slowApi.getState().note,gridNote);
 assert.equal(layers.get('slow-walkers-fill').paint['fill-color'][0],'interpolate');assert.equal(layers.get('slow-walkers-fill').paint['fill-antialias'],false);assert.equal(layers.get('slow-walkers-fill').paint['fill-outline-color'],undefined);
 slowApi.control({type:'slow_walkers_control',action:'set_departure',value:0});assert.equal(sources.get('slow-walkers-cells').data.features[0].properties.delay,null);
 slowApi.control({type:'slow_walkers_control',action:'set_departure',value:1});assert.equal(sources.get('slow-walkers-cells').data.features[0].properties.delay,0);
 slowApi.control({type:'slow_walkers_control',action:'set_departure',value:7});assert.equal(sources.get('slow-walkers-cells').data.features[0].properties.delay,40);
 slowApi.control({type:'slow_walkers_control',action:'play'});for(let i=0;i<=31;i++){const [task,callback]=tasks.entries().next().value;tasks.delete(task);callback(i*100);}assert.equal(slowApi.getState().departure,0,'Loop includes all eight departures before wrapping');slow.disable();assert.equal(tasks.size,0);slow.dispose();
 // A second host with a valid heatmap and no paired journeys stays usable,
 // without accepting phone commands that would start empty animation work.
 fixtures['journeys.json']={duration:0,tracks:[]};fixtures['synthpop.geojson'].metadata.journeyTrips=0;fixtures['synthpop.geojson'].metadata.qualifyingTrips=0;
 vm.runInNewContext(fs.readFileSync('animations/mobility.js','utf8'),{window,document,AbortController,CustomEvent:function(){},BroadcastChannel:class{postMessage(m){messages.push(m);}addEventListener(){}close(){}},fetch:async url=>({ok:true,json:async()=>fixtures[url.split('/').at(-1)]})});
 const emptySynth=entries['synthpop-heatmap-btn'];await emptySynth.enable(()=>true);const emptyApi=window.MR_MOBILITY.synthpop;
 assert.equal(emptyApi.getState().ready,true);assert.equal(emptyApi.getState().journeysAvailable,false);assert.equal(emptySynth.getEnabled(),true);
 for(const message of [{action:'set_view',value:'journeys'},{action:'play'},{action:'restart'},{action:'set_time',value:0}])emptyApi.control({type:'synthpop_control',...message});
 assert.equal(emptyApi.getState().view,'heatmap');assert.equal(emptyApi.getState().playing,false);assert.equal(tasks.size,0);assert.ok(emptyApi.getState().journeyUnavailableReason.includes('No complete paired journeys'));emptySynth.disable();emptySynth.dispose();
}
hostTests().then(()=>console.log('PASS mobility: research timing, metadata explanations, eight departures, continuous shading, empty cohorts, compact phones and released animation work')).catch(e=>{console.error(e);process.exitCode=1;});
