/* In-memory PeerJS-shaped transport for deterministic UI tests, never shipped. */
const source=String.raw`
(function(){
class Emitter {constructor(){this.handlers={};} on(type,fn){(this.handlers[type]||=[]).push(fn);return this;} off(type,fn){this.handlers[type]=(this.handlers[type]||[]).filter(handler=>handler!==fn);return this;} emit(type,value){for(const fn of this.handlers[type]||[])fn(value);}}
const peers=new Map(),connections=new Map();
class Connection extends Emitter {
 constructor(id,peer,metadata){super();this.id=id;this.peer=peer;this.metadata=metadata;this.open=false;this.dataChannel={bufferedAmount:0};connections.set(id,this);}
 send(data){window.mrTestBus({op:'data',id:this.id,data});}
 close(){if(!this.open)return;this.open=false;this.emit('close');window.mrTestBus({op:'close',id:this.id});}
}
window.__mrReceiveTest=message=>{
 if(message.op==='incoming'){const c=new Connection(message.id,message.from,message.metadata);peers.get(message.to).emit('connection',c);}
 if(message.op==='open'){const c=connections.get(message.id);c.open=true;c.emit('open');}
 if(message.op==='data')connections.get(message.id)?.emit('data',message.data);
 if(message.op==='close'){const c=connections.get(message.id);if(c){c.open=false;c.emit('close');}}
};
window.Peer=class extends Emitter {
 constructor(){super();this.id=crypto.randomUUID();this.open=false;this.connections={};peers.set(this.id,this);window.mrTestBus({op:'register',peer:this.id}).then(()=>{this.open=true;this.emit('open',this.id);});}
 connect(peer,options){const id=crypto.randomUUID(),c=new Connection(id,peer,options.metadata);this.connections[peer]=[c];window.mrTestBus({op:'connect',id,from:this.id,to:peer,metadata:options.metadata});return c;}
 destroy(){this.destroyed=true;for(const list of Object.values(this.connections))for(const c of list)c.close();}
 reconnect(){this.emit('open',this.id);}
};})();`;

function createTransport(){
 const peers=new Map(),links=new Map(),stats=[];
 async function deliver(page,message){if(!page.isClosed())await page.evaluate(message=>window.__mrReceiveTest(message),message).catch(()=>{});}
 const install=async context=>{
  await context.route('**/peerjs@1.5.5/**',route=>route.fulfill({contentType:'application/javascript',body:source}));
  await context.exposeBinding('mrTestBus',async({page},message)=>{
   if(message.op==='register'){peers.set(message.peer,page);return;}
   if(message.op==='connect'){
    const other=peers.get(message.to);if(!other)return;
    links.set(message.id,[page,other]);
    await deliver(other,{...message,op:'incoming'});
    await deliver(other,{op:'open',id:message.id});
    await deliver(page,{op:'open',id:message.id});return;
   }
   const link=links.get(message.id);if(!link)return;
   const target=link.find(p=>p!==page);
   if(message.op==='data')stats.push({from:page.url(),to:target.url(),type:message.data.type,bytes:JSON.stringify(message.data).length});
   await deliver(target,message);
  });
 };
 install.stats=stats;return install;
}
module.exports=createTransport;
