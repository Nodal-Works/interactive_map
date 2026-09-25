const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const MR=require('../session/js/shared.js');
const Connection=require('../session/js/connection.js');
const {project}=require('../session/js/phone-state.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Channel extends EventEmitter{
 constructor(){super();this.open=false;this.dataChannel={bufferedAmount:0};this.sent=[];}
 send(value){this.sent.push(value);}
 close(){this.open=false;this.emit('close');}
}
(async()=>{
 const bulky={type:'FeatureCollection',features:[{payload:'RESULT'.repeat(100000)}]};
 const state={sessionId:'room',participants:[{id:'person',lastSeen:123}],slots:[],layers:{},table:{corners:[],revision:0},messages:[{type:'ecom_layer',layer:bulky},{type:'street_view_image',url:'data:image/png;BIG'}],cfd:{windSpeed:5,angle:0,diagnostics:bulky},thermal:{hour:14,route:bulky,catalog:bulky,tour:{open:true,layer:'pet',image:bulky}}};
 for(const layer of ['cfd-simulation-btn','thermal-comfort-btn','ecom-energy-btn']){
  const encoded=JSON.stringify(project(state,{layer,tab:'controls'}));assert.ok(encoded.length<500);assert.ok(!encoded.includes('RESULT'));assert.ok(!encoded.includes('data:image'));assert.ok(!encoded.includes('lastSeen'));
 }
 const congested=new Channel();congested.open=true;congested.dataChannel.bufferedAmount=100000;
 const send=MR.wire(congested,()=>{});for(let i=0;i<100;i++)send({type:'state',i});send({type:'pong',time:7});
 await wait(25);assert.equal(congested.sent.length,0);congested.dataChannel.bufferedAmount=0;await wait(60);
 assert.equal(congested.sent[0].type,'pong');assert.equal(congested.sent.filter(m=>m.type==='state').length,1);assert.equal(congested.sent.at(-1).i,99);
 const chunked=new Channel();chunked.open=true;const sendLarge=MR.wire(chunked,()=>{});
 sendLarge({type:'rpc-result',body:'x'.repeat(180000)});await wait(2);sendLarge({type:'pong'});await wait(80);
 assert.ok(chunked.sent.findIndex(m=>m.type==='pong')<chunked.sent.length-1,'Heartbeat interleaves before final bulk chunk');
 let now=0,count=0;const peer=new EventEmitter();peer.open=false;peer.connect=()=>{count++;return new Channel();};peer.reconnect=()=>peer.emit('open');peer.destroy=()=>{};
 const statuses=[],connection=new Connection({host:'host',metadata:{},onMessage:()=>{},onStatus:s=>statuses.push(s),createPeer:()=>peer,now:()=>now});
 connection.start();peer.open=true;peer.emit('open');const channel=connection.connection;
 connection.connect();connection.connect();assert.equal(count,1,'Only one pending connection');
 channel.open=true;channel.emit('open');peer.emit('disconnected');assert.ok(connection.open,'Signaling disconnect keeps the data connection');
 now=120000;connection.tick();assert.ok(connection.open,'Sleep/wake does not trigger an immediate timeout');
 for(let i=0;i<5;i++){now+=5000;connection.tick();}assert.ok(connection.open,'25 seconds without a pong does not cause reconnect churn');
 channel.emit('data',{type:'ack',actionId:'ok'});for(let i=0;i<10;i++){now+=5000;connection.tick();}assert.ok(connection.open,'Every received message proves liveness');
 for(let i=0;i<3;i++){now+=5000;connection.tick();}assert.equal(connection.open,false,'A genuinely silent peer is eventually retried');
 connection.stop();congested.close();chunked.close();
 let destroyed=false;const stalled=new EventEmitter();stalled.destroy=()=>{destroyed=true;};
 now=0;const startup=new Connection({host:'host',metadata:{},onMessage:()=>{},onStatus:()=>{},createPeer:()=>stalled,now:()=>now});
 startup.start();for(let i=0;i<5;i++){now+=5000;startup.tick();}
 assert.equal(destroyed,true,'Stalled signaling initialization is recreated');startup.stop();
 const throwing=new EventEmitter();throwing.open=true;throwing.connect=()=>{throw Error('Temporary failure');};throwing.destroy=()=>{};
 const attempt=new Connection({host:'host',metadata:{},onMessage:()=>{},onStatus:()=>{},createPeer:()=>throwing});
 attempt.start();throwing.emit('open');assert.equal(attempt.connecting,false,'Thrown connection attempts cannot leave the reconnect guard stuck');assert.ok(attempt.retryTimer);attempt.stop();
 console.log('PASS: input-only state budget, backpressure coalescing, heartbeat priority, reconnect guard and sleep/wake grace');
})().catch(e=>{console.error(e);process.exit(1);});
