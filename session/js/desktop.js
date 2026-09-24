(function(){
  if(new URLSearchParams(location.search).has('sessionController'))return;
  const main=!!window.MR_ADAPTER,channel=new BroadcastChannel('mr_session_admin');
  let state;
  function command(action,extra={}){channel.postMessage({type:'admin-command',action,...extra});}
  const dialog=document.createElement('dialog');dialog.className='mr-dialog';
  const close=document.createElement('button');close.className='close';close.textContent='Close';close.onclick=()=>dialog.close();
  const title=document.createElement('h2');title.textContent='Apps';const grid=document.createElement('div');grid.className='mr-app-grid';
  dialog.append(close,title,grid);document.body.append(dialog);
  for(const layer of MR.LAYERS){const button=document.createElement('button');button.textContent=layer.icon+' '+layer.name;button.dataset.layer=layer.id;
    button.onclick=()=>{const enabled=!state?.layers[layer.id];if(main){MR_ADAPTER.setLayer(layer.id,enabled);MR_SESSION.publish();if(layer.id==='canvas-btn'&&enabled)showDrawing();}
      else {command('layer',{layer:layer.id,enabled});if(layer.id==='canvas-btn')command('canvas-tool',{tool:enabled?'pen':'off'});else {updateMetadata(layer.id);updateDashboard(layer.id);}}
    };grid.append(button);}
  const apps=document.createElement('button');apps.textContent='▦ Apps';apps.title='Open app drawer';apps.onclick=()=>dialog.showModal();
  const canvas=document.createElement('button');canvas.textContent='✎ Canvas';canvas.id=main?'canvas-btn':'canvas-dashboard-btn';canvas.title='Draw on the map';canvas.onclick=()=>{
    if(main){MR_ADAPTER.setLayer('canvas-btn',true);MR_SESSION.publish();showDrawing();}
    else {command('layer',{layer:'canvas-btn',enabled:true});command('canvas-tool',{tool:'pen'});}
  };
  const admin=document.createElement('a');admin.href='session/';admin.target='mr-studio-admin';admin.textContent='Session';
  const strip=document.createElement('div');strip.className='mr-session-strip';const bubbles=document.createElement('div');strip.append(bubbles,apps,canvas,admin);
  if(main){const parent=document.querySelector('#left-sidebar .icon-controls');parent?.append(apps,canvas);apps.className='icon-btn';apps.textContent='▦';canvas.className='icon-btn';canvas.textContent='✎';}
  else document.querySelector('header')?.append(strip);
  function update(next){state=next;bubbles.replaceChildren();for(const p of next.participants.slice(0,8)){const b=document.createElement('span');b.className='bubble'+(p.online?'':' offline');b.style.setProperty('--color',p.color);b.textContent=p.avatar;b.title=p.name+(p.slot?' · Controller '+p.slot:' · Spectator');bubbles.append(b);}if(next.participants.length>8)bubbles.append('+'+(next.participants.length-8));
    for(const b of grid.children)b.classList.toggle('active',!!state.layers[b.dataset.layer]);
  }
  channel.onmessage=({data})=>{if(data?.type==='admin-state')update(data);};channel.postMessage({type:'admin-request'});
  if(!main)return;
  window.addEventListener('mr-session-state',e=>update(e.detail));
  const toolbar=document.createElement('div');toolbar.className='mr-local-toolbar';toolbar.hidden=true;
  const tool=document.createElement('select');for(const[value,label]of [['pen','Pen'],['line','Line'],['arrow','Arrow'],['polygon','Polygon'],['marker','Marker'],['comment','Comment'],['select','Select / move'],['reshape','Edit vertices'],['obstacle','Wind obstacle']])tool.add(new Option(label,value));
  const color=document.createElement('input');color.type='color';color.value='#38bdf8';color.setAttribute('aria-label','Drawing colour');toolbar.append(tool,color);document.body.append(toolbar);
  const view=new MR_MAP.CompanionMap({element:map.getContainer(),map,desktop:true,identity:()=>({id:'host',canEdit:true}),send:message=>{
    if(message.type==='canvas'){try{MR_SESSION.canvas(message);}catch(error){showToast(error.message);}}
  }});view.setTool('off');
  function showDrawing(){toolbar.hidden=false;window.MR_CANVAS_EDITING=true;view.setState(MR_SESSION.getState());view.setTool(tool.value);}
  tool.onchange=()=>view.setTool(tool.value);color.oninput=()=>view.color=color.value;
  for(const[label,action]of [['Close shape',()=>view.finish()],['Cancel',()=>view.cancel()],['Delete',()=>view.remove()],['Undo',()=>MR_SESSION.canvas({operation:'undo'})],['Redo',()=>MR_SESSION.canvas({operation:'redo'})],['Done',()=>{toolbar.hidden=true;window.MR_CANVAS_EDITING=false;view.setTool('off');}]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{try{action();}catch(e){showToast(e.message);}};toolbar.append(button);}
  window.addEventListener('mr-canvas-tool',e=>{if(e.detail==='off'){toolbar.hidden=true;window.MR_CANVAS_EDITING=false;view.setTool('off');}else{tool.value=e.detail;showDrawing();}});
  window.addEventListener('mr-session-state',e=>view.setState(e.detail));
  window.addEventListener('mr-objects',e=>{view.objects=e.detail.objects;view.drafts=e.detail.drafts;view.render();});
  window.addEventListener('mr-canvas-visibility',e=>{view.layers={...view.layers,'canvas-btn':e.detail};view.render();});
  const pointers=new Map();window.addEventListener('mr-pointer',({detail:p})=>{
    let marker=pointers.get(p.id);if(!marker){marker=document.createElement('div');marker.className='mr-pointer';document.body.append(marker);pointers.set(p.id,marker);}marker.style.setProperty('--pointer-color',p.color);marker.textContent=p.name;const c=view.project(p.coordinate);marker.style.left=c.x+'px';marker.style.top=c.y+'px';marker.hidden=false;clearTimeout(marker.timer);marker.timer=setTimeout(()=>marker.hidden=true,2500);
  });
  window.addEventListener('mr-invite',({detail:url})=>{
    if(typeof QRCode==='undefined')return;
    for(const id of ['left-sidebar','right-sidebar']){const banner=document.createElement('div');banner.className='mr-qr-banner';banner.title='Join session — click for a larger QR';banner.onclick=()=>window.open('session/','mr-studio-admin');document.getElementById(id)?.append(banner);new QRCode(banner,{text:url,width:180,height:180,correctLevel:QRCode.CorrectLevel.L});}
  });
})();
