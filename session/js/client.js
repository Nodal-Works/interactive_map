(function() {
  'use strict';
  const $=id=>document.getElementById(id), params=new URLSearchParams(location.search);
  const scriptUrl=document.currentScript.src, dashboardUrl=new URL('../../controller.html?sessionController=1',scriptUrl);
  dashboardUrl.searchParams.set('v',MR.RELEASE);
  let invitation={host:params.get('host'),token:params.get('token'),release:params.get('release')};
  try {if(!invitation.host)invitation=JSON.parse(localStorage.getItem('mr-last-invitation'))||invitation;else localStorage.setItem('mr-last-invitation',JSON.stringify(invitation));}catch{}
  const identityKey='mr-person-'+invitation.token;
  let identity;
  try {identity=JSON.parse(localStorage.getItem(identityKey));}catch{}
  if(!identity?.id||!identity?.resumeKey){identity={id:MR.id(),resumeKey:MR.id()};try{localStorage.setItem(identityKey,JSON.stringify(identity));}catch{}}
  let state=null, connection, layer=MR.LAYERS[0], tab='controls', mapView, frameReady=false, ended=false, sessionReady=false, styleOpen=false;
  const requests=new Map();
  const controls=new MR_CONTROLS($('phone-controls'),send);
  function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
  function person(){return state?.participants.find(p=>p.id===identity.id);}
  function canEdit(){return !!connection?.open && sessionReady && !state?.paused && !state?.endedAt && !!person()?.slot;}
  function send(message){
    if(!connection?.open)return false;
    if(['layer','control','gesture','canvas'].includes(message.type))message.actionId=MR.id();
    if(message.type==='canvas')message.transform=state?.table.revision;
    return connection.send(message);
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
    $('canvas-controls').hidden=layer.id!=='canvas-btn';
    controls.open(layer);controls.update(state,canEdit());
    selectTab(layer.id==='canvas-btn'?'map':'controls');
  }
  function selectTab(next){
    tab=next;document.body.classList.toggle('map-open',tab==='map');$('controls-tab').setAttribute('aria-selected',String(tab==='controls'));$('map-tab').setAttribute('aria-selected',String(tab==='map'));
    $('controls-view').hidden=tab!=='controls';$('map-view').hidden=tab!=='map';
    const ecom=layer.id==='ecom-energy-btn'&&tab==='controls';
    $('dashboard').hidden=!ecom;$('phone-controls').hidden=ecom||layer.id==='canvas-btn';
    if(ecom&&!$('dashboard').getAttribute('src'))$('dashboard').src=dashboardUrl.href;
    else if(!ecom&&$('dashboard').getAttribute('src')){frameReady=false;$('dashboard').removeAttribute('src');}
    if(tab==='map'){
      if(!mapView){
        mapView=new MR_MAP.CompanionMap({element:$('phone-map'),send,identity:()=>({id:identity.id,canEdit:canEdit()&&!!state?.layers[layer.id]})});
        $('phone-map').addEventListener('mr-tool-state',updateTools);
        $('phone-map').addEventListener('mr-drawing-state',({detail})=>{
          $('finish').disabled=detail.corners<3;$('delete').disabled=!detail.selected;$('edit-text').disabled=!detail.selected;
          updateHint();
        });
      }
      mapView.layer=layer.id;if(state)mapView.setState(state);
      const choices=[];
      if(layer.id==='canvas-btn')choices.push(['pen','Pen'],['line','Line'],['arrow','Arrow'],['polygon','Polygon'],['marker','Marker'],['comment','Comment'],['select','Select / move'],['reshape','Edit vertices']);
      else if(layer.id==='cfd-simulation-btn')choices.push(['obstacle','Draw wind obstacle'],['select','Move obstacle'],['reshape','Edit corners']);
      else if(layer.tool)choices.push([layer.tool,layer.id==='thermal-comfort-btn'?'Select route / inspect':layer.id==='isovist-btn'?'Place / move viewer':'Select location']);
      if(layer.id==='isovist-btn')choices.push(['heading','Look toward']);
      $('tool').replaceChildren(...choices.map(([value,label])=>new Option(label,value)));
      $('tool').value=layer.tool||'off';$('tool').hidden=choices.length<2;mapView.setTool(layer.tool||'off');mapView.map.resize();
      updateTools();

    }
    focus();
  }
  function updateTools(){
    const tool=mapView.tool,drawing=['canvas-btn','cfd-simulation-btn'].includes(layer.id),shape=['polygon','obstacle'].includes(tool),editing=['select','reshape'].includes(tool);
    $('drawing-options').hidden=layer.id!=='canvas-btn'||editing;
    for(const id of ['color','width'])$(id).hidden=!styleOpen||layer.id!=='canvas-btn'||editing;
    $('finish').hidden=!shape;$('finish').textContent='Finish shape';$('cancel').hidden=!shape;
    $('delete').hidden=!editing;$('edit-text').hidden=tool!=='select'||layer.id!=='canvas-btn';
    $('undo').hidden=!drawing;$('redo').hidden=!drawing;
    updateHint();
  }
  function updateHint(){
    if(!mapView)return;
    const tool=mapView.tool,shape=['polygon','obstacle'].includes(tool),editing=['select','reshape'].includes(tool);
    const navigation='Two fingers to pan or zoom';
    let input=shape?'Tap corners, then Finish shape':tool==='pen'?'Drag to sketch; lift to save':tool==='viewer'?'Drag to move the viewpoint':tool==='off'?'':editing?'Touch a point to select and drag':'Touch to '+(tool==='location'?'select a location':tool==='heading'?'look toward a place':tool==='route'?'set your route':'draw');
    if(shape&&mapView.polygon?.points.length)input=mapView.polygon.points.length+' corners · '+(mapView.polygon.points.length<3?'add '+(3-mapView.polygon.points.length)+' more':'tap Finish shape');
    if(!canEdit())input='';else if(!state?.layers[layer.id])input='Turn on this layer to add input';
    $('map-hint').textContent=input?input+' · '+navigation:navigation;
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
    $('release-slot').disabled=!me?.slot;syncFrame();controls.update(state,canEdit());if(mapView)mapView.setState(state);updateHint();
    if(state.paused)notice('The host has paused remote editing. You can still explore.');
    else if($('notice').textContent==='The host has paused remote editing. You can still explore.')notice('');
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
  $('apps').onclick=()=>{frameReady=false;$('dashboard').removeAttribute('src');document.body.classList.remove('map-open');$('workspace').hidden=true;$('drawer').hidden=false;if(mapView)mapView.cancel();send({type:'focus',layer:layer.id,tab:'controls'});};
  $('controls-tab').onclick=()=>selectTab('controls');$('map-tab').onclick=()=>selectTab('map');$('start-drawing').onclick=()=>selectTab('map');
  $('layer-enabled').onchange=e=>send({type:'layer',layer:layer.id,enabled:e.target.checked});
  $('tool').onchange=e=>mapView?.setTool(e.target.value);$('color').oninput=e=>{if(mapView)mapView.color=e.target.value;};$('width').onchange=e=>{if(mapView)mapView.width=Number(e.target.value);};
  $('fit').onclick=()=>mapView?.fit();$('finish').onclick=()=>mapView?.finish();$('cancel').onclick=()=>mapView?.cancel();$('delete').onclick=()=>mapView?.remove();
  $('edit-text').onclick=()=>mapView?.editText();
  $('undo').onclick=()=>send({type:'canvas',operation:'undo'});$('redo').onclick=()=>send({type:'canvas',operation:'redo'});
  $('avatar').replaceChildren(...MR.AVATARS.map(a=>new Option(a,a)));
  function profile(){const me=person();$('name').value=me?.name||'';$('avatar').value=me?.avatar||MR.AVATARS[0];$('profile').showModal();}
  $('profile-button').onclick=profile;$('choose-slot').onclick=profile;
  $('save-profile').onclick=()=>{send({type:'profile',name:$('name').value.trim(),avatar:$('avatar').value});$('profile').close();};
  $('release-slot').onclick=()=>send({type:'release-slot'});
  $('drawing-options').onclick=()=>{styleOpen=!styleOpen;$('drawing-options').setAttribute('aria-expanded',String(styleOpen));updateTools();};
  window.addEventListener('message',({source,origin,data})=>{
    if(source!==$('dashboard').contentWindow||origin!==location.origin)return;
    if(data?.type==='dashboard-ready'){frameReady=true;frame({type:'open-layer',layer:layer.id});syncFrame();}
    if(data?.type==='dashboard-control')send({type:'control',message:data.message});
    if(data?.type==='dashboard-rpc'){
      const requestId=MR.id();requests.set(requestId,{frameId:data.requestId,timer:setTimeout(()=>{frame({type:'rpc-result',requestId:data.requestId,error:'Host request timed out'});requests.delete(requestId);},185000)});
      if(!send({...data,type:'rpc',requestId})){const req=requests.get(requestId);clearTimeout(req.timer);requests.delete(requestId);frame({type:'rpc-result',requestId:data.requestId,error:'Host disconnected'});}
    }
  });
  function receive(message){
    if(message.type==='state'||message.type==='welcome'){
      state={...message,objects:state?.sessionId===message.sessionId?state.objects||[]:[]};sessionReady=true;render();
    }
    if(message.type==='identity'){identity.id=message.personId;render();}
    if(message.type==='objects'&&state){state.objects=message.objects;if(mapView)mapView.setState(state);}
    if(message.type==='rejected'||message.type==='ended'){ended=true;notice(message.text);$('connection').textContent='Session unavailable';connection?.stop();}
    if(message.type==='error'){render();notice(message.text);}
    if(message.type==='rpc-result'||message.type==='error'&&message.requestId){
      const req=requests.get(message.requestId);if(req){clearTimeout(req.timer);requests.delete(message.requestId);frame({...message,type:'rpc-result',requestId:req.frameId,error:message.type==='error'?message.text:undefined});}
    }
  }
  function status(value){
    if(ended)return;
    if(value==='connected'){focus();render();return;}
    if(value==='disconnected'){
      sessionReady=false;
      for(const req of requests.values()){clearTimeout(req.timer);frame({type:'rpc-result',requestId:req.frameId,error:'Connection interrupted. Please try again.'});}requests.clear();
    }
    if(state)render();else $('connection').textContent='Connecting…';
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)connection?.resume();});
  window.addEventListener('online',()=>connection?.resume());
  if(!invitation.host||!invitation.token){ended=true;notice('Scan the QR code on the MR Studio display to join a session.');$('connection').textContent='Waiting for an invitation';}
  else if(invitation.release!==MR.RELEASE){ended=true;notice('This invitation uses a different client version. Reload, then scan the host’s current QR.');}
  else if(typeof Peer==='undefined')notice('Connection library could not load. Check internet access and reload.');
  else {
    connection=new MR_CONNECTION({host:invitation.host,metadata:{token:invitation.token,clientId:identity.id,resumeKey:identity.resumeKey,release:MR.RELEASE},onMessage:receive,onStatus:status});
    connection.start();
  }
})();
