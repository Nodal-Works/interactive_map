(function() {
  'use strict';
  const $=id=>document.getElementById(id), params=new URLSearchParams(location.search);
  const scriptUrl=document.currentScript.src, dashboardUrl=new URL('../../controller.html?sessionController=1',scriptUrl);
  let invitation={host:params.get('host'),token:params.get('token'),release:params.get('release')};
  try {if(!invitation.host)invitation=JSON.parse(localStorage.getItem('mr-last-invitation'))||invitation;else localStorage.setItem('mr-last-invitation',JSON.stringify(invitation));}catch{}
  const identityKey='mr-person-'+invitation.token;
  let identity;
  try {identity=JSON.parse(localStorage.getItem(identityKey));}catch{}
  if(!identity?.id||!identity?.resumeKey){identity={id:MR.id(),resumeKey:MR.id()};try{localStorage.setItem(identityKey,JSON.stringify(identity));}catch{}}
  let state=null, connection, peer, sendWire, layer=MR.LAYERS[0], tab='controls', mapView, frameReady=false, ended=false, retryTimer, lastPong=0;
  const requests=new Map();
  function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
  function person(){return state?.participants.find(p=>p.id===identity.id);}
  function canEdit(){return !!connection?.open && !state?.paused && !state?.endedAt && !!person()?.slot;}
  function send(message){
    if(!connection?.open){notice('Reconnecting. Edits are paused until the host returns.');return false;}
    if(['layer','control','gesture','canvas'].includes(message.type))message.actionId=MR.id();
    sendWire(message);return true;
  }
  function focus(){send({type:'focus',layer:layer.id,tab});}
  function frame(message){if(frameReady)$('dashboard').contentWindow.postMessage(message,location.origin);}
  function syncFrame(){
    if(!state)return;
    frame({type:'session-state',state,canEdit:canEdit()});
  }
  function showLayer(next){
    layer=next;$('drawer').hidden=true;$('workspace').hidden=false;
    $('layer-title').textContent=layer.name;$('layer-icon').textContent=layer.icon;
    $('layer-enabled').checked=!!state?.layers[layer.id];$('layer-enabled').disabled=!canEdit();
    $('dashboard').hidden=layer.id==='canvas-btn';$('canvas-controls').hidden=layer.id!=='canvas-btn';
    frame({type:'open-layer',layer:layer.id});selectTab('controls');
  }
  function selectTab(next){
    tab=next;$('controls-tab').setAttribute('aria-selected',String(tab==='controls'));$('map-tab').setAttribute('aria-selected',String(tab==='map'));
    $('controls-view').hidden=tab!=='controls';$('map-view').hidden=tab!=='map';
    if(tab==='map'){
      if(!mapView)mapView=new MR_MAP.CompanionMap({element:$('phone-map'),send,identity:()=>({id:identity.id,canEdit:canEdit()})});
      mapView.layer=layer.id;if(state)mapView.setState(state);
      if(baseData)mapView.base(baseData);
      const choices=[['navigate','Move / zoom']];
      if(layer.id==='canvas-btn')choices.push(['pen','Pen'],['line','Line'],['arrow','Arrow'],['polygon','Polygon'],['marker','Marker'],['comment','Comment'],['select','Select / move'],['reshape','Edit vertices']);
      else if(layer.id==='cfd-simulation-btn')choices.push(['obstacle','Draw wind obstacle'],['select','Move obstacle'],['reshape','Edit corners']);
      else if(layer.tool)choices.push([layer.tool,layer.id==='thermal-comfort-btn'?'Select route / inspect':layer.id==='isovist-btn'?'Place / move viewer':'Select location']);
      if(layer.id==='isovist-btn')choices.push(['heading','Look toward']);
      $('tool').replaceChildren(...choices.map(([value,label])=>new Option(label,value)));
      $('tool').value=layer.tool||'navigate';mapView.setTool($('tool').value);mapView.map.resize();
      const drawing=['canvas-btn','cfd-simulation-btn'].includes(layer.id);
      for(const id of ['color','width','finish','cancel','delete','undo','redo'])$(id).hidden=!drawing;
      $('map-hint').textContent=drawing?'Choose a tool · tap corners to draw shapes · two fingers to zoom':layer.tool?'One finger to interact · two fingers to zoom and pan':'Companion map · live animation plays on the table';
      if(!state?.layers[layer.id])notice('Turn this layer on to interact with the shared table.');
    }
    focus();
  }
  function render(){
    if(!state)return;
    const me=person();$('profile-button').textContent=me?.avatar||'☺';
    $('connection').textContent=state.endedAt?'Session ended':connection?.open?`${me?.name||'Connected'} · ${me?.slot?'Controller '+me.slot:'Spectator'}${state.paused?' · paused':''}`:'Reconnecting…';
    $('choose-slot').textContent=me?.slot?'Controller '+me.slot+' · profile & slots':'Choose a controller slot';
    $('layer-enabled').checked=!!state.layers[layer.id];$('layer-enabled').disabled=!canEdit();
    for(const el of document.querySelectorAll('[data-layer]')){
      const active=!!state.layers[el.dataset.layer];el.classList.toggle('active',active);const input=el.querySelector('input');input.checked=active;input.disabled=!canEdit();
    }
    $('slots').replaceChildren(...state.slots.map((id,index)=>{
      const p=state.participants.find(p=>p.id===id),row=document.createElement('div');row.className='slot';
      const label=document.createElement('span');label.textContent=`${index+1} · ${p?p.avatar+' '+p.name+(!p.online?' · reserved':''):'Available'}`;
      const button=document.createElement('button');button.textContent=id===identity.id?'Yours':'Join';button.disabled=!!id||!!me?.slot||!connection?.open;button.onclick=()=>send({type:'claim-slot',slot:index+1});row.append(label,button);return row;
    }));
    $('release-slot').disabled=!me?.slot;syncFrame();if(mapView)mapView.setState(state);
    if(state.paused)notice('The host has paused remote editing. You can still explore.');
    else if(state.layers[layer.id]&&$('notice').textContent==='Turn this layer on to interact with the shared table.')notice('');
  }
  for(const group of [...new Set(MR.LAYERS.map(l=>l.group))]){
    const title=document.createElement('h2');title.textContent=group;const grid=document.createElement('div');grid.className='app-grid';
    for(const item of MR.LAYERS.filter(l=>l.group===group)){
      const card=document.createElement('div');card.className='app-card';card.dataset.layer=item.id;
      const open=document.createElement('button');open.className='open';const icon=document.createElement('span');icon.className='glyph';icon.textContent=item.icon;const name=document.createElement('span');name.textContent=item.name;open.append(icon,name);open.onclick=()=>showLayer(item);
      const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.disabled=true;toggle.setAttribute('aria-label','Enable '+item.name);toggle.onchange=()=>send({type:'layer',layer:item.id,enabled:toggle.checked});label.append(toggle);card.append(open,label);grid.append(card);
    }
    $('layer-list').append(title,grid);
  }
  $('apps').onclick=()=>{$('workspace').hidden=true;$('drawer').hidden=false;if(mapView)mapView.cancel();send({type:'focus',layer:layer.id,tab:'controls'});};
  $('controls-tab').onclick=()=>selectTab('controls');$('map-tab').onclick=()=>selectTab('map');$('start-drawing').onclick=()=>selectTab('map');
  $('layer-enabled').onchange=e=>send({type:'layer',layer:layer.id,enabled:e.target.checked});
  $('tool').onchange=e=>mapView?.setTool(e.target.value);$('color').oninput=e=>{if(mapView)mapView.color=e.target.value;};$('width').onchange=e=>{if(mapView)mapView.width=Number(e.target.value);};
  $('fit').onclick=()=>mapView?.fit();$('finish').onclick=()=>mapView?.finish();$('cancel').onclick=()=>mapView?.cancel();$('delete').onclick=()=>mapView?.remove();
  $('undo').onclick=()=>send({type:'canvas',operation:'undo'});$('redo').onclick=()=>send({type:'canvas',operation:'redo'});
  $('avatar').replaceChildren(...MR.AVATARS.map(a=>new Option(a,a)));
  function profile(){const me=person();$('name').value=me?.name||'';$('avatar').value=me?.avatar||MR.AVATARS[0];$('profile').showModal();}
  $('profile-button').onclick=profile;$('choose-slot').onclick=profile;
  $('save-profile').onclick=()=>{send({type:'profile',name:$('name').value.trim(),avatar:$('avatar').value});$('profile').close();};
  $('release-slot').onclick=()=>send({type:'release-slot'});
  $('dashboard').src=dashboardUrl.href;
  window.addEventListener('message',({source,origin,data})=>{
    if(source!==$('dashboard').contentWindow||origin!==location.origin)return;
    if(data?.type==='dashboard-ready'){frameReady=true;frame({type:'open-layer',layer:layer.id});syncFrame();}
    if(data?.type==='dashboard-control')send({type:'control',message:data.message});
    if(data?.type==='dashboard-rpc'){
      const requestId=MR.id();requests.set(requestId,{frameId:data.requestId,timer:setTimeout(()=>{frame({type:'rpc-result',requestId:data.requestId,error:'Host request timed out'});requests.delete(requestId);},185000)});
      if(!send({...data,type:'rpc',requestId})){const req=requests.get(requestId);clearTimeout(req.timer);requests.delete(requestId);frame({type:'rpc-result',requestId:data.requestId,error:'Host disconnected'});}
    }
  });
  let baseData;
  function receive(message){
    if(message.type==='state'||message.type==='welcome'){state=message;lastPong=Date.now();render();}
    if(message.type==='identity'){identity.id=message.personId;render();}
    if(message.type==='map')mapView?.results(message);
    if(message.type==='base'){baseData=message.data;mapView?.base(baseData);}
    if(message.type==='drafts'&&mapView){mapView.drafts=message.drafts;mapView.render();}
    if(message.type==='pong')lastPong=Date.now();
    if(message.type==='rejected'||message.type==='ended'){ended=true;notice(message.text);$('connection').textContent='Session unavailable';connection?.close();}
    if(message.type==='error'){notice(message.text);render();}
    if(message.type==='rpc-result'||message.type==='error'&&message.requestId){
      const req=requests.get(message.requestId);if(req){clearTimeout(req.timer);requests.delete(message.requestId);frame({...message,type:'rpc-result',requestId:req.frameId,error:message.type==='error'?message.text:undefined});}
    }
  }
  function retry(){if(ended)return;clearTimeout(retryTimer);retryTimer=setTimeout(connect,1800);}
  function connect(){
    if(ended||connection?.open)return;
    if(!peer||peer.destroyed){
      peer=new Peer(MR_CONFIG.peer);peer.on('open',connect);peer.on('error',error=>{notice('Connection: '+error.type+'. Retrying…');retry();});
      peer.on('disconnected',()=>{try{peer.reconnect();}catch{}retry();});return;
    }
    if(!peer.id){retry();return;}
    const next=peer.connect(invitation.host,{reliable:true,metadata:{token:invitation.token,clientId:identity.id,resumeKey:identity.resumeKey,release:MR.RELEASE}});
    connection=next;sendWire=MR.wire(next,receive);
    next.on('open',()=>{if(connection!==next)return;notice('');lastPong=Date.now();focus();render();});
    next.on('close',()=>{if(connection!==next)return;render();syncFrame();for(const req of requests.values()){clearTimeout(req.timer);frame({type:'rpc-result',requestId:req.frameId,error:'Host disconnected'});}requests.clear();retry();});
    next.on('error',()=>{next.close();retry();});
    setTimeout(()=>{if(connection===next&&!next.open){notice('The connection is taking longer than expected. This network may require a TURN relay; ask the host to check Session status.');next.close();retry();}},30000);
  }
  setInterval(()=>{if(connection?.open){if(Date.now()-lastPong>20000){connection.close();retry();}else send({type:'ping',time:Date.now()});}},5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(connection?.open)send({type:'ping',time:Date.now()});else connect();}});
  window.addEventListener('online',connect);
  if(!invitation.host||!invitation.token){ended=true;notice('Scan the QR code on the MR Studio display to join a session.');$('connection').textContent='Waiting for an invitation';}
  else if(invitation.release!==MR.RELEASE){ended=true;notice('This invitation uses a different client version. Reload, then scan the host’s current QR.');}
  else if(typeof Peer==='undefined')notice('Connection library could not load. Check internet access and reload.');
  else connect();
})();
