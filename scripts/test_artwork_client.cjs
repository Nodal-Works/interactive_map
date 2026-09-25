/* Execute the real client entrypoint and its companion bridge without a network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {webcrypto}=require('node:crypto'),MR=require('../session/js/shared.js'),{project}=require('../session/js/phone-state.js');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const nodes=new Map(),all=[],sent=[],frameMessages=[],listeners={};let options;
function node(tag='div'){
 const classes=new Set(),n={tag,dataset:{},children:[],hidden:false,textContent:'',checked:false,style:{},
 classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,on){if(on)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k)},
 append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k]??null;},removeAttribute(k){delete this[k];},addEventListener(){},
 querySelector(selector){return this.children.find(c=>c.tag===selector)||this.children.flatMap(c=>c.children||[]).find(c=>c.tag===selector);},
 showModal(){this.open=true;},close(){this.open=false;}};all.push(n);return n;
}
const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
get('dashboard').contentWindow={postMessage:m=>frameMessages.push(m)};
const store={getItem:()=>null,setItem(){}},location=new URL('https://client.example/lindholmen/client.html?host=host&token=test&release='+MR.RELEASE);
const context={URL,URLSearchParams,crypto:webcrypto,console,location,localStorage:store,sessionStorage:store,Option:function(){},Peer:function(){},
 document:{currentScript:{src:'https://client.example/lindholmen/session/js/client.js'},getElementById:get,createElement:node,body:node(),addEventListener(){},querySelectorAll:selector=>selector==='[data-layer]'?all.filter(n=>n.dataset.layer):[]},
 requestAnimationFrame:f=>f(),clearTimeout(){},setTimeout(){},scrollTo(){},addEventListener:(event,f)=>listeners[event]=f,
 MR_CONTROLS:class{open(){}update(){}},MR_CONNECTION:class{constructor(o){options=o;this.open=true;}start(){}send(m){sent.push(m);return true;}stop(){}},MR};
context.window=context;vm.runInNewContext(read('session/js/client.js'),context);
const art={type:'artwork_state',isActive:true,chapter:3,fromChapter:2,transitioning:true,startedAt:10000,sentAt:10200,reducedMotion:false,loading:false,error:null,lens:{enabled:true,pinned:false,x:.2,y:.7,span:350,diameter:600,zoom:3},unwantedGeometry:'x'.repeat(100000)};
const hostState={sessionId:'room',paused:false,endedAt:null,table:{corners:[],bearing:0,revision:1},slots:[options.metadata.clientId,null,null,null],participants:[{id:options.metadata.clientId,slot:1,online:true,name:'Test',avatar:'🦊'}],layers:{'artwork-btn':true},messages:[art]};
const receive=()=>options.onMessage(project(hostState,{layer:'artwork-btn',tab:'controls'}));receive();
const card=all.find(n=>n.dataset.layer==='artwork-btn');assert.ok(card,'Artwork is present in the app drawer');card.querySelector('button').onclick();
assert.equal(get('dashboard').hidden,false);assert.equal(get('phone-controls').hidden,true);assert.match(get('dashboard').src,/controller.html\?sessionController=1/);assert.match(get('dashboard').title,/Artwork/);
const message=data=>listeners.message({source:get('dashboard').contentWindow,origin:location.origin,data});
message({type:'dashboard-ready'});assert.ok(frameMessages.some(m=>m.type==='open-layer'&&m.layer==='artwork-btn'));
const snapshot=frameMessages.findLast(m=>m.type==='session-state');assert.equal(snapshot.state.messages[0].chapter,3);assert.equal(snapshot.state.messages[0].lens.x,.2);assert.equal(snapshot.state.messages[0].unwantedGeometry,undefined);assert.ok(JSON.stringify(snapshot).length<1500);
for(const [action,value]of [['next',undefined],['set_zoom',4],['pin_lens',true],['set_lens_position',{x:.4,y:.6}]]){
 message({type:'dashboard-control',message:{type:'artwork_control',action,...(value===undefined?{}:{value})}});const outgoing=sent.at(-1);assert.equal(outgoing.type,'control');assert.ok(MR.validControl(outgoing.message));assert.ok(outgoing.actionId);
}
hostState.paused=true;receive();let count=sent.length;message({type:'dashboard-control',message:{type:'artwork_control',action:'next'}});assert.equal(sent.length,count,'Paused clients cannot advance via the iframe');
hostState.paused=false;hostState.participants[0].slot=null;receive();count=sent.length;message({type:'dashboard-control',message:{type:'artwork_control',action:'set_lens_position',value:{x:.8,y:.2}}});assert.equal(sent.length,count,'Spectators cannot move the shared lens');
message({type:'dashboard-control',message:{type:'artwork_control',action:'request_state'}});assert.equal(sent.at(-1).message.action,'request_state');
options.onStatus('disconnected');options.onStatus('connected');assert.equal(sent.at(-1).message.action,'request_state','Reconnection requests a fresh clock and scene');
hostState.participants[0].slot=1;art.chapter=6;art.lens.pinned=true;receive();assert.equal(frameMessages.at(-1).state.messages[0].chapter,6);assert.equal(frameMessages.at(-1).state.messages[0].lens.pinned,true);
get('apps').onclick();assert.equal(get('dashboard').getAttribute('src'),null,'Leaving the viewer unloads its rendering resources');
// Verify the actual bridge relays the render recipe to the shared dashboard.
const bridgeMessages=[],bridgeListeners={},bridge={URL,URLSearchParams,EventTarget,MessageEvent,location:new URL('https://client.example/lindholmen/controller.html?sessionController=1'),fetch(){},parent:{postMessage(){}},
 document:{currentScript:{src:'https://client.example/lindholmen/session/js/dashboard-bridge.js'},body:node(),addEventListener(){},querySelectorAll:()=>[]},addEventListener:(event,f)=>bridgeListeners[event]=f};bridge.window=bridge;
vm.runInNewContext(read('session/js/dashboard-bridge.js'),bridge);const channel=new bridge.BroadcastChannel('map_controller_channel');channel.onmessage=({data})=>bridgeMessages.push(data);
bridgeListeners.message({source:bridge.parent,origin:bridge.location.origin,data:{type:'session-state',state:project(hostState,{layer:'artwork-btn',tab:'controls'}),canEdit:true}});
assert.equal(bridgeMessages.find(m=>m.type==='artwork_state').chapter,6);
// Check the built artifact, including all locally rendered assets and release pins.
for(const file of ['controller/artwork-dashboard.js','controller/artwork.css','animations/artwork-core.js','media/artwork/base.svg','media/artwork/manifest.json'])assert.ok(fs.existsSync(path.join(root,'dist/session-client',file)),file);
assert.ok(read('dist/session-client/client.html').includes('v='+MR.RELEASE));assert.ok(!read('dist/session-client/controller.html').includes('session/js/host.js'));
console.log('PASS client drawer/viewer, all Artwork commands, compact rendering state, spectator/pause guards, reconnect, iframe cleanup, dashboard bridge and packaged assets');
