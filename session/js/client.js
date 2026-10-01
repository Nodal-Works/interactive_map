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
  let state=null, connection, layer=MR.LAYERS[0], tab='controls', mapView, frameReady=false, ended=false, sessionReady=false;
  let joining = false, pendingSlot = null, expandedMap = false;
  let spectatorChosen = false;
  try{spectatorChosen=sessionStorage.getItem(identityKey+'-spectator')==='yes';}catch{}
  let mapLayer=null, pendingActivation=null, joinTimer=null;
  const activities={
    'sun-study-btn':['Sun & shade','Move through the day and watch shadows change.','controls'],
    'cfd-simulation-btn':['Wind','Explore how wind moves around buildings.','controls'],
    'canvas-btn':['Draw','Sketch or leave a comment on the table.','map'],
    'stormwater-btn':['Rain & runoff','Explore where rainwater flows.','controls'],
    'thermal-comfort-btn':['Cooler routes','Choose a start and destination on the map.','map'],
    'isovist-btn':['Visibility','Place a viewpoint to explore visibility.','map'],
    'street-view-btn':['Street View','Pick a location to see it at street level.','map'],
    'epc-btn':['Building energy','Tap a building to see its energy rating on the table.','map'],
    'ecom-energy-btn':['Energy sharing','Explore energy sharing between buildings.','controls'],
    'bird-sounds-btn':['Bird sounds','Listen to the sounds around the campus.','controls'],
    'slideshow-btn':['Slides','Explore images and stories on the table.','controls'],
    'campus-demo-btn':['Campus vision','Play a guided campus presentation.','controls'],
    'fcc-demo-btn':['FCC walkthrough','Play or pause the walkthrough.','controls'],
    'grid-animation-btn':['Table grid','Show a grid across the table.','controls']
  };
  const presentation=item=>activities[item.id]||[item.name,'Explore this activity.',item.tool?'map':'controls'];
  const icons={'sun-study-btn':'sun','cfd-simulation-btn':'wind','canvas-btn':'pencil','stormwater-btn':'droplets','thermal-comfort-btn':'route','isovist-btn':'eye','street-view-btn':'map-pin','epc-btn':'building-2','ecom-energy-btn':'network','bird-sounds-btn':'bird','slideshow-btn':'presentation','campus-demo-btn':'school','fcc-demo-btn':'play','grid-animation-btn':'grid-3x3'};
  let sheetTrigger=null;
  const iconUrl=name=>new URL('../icons/'+name+'.svg',scriptUrl).href;
  const hasMap=()=>!!layer.tool&&layer.id!=='ecom-energy-btn';
  const requests=new Map();
  const controls=new MR_CONTROLS($('phone-controls'),send);
  function notice(text){$('notice').textContent=text;$('notice').hidden=!text;if(text)$('activity-status').hidden=true;}
  function person(){return state?.participants.find(p=>p.id===identity.id);}
  function canEdit(){return !ended && !!connection?.open && sessionReady && !state?.paused && !state?.endedAt && !!person()?.slot;}
  function send(message){
    if(!connection?.open)return false;
    if(['layer','control','gesture','canvas'].includes(message.type))message.actionId=MR.id();
    if(message.type==='canvas')message.transform=state?.table.revision;
    return connection.send(message);
  }
  function focus(){send({type:'focus',layer:layer.id,tab});}
  function frame(message){
    // RPC can start before DOMContentLoaded/dashboard-ready; its caller already exists.
    if(frameReady||message.type==='rpc-result')$('dashboard').contentWindow?.postMessage(message,location.origin);
  }
  function unloadDashboard(){
    frameReady=false;
    for(const request of requests.values())clearTimeout(request.timer);
    requests.clear();$('dashboard').removeAttribute('src');
  }
  function syncFrame(){
    if(!state)return;
    frame({type:'session-state',state,canEdit:canEdit()});
  }
  function showLayer(next){
    closeSheet();exitExpandedMap();
    layer=next;$('drawer').hidden=true;$('workspace').hidden=false;
    $('layer-title').textContent=presentation(layer)[0];$('activity-description').textContent=presentation(layer)[1];
    $('layer-enabled').checked=!!state?.layers[layer.id];$('layer-enabled').disabled=!canEdit();
    $('canvas-controls').hidden=layer.id!=='canvas-btn';
    controls.open(layer);controls.update(state,canEdit()&&!!state?.layers[layer.id]);
    $('controls-home').hidden=hasMap();
    (hasMap()?$('sheet-body'):$('controls-home')).append($('controls-view'));
    if(hasMap())$('sheet-body').append($('expand-map'));
    $('controls-view').hidden=false;
    selectTab(hasMap()?'map':'controls');render();
    window.scrollTo(0,0);$('layer-title').focus?.();
  }
  function syncDashboard(){
    const ecom=layer.id==='ecom-energy-btn'&&tab==='controls';
    $('dashboard').hidden=!ecom;$('phone-controls').hidden=ecom||layer.id==='canvas-btn';
    if(ecom&&!$('dashboard').getAttribute('src'))$('dashboard').src=dashboardUrl.href;
    else if(!ecom&&$('dashboard').getAttribute('src'))unloadDashboard();
  }
  function openSheet(mode,trigger){
    sheetTrigger=trigger;
    $('tool-settings').hidden=mode!=='tools';$('controls-view').hidden=mode==='tools';
    $('sheet-title').textContent=mode==='tools'?'Map tools':presentation(layer)[0];
    tab=mode==='controls'?'controls':'map';syncDashboard();focus();
    if(!$('controls-sheet').open)$('controls-sheet').showModal();
  }
  function closeSheet(){if($('controls-sheet').open)$('controls-sheet').close();}
  $('controls-sheet').addEventListener('close',()=>{
    $('controls-sheet').classList.remove('expanded');$('expand-sheet').textContent='Expand';$('expand-sheet').setAttribute('aria-expanded','false');
    if(hasMap()){tab='map';syncDashboard();focus();}sheetTrigger?.focus?.();
  });
  $('controls-sheet').addEventListener('click',event=>{
    const r=$('controls-sheet').getBoundingClientRect();
    if(event.target===$('controls-sheet')&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))closeSheet();
  });
  $('close-sheet').onclick=closeSheet;
  $('expand-sheet').onclick=()=>{const expanded=$('controls-sheet').classList.toggle('expanded');$('expand-sheet').textContent=expanded?'Collapse':'Expand';$('expand-sheet').setAttribute('aria-expanded',String(expanded));};
  $('open-controls').onclick=()=>openSheet('controls',$('open-controls'));
  $('tool-picker').onclick=()=>openSheet('tools',$('tool-picker'));
  function selectTab(next){
    if(next==='map'&&!hasMap())next='controls';
    tab=next;document.body.classList.toggle('map-open',hasMap());$('map-view').hidden=!hasMap();
    syncDashboard();
    if(next==='map'){
      if(!mapView){
        mapView=new MR_MAP.CompanionMap({element:$('phone-map'),send,identity:()=>({id:identity.id,canEdit:canEdit()&&!!state?.layers[layer.id]&&(mapView?.tool!=='obstacle'||!!state?.layers['cfd-simulation-btn'])})});
        $('phone-map').addEventListener('mr-tool-state',updateTools);
        $('phone-map').addEventListener('mr-drawing-state',({detail})=>{
          $('finish').disabled=detail.corners<3;$('delete').disabled=!detail.selected;$('edit-text').disabled=!detail.selected;
          updateTools();
        });
      }
      const changed=mapLayer!==layer.id;
      mapView.layer=layer.id;if(state)mapView.setState(state);
      const choices=[];
      if(layer.id==='canvas-btn')choices.push(['pen','Pen'],['line','Line'],['arrow','Arrow'],['polygon','Polygon'],['marker','Marker'],['comment','Comment'],['obstacle','Draw wind obstacle'],['select','Select / move'],['reshape','Edit vertices']);
      else if(layer.id==='cfd-simulation-btn')choices.push(['obstacle','Draw wind obstacle'],['select','Move obstacle'],['reshape','Edit corners']);
      else if(layer.tool)choices.push([layer.tool,layer.id==='thermal-comfort-btn'?'Select route / inspect':layer.id==='isovist-btn'?'Place / move viewer':'Select location']);
      if(layer.id==='isovist-btn')choices.push(['heading','Look toward']);
      $('tool').replaceChildren(...choices.map(([value,label])=>new Option(label,value)));
      $('tool').value=changed?(layer.tool||'off'):mapView.tool;$('tool').hidden=choices.length<2;
      if(changed){mapView.setTool(layer.tool||'off');mapLayer=layer.id;}mapView.map.resize();
      updateTools();

    }
    focus();
  }
  function updateTools(){
    const tool=mapView.tool,drawing=['canvas-btn','cfd-simulation-btn'].includes(layer.id),editing=['select','reshape'].includes(tool),unfinished=!!mapView.polygon?.points.length;
    $('tool-picker').hidden=!layer.tool||unfinished||$('tool').options.length<2;
    $('tool-picker').textContent=$('tool').selectedOptions[0]?.textContent||'Tools';
    $('drawing-style').hidden=layer.id!=='canvas-btn'||editing;
    $('finish').hidden=!unfinished;$('cancel').hidden=!unfinished;
    $('open-controls').hidden=unfinished;$('undo').hidden=!drawing||unfinished;
    $('delete').hidden=!editing||!mapView.selected;
    $('edit-text').hidden=tool!=='select'||layer.id!=='canvas-btn'||!mapView.objects?.some(o=>o.id===mapView.selected&&o.tool==='comment');
    $('redo').hidden=!drawing;
    for(const id of ['undo','redo','delete','edit-text','finish'])$(id).disabled=!canEdit()||!state?.layers[layer.id]||(id==='finish'&&(mapView.polygon?.points.length||0)<3)||(['delete','edit-text'].includes(id)&&!mapView.selected);
    updateHint();
  }
  function updateHint(){
    if(!mapView)return;
    const tool=mapView.tool,shape=['polygon','obstacle'].includes(tool),editing=['select','reshape'].includes(tool);
    const navigation='Two fingers to move or zoom';
    let input=shape?'Tap corners, then Finish shape':tool==='pen'?'Drag to sketch; lift to save':tool==='viewer'?'Drag to move the viewpoint':tool==='off'?'':editing?'Touch a point to select and drag':'Touch to '+(tool==='location'?'select a location':tool==='heading'?'look toward a place':tool==='route'?'set your route':'draw');
    if(layer.id==='thermal-comfort-btn')input=MR_MAP.thermalHint(state?.thermal);
    if(layer.id==='epc-btn')input='Tap a building inside the table outline';
    if(shape&&mapView.polygon?.points.length)input=mapView.polygon.points.length+(mapView.polygon.points.length===1?' corner · ':' corners · ')+(mapView.polygon.points.length<3?'add '+(3-mapView.polygon.points.length)+' more':'tap Finish shape');
    if(!canEdit())input='';else if(!state?.layers[layer.id])input='Switch on to use this app';else if(tool==='obstacle'&&!state?.layers['cfd-simulation-btn'])input='Turn on Wind · CFD to draw an obstacle';
    const showNavigation=canEdit()&&state?.layers[layer.id]&&!(shape&&mapView.polygon?.points.length);
    $('map-hint').textContent=input?(input+(showNavigation?' · '+navigation:'')):navigation;
  }
  function render(){
    if(!state)return;
    const me=person();$('profile-button').textContent=me?.avatar||'☺';
    if(me?.slot && pendingSlot){pendingSlot=null;clearTimeout(joinTimer);joining=false;$('profile').close();$('slot-status').textContent='';}
    $('connection').textContent=state.endedAt?'Session ended':connection?.open?`${me?.name||'Connected'} · ${me?.slot?'Controller '+me.slot:'Spectator'}${state.paused?' · paused':''}`:'Reconnecting…';
    const connected=!!connection?.open&&sessionReady&&!ended&&!state.endedAt,full=state.slots.every(Boolean);
    $('choose-slot').hidden=!!me?.slot;
    $('choose-slot').textContent=pendingSlot?'Joining…':'Join the table';
    $('choose-slot').disabled=!connected||!!pendingSlot;
    $('join-table').hidden=!!me?.slot;$('join-table').disabled=!connected||full||!!pendingSlot;
    $('join-table').textContent=pendingSlot?'Joining…':full?'All controllers are in use':'Join the table';
    if(!pendingSlot&&!me?.slot&&full)$('slot-status').textContent='The table is full. You can still look around.';
    else if(!pendingSlot&&$('slot-status').textContent==='The table is full. You can still look around.')$('slot-status').textContent='';
    if(pendingActivation&&!!state.layers[pendingActivation.layer]===pendingActivation.enabled)clearActivation();
    $('layer-enabled').checked=!!state.layers[layer.id];$('layer-enabled').disabled=!canEdit();
    const changing=pendingActivation?.layer===layer.id,active=!!state.layers[layer.id];
    $('layer-enabled').disabled=!canEdit()||!!pendingActivation;
    $('activation-label').textContent=active?'On':'Off';
    $('activity-status').textContent=!connected?'Reconnecting — changes paused.':state.paused?'The host has paused editing.':!me?.slot?'Looking around · Join from Home to edit.':changing?'Updating the table…':'';
    $('activity-status').hidden=!$('activity-status').textContent||!$('notice').hidden;
    for(const el of document.querySelectorAll('[data-layer]')){
      const active=!!state.layers[el.dataset.layer];el.classList.toggle('active',active);el.querySelector('.activity-state').textContent=active?'Shown on table':'';
    }
    $('slots').replaceChildren(...state.slots.map((id,index)=>{
      const p=state.participants.find(p=>p.id===id),row=document.createElement('div');row.className='slot';
      const label=document.createElement('span');label.textContent=`${index+1} · ${p?p.avatar+' '+p.name+(!p.online?' · reserved':''):'Available'}`;
      const button=document.createElement('button');button.textContent=id===identity.id?'Yours':id?'Occupied':'Join';button.disabled=!!id||!!me?.slot||!connection?.open;button.onclick=()=>{pendingSlot=index+1;$('slot-status').textContent='Joining controller '+pendingSlot+'…';saveIdentity();send({type:'claim-slot',slot:pendingSlot});};row.append(label,button);return row;
    }));
    if(!me?.slot && !spectatorChosen && !joining){joining=true;profile();}
    $('spectate').hidden=!!me?.slot;
    $('release-slot').hidden=!me?.slot;
    $('release-slot').disabled=!me?.slot;syncFrame();controls.update(state,canEdit()&&active&&!changing);if(mapView){mapView.setState(state);updateTools();}updateHint();

  }
  function activityCard(item){
    const card=document.createElement('div');card.className='app-card';card.dataset.layer=item.id;
    const open=document.createElement('button');open.className='open';
    const tile=document.createElement('span');tile.className='app-icon';tile.setAttribute('aria-hidden','true');
    const icon=document.createElement('img');icon.src=iconUrl(icons[item.id]||'grid-3x3');icon.alt='';tile.append(icon);
    if(item.id==='epc-btn'){const badge=document.createElement('img');badge.src=iconUrl('zap');badge.alt='';badge.className='energy-badge';tile.append(badge);}
    const name=document.createElement('span');name.textContent=presentation(item)[0];
    const status=document.createElement('span');status.className='activity-state';
    open.append(tile,name,status);open.onclick=()=>showLayer(item);card.append(open);return card;
  }
  for(const item of MR.LAYERS)$('layer-list').append(activityCard(item));
  $('apps').onclick=()=>{closeSheet();exitExpandedMap();unloadDashboard();document.body.classList.remove('map-open');$('workspace').hidden=true;$('drawer').hidden=false;send({type:'focus',layer:layer.id,tab:'controls'});$('drawer').querySelector('button')?.focus?.();};
  $('start-drawing').onclick=closeSheet;
  function clearActivation(){if(pendingActivation)clearTimeout(pendingActivation.timer);pendingActivation=null;}
  $('layer-enabled').onchange=e=>{
    const message={type:'layer',layer:layer.id,enabled:e.target.checked};
    e.target.checked=!!state?.layers[layer.id];if(!canEdit()||pendingActivation)return;
    if(send(message)){pendingActivation={...message,timer:setTimeout(()=>{clearActivation();notice('The table did not confirm the change. Please try again.');render();},20000)};render();}
  };
  $('tool').onchange=e=>mapView?.setTool(e.target.value);$('color').oninput=e=>{if(mapView)mapView.color=e.target.value;};$('width').onchange=e=>{if(mapView)mapView.width=Number(e.target.value);};
  function exitExpandedMap(){
    expandedMap=false;document.body.classList.remove('map-expanded');
    $('exit-fullscreen').hidden=true;$('expand-map').textContent='Full screen map';$('expand-map').setAttribute('aria-pressed','false');
    if(document.fullscreenElement===$('map-view'))document.exitFullscreen?.().catch(()=>{});
    requestAnimationFrame(()=>mapView?.map.resize());
  }
  $('expand-map').onclick=async()=>{
    if(expandedMap){exitExpandedMap();return;}
    closeSheet();expandedMap=true;$('exit-fullscreen').hidden=false;document.body.classList.add('map-expanded');
    $('expand-map').textContent='Exit fullscreen';$('expand-map').setAttribute('aria-pressed','true');
    try{await $('map-view').requestFullscreen?.();}catch{/* Viewport mode remains available. */}
    mapView?.map.resize();
  };
  $('exit-fullscreen').onclick=exitExpandedMap;
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&expandedMap)exitExpandedMap();else mapView?.map.resize();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expandedMap)exitExpandedMap();});
  $('fit').onclick=()=>mapView?.fit();$('finish').onclick=()=>mapView?.finish();$('cancel').onclick=()=>mapView?.cancel();$('delete').onclick=()=>mapView?.remove();
  $('edit-text').onclick=()=>mapView?.editText();
  $('undo').onclick=()=>send({type:'canvas',operation:'undo'});$('redo').onclick=()=>send({type:'canvas',operation:'redo'});
  $('avatar').replaceChildren(...MR.AVATARS.map(a=>new Option(a,a)));
  function profile(){const me=person();$('name').value=me?.name||'';$('avatar').value=me?.avatar||MR.AVATARS[0];$('profile').showModal();}
  function join(){
    if(!connection?.open||!sessionReady||pendingSlot||person()?.slot)return;
    saveIdentity();pendingSlot=true;$('slot-status').textContent='Joining the table…';
    if(!send({type:'claim-slot'})){pendingSlot=null;return;}
    joinTimer=setTimeout(()=>{pendingSlot=null;$('slot-status').textContent='Could not join. Please try again.';render();},15000);render();
  }
  $('join-table').onclick=join;
  $('profile-button').onclick=profile;$('choose-slot').onclick=profile;
  function saveIdentity(){const name=$('name').value.trim();if(name)send({type:'profile',name,avatar:$('avatar').value});}
  $('save-profile').onclick=()=>{saveIdentity();if(!joining)$('profile').close();else $('slot-status').textContent='Join the table, or just look around.';};
  function spectate(){spectatorChosen=true;joining=false;pendingSlot=null;clearTimeout(joinTimer);try{sessionStorage.setItem(identityKey+'-spectator','yes');}catch{}$('profile').close();}
  $('spectate').onclick=()=>{saveIdentity();spectate();};
  $('profile').addEventListener('cancel',()=>{if(joining)spectate();});
  $('profile').addEventListener('close',()=>{if(joining)spectate();});
  $('release-slot').onclick=()=>send({type:'release-slot'});
  window.addEventListener('message',({source,origin,data})=>{
    if(source!==$('dashboard').contentWindow||origin!==location.origin)return;
    if(data?.type==='dashboard-ready'){frameReady=true;frame({type:'open-layer',layer:layer.id});syncFrame();}
    if(data?.type==='dashboard-control'){if(data.message?.type==='ecom_activate')send({type:'layer',layer:'ecom-energy-btn',enabled:true});else send({type:'control',message:data.message});}
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
    if(message.type==='rejected'||message.type==='ended'){ended=true;clearActivation();pendingSlot=null;clearTimeout(joinTimer);notice(message.text);connection?.stop();render();$('connection').textContent='Session unavailable';}
    if(message.type==='ack'&&pendingActivation?.actionId===message.actionId){clearActivation();render();}
    if(message.type==='error'){if(pendingActivation?.actionId===message.actionId)clearActivation();if(pendingSlot){pendingSlot=null;clearTimeout(joinTimer);$('slot-status').textContent=message.text;}render();notice(message.text);}
    if(message.type==='rpc-result'||message.type==='error'&&message.requestId){
      const req=requests.get(message.requestId);if(req){clearTimeout(req.timer);requests.delete(message.requestId);frame({...message,type:'rpc-result',requestId:req.frameId,error:message.type==='error'?message.text:undefined});}
    }
  }
  function status(value){
    if(ended)return;
    if(value==='connected'){focus();render();return;}
    if(value==='disconnected'){
      sessionReady=false;clearActivation();pendingSlot=null;clearTimeout(joinTimer);
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
