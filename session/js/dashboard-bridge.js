(function(){
  if(new URLSearchParams(location.search).get('sessionController')!=='1')return;
  'use strict';
  window.MR_REMOTE_FETCH=true;
  window.MR_SERVICES={ecom:'/api/services/ecom',coolpaths:'/api/services/coolpaths',sam:'/api/services/sam'};
  const channels=new Set(),pending=new Map();
  let sequence=0,currentLayer=null,lastState=null;
  const delivered=new Map();
  const send=data=>parent.postMessage(data,location.origin);
  window.BroadcastChannel=class extends EventTarget {
    constructor(name){super();this.name=name;channels.add(this);}
    postMessage(message){if(this.name==='map_controller_channel')send({type:'dashboard-control',message});}
    close(){channels.delete(this);}
  };
  function deliver(data){
    const key=data.type+':'+(data.animationId||data.action||''),signature=JSON.stringify(data);
    if(delivered.get(key)===signature)return;delivered.set(key,signature);
    for(const channel of channels){const event=new MessageEvent('message',{data});channel.onmessage?.(event);channel.dispatchEvent(event);}
  }
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,options)=>{
    const request=new Request(input,options),url=new URL(request.url,location.href);
    if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
    if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');
    const requestId=String(++sequence);
    const body=request.method==='GET'?null:await request.blob();
    const encoded=body?await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]||'');reader.readAsDataURL(body);}):null;
    return new Promise((resolve,reject)=>{
      const abort=()=>{pending.delete(requestId);reject(new DOMException('Aborted','AbortError'));};
      options?.signal?.addEventListener('abort',abort,{once:true});
      pending.set(requestId,{resolve,reject,cleanup:()=>options?.signal?.removeEventListener('abort',abort)});
      send({type:'dashboard-rpc',requestId,path:url.pathname+url.search,method:request.method,contentType:request.headers.get('content-type'),body:encoded});
    });
  };
  function open(layer){
    if(layer==='canvas-btn'||currentLayer===layer)return;
    if(typeof updateDashboard!=='function')return;
    currentLayer=layer;
    if(typeof stopTour==='function')stopTour();
    updateMetadata(layer);updateDashboard(layer);
    for(const key of [...delivered.keys()])if(/^(cfd_state|thermal_state|sun_state|isovist_state|epc_building_selected|isovist_stats)/.test(key))delivered.delete(key);
    if(lastState)update(lastState);
  }
  function update(message){
    lastState=message;document.body.classList.toggle('mr-readonly',!message.canEdit);
    for(const data of message.state.messages||[])deliver(data);
    for(const[id,isActive]of Object.entries(message.state.layers))deliver({type:'animation_state',animationId:id,isActive});
    if(message.state.cfd)deliver({type:'cfd_state',...message.state.cfd});
    if(message.state.thermal)deliver({type:'thermal_state',...message.state.thermal});
    if(message.state.sun)deliver({type:'sun_state',...message.state.sun});
    if(message.state.isovist)deliver({type:'isovist_state',...message.state.isovist});
  }
  window.addEventListener('message',({source,origin,data})=>{
    if(source!==parent||origin!==location.origin)return;
    if(data?.type==='open-layer')open(data.layer);
    if(data?.type==='session-state')update(data);
    if(data?.type==='rpc-result'){
      const request=pending.get(data.requestId);if(!request)return;pending.delete(data.requestId);request.cleanup();
      if(data.error)request.reject(Error(data.error));
      else request.resolve(new Response(Uint8Array.from(atob(data.body||''),c=>c.charCodeAt(0)),{status:data.status,headers:{'Content-Type':data.contentType||'application/json'}}));
    }
  });
  document.addEventListener('DOMContentLoaded',()=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href='session/css/dashboard-mobile.css';document.head.append(link);
    document.querySelectorAll('[data-target="calibrate-btn"]').forEach(n=>n.remove());
    send({type:'dashboard-ready'});
  });
})();
