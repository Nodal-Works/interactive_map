const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const MR=require('../session/js/shared.js');
const slots=[null,null,null,null];
assert.equal(MR.claimSlot(slots,'a'),1);assert.equal(MR.claimSlot(slots,'b'),2);
assert.equal(MR.claimSlot(slots,'a'),1);assert.equal(MR.claimSlot(slots,'c',4),4);
assert.throws(()=>MR.claimSlot(slots,'d',4),/occupied/);assert.equal(MR.claimSlot(slots,'d'),3);
assert.throws(()=>MR.claimSlot(slots,'e'),/full/);assert.throws(()=>MR.claimSlot(slots,'e',0),/Invalid/);
slots[1]=null;assert.equal(MR.claimSlot(slots,'e'),2);
class Node {
 constructor(){this.children=[];this.dataset={};this.attrs={};this.style={};this.value='';this.hidden=false;this.classList={toggle(){},add(){},remove(){}};}
 append(...xs){this.children.push(...xs);}replaceChildren(...xs){this.children=xs;}
 set src(v){this.attrs.src=v;}get src(){return this.attrs.src;}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 addEventListener(type,fn){(this.events??={})[type]=fn;}showModal(){this.open=true;}close(){this.open=false;this.events?.close?.();}get options(){return this.children;}get selectedOptions(){return this.children.filter(x=>x.value===this.value);}
 querySelector(s){return this.children.flatMap(x=>[x,...x.children]).find(x=>x.className===s.slice(1));}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
const all=()=>[...nodes.values()].flatMap(function walk(n){return [n,...(n.children||[]).flatMap(walk)];});
let connection,map,controlEnabled,toolChanges=0;const sent=[];
const context={console,URL,URLSearchParams,crypto:webcrypto,MR,Peer:function(){},Option:class{constructor(text,value){this.text=text;this.value=value;}},
 location:new URL('http://localhost/session/client.html?host=test&token=test&release='+MR.RELEASE),
 document:{currentScript:{src:'http://localhost/session/js/client.js'},getElementById:get,createElement:()=>new Node(),querySelector:s=>get(s),querySelectorAll:()=>all().filter(n=>n.dataset?.layer),addEventListener(){},body:new Node()},
 localStorage:{getItem(){},setItem(){}},sessionStorage:{getItem(){},setItem(){}},
 setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn(),addEventListener(){},scrollTo(){},
 MR_CONTROLS:class{open(){}update(s,enabled){controlEnabled=enabled;}},
 MR_MAP:{thermalHint:()=>'',CompanionMap:class{constructor(){map=this;this.map={resize(){}};}setState(){}setTool(tool){toolChanges++;this.tool=tool;this.polygon=null;}cancel(){this.polygon=null;}}},
 MR_CONNECTION:class{constructor(options){connection=this;this.options=options;this.open=true;}start(){}send(m){sent.push(structuredClone(m));return true;}resume(){}stop(){this.open=false;}}};
context.window=context;vm.runInNewContext(fs.readFileSync('session/js/client.js','utf8'),context);
const me={id:connection.options.metadata.clientId,name:'Visitor',avatar:'fox',slot:null};
const state={type:'state',sessionId:'test',participants:[me],slots:[null,null,null,null],layers:{},table:{revision:1}};
const emit=()=>connection.options.onMessage(structuredClone(state));emit();
assert.equal(get('profile').open,true);assert.equal(get('layer-list').children.length,MR.LAYERS.length);
get('join-table').onclick();assert.equal(sent.at(-1).type,'claim-slot');assert.equal(sent.at(-1).slot,undefined);
assert.equal(get('profile').open,true,'Wait for host confirmation');
me.slot=1;state.slots[0]=me.id;emit();assert.equal(get('profile').open,false);assert.equal(get('choose-slot').hidden,true,'Avatar replaces duplicate profile button');
const open=id=>all().find(n=>n.dataset?.layer===id).children[0].onclick();
const layerCount=()=>sent.filter(m=>m.type==='layer').length;
open('sun-study-btn');assert.equal(layerCount(),0);assert.equal(get('map-view').hidden,true);assert.equal(controlEnabled,false);
get('layer-enabled').checked=true;get('layer-enabled').onchange({target:get('layer-enabled')});
assert.equal(layerCount(),1);assert.equal(get('layer-enabled').checked,false,'No optimistic shared state');assert.equal(get('activity-status').textContent,'Updating the table…');
state.layers['sun-study-btn']=true;emit();assert.equal(get('layer-enabled').checked,true);assert.equal(controlEnabled,true);
get('layer-enabled').checked=false;get('layer-enabled').onchange({target:get('layer-enabled')});
const failedAction=sent.at(-1);connection.options.onMessage({type:'error',actionId:failedAction.actionId,text:'Could not change the table'});
assert.equal(get('layer-enabled').checked,true);assert.equal(get('layer-enabled').disabled,false,'A rejected change restores the host state');
open('canvas-btn');assert.equal(get('map-view').hidden,false);assert.equal(layerCount(),2);
assert.equal(get('map-hint').textContent,'Switch on to use this app');
state.layers['canvas-btn']=true;emit();assert.match(get('map-hint').textContent,/Two fingers to move or zoom/);
map.tool='polygon';map.polygon={points:[[1,2]]};emit();assert.equal(get('map-hint').textContent,'1 corner · add 2 more');
map.polygon={points:[[1,2],[3,4],[5,6]]};emit();assert.equal(get('map-hint').textContent,'3 corners · tap Finish shape');
map.polygon={points:[[1,2],[3,4]]};const count=toolChanges;get('open-controls').onclick();assert.equal(get('controls-sheet').open,true);get('close-sheet').onclick();assert.equal(get('controls-sheet').open,false);
assert.equal(toolChanges,count);assert.equal(map.polygon.points.length,2,'Settings preserve the draft');
open('epc-btn');assert.equal(get('map-view').hidden,false);assert.match(get('layer-title').textContent,/Building energy/);
open('ecom-energy-btn');assert.equal(get('map-view').hidden,true,'Energy sharing has no phone map');assert.ok(get('dashboard').getAttribute('src'),'Energy editor opens directly');get('apps').onclick();assert.equal(get('dashboard').getAttribute('src'),null,'Energy editor unloads on Home');
state.paused=true;emit();assert.equal(get('layer-enabled').disabled,true);assert.equal(controlEnabled,false);
state.paused=false;connection.open=false;connection.options.onStatus('disconnected');assert.equal(get('layer-enabled').disabled,true);
connection.open=true;me.slot=null;state.slots=['a','b','c','d'];emit();get('profile-button').onclick();assert.equal(get('join-table').disabled,true);assert.match(get('slot-status').textContent,/full/);
get('spectate').onclick();assert.equal(get('profile').open,false);emit();assert.equal(get('profile').open,false);
console.log('PASS: atomic/explicit slots, capacity, joining acknowledgement, complete app drawer, activation confirmation, map views and controls sheet, draft preservation, pause/disconnect and spectator');
