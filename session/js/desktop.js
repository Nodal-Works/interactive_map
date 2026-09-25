(function(){
  if(new URLSearchParams(location.search).has('sessionController'))return;
  const main=!!window.MR_ADAPTER,channel=new BroadcastChannel('mr_session_admin');
  let state;
  function command(action,extra={}){channel.postMessage({type:'admin-command',action,...extra});}
  const dialog=document.createElement('dialog');dialog.className='mr-dialog';
  const close=document.createElement('button');close.className='close';close.textContent='Close';close.onclick=()=>dialog.close();
  const title=document.createElement('h2');title.textContent='Apps';const grid=document.createElement('div');grid.className='mr-app-grid';
  dialog.append(close,title,grid);document.body.append(dialog);
  for(const layer of MR.LAYERS){
    const row=document.createElement('div');row.className='mr-app-row';row.dataset.layer=layer.id;
    const button=document.createElement('button');button.textContent=layer.icon+' '+layer.name;
    button.onclick=()=>{if(main){window.open('controller.html#layer='+encodeURIComponent(layer.id),'ACE_Controller');command('open-layer',{layer:layer.id});}else if(layer.id==='canvas-btn')showCanvasDashboard();else openHostLayer(layer.id);dialog.close();};
    const toggle=document.createElement('input');toggle.type='checkbox';toggle.setAttribute('aria-label','Enable '+layer.name);
    toggle.onchange=async()=>{try{if(main){await MR_ADAPTER.setLayer(layer.id,toggle.checked);MR_SESSION.publish();if(layer.id==='canvas-btn'&&toggle.checked)showDrawing();}else command('layer',{layer:layer.id,enabled:toggle.checked});}catch(error){toggle.checked=!!state?.layers[layer.id];alert(error.message);}};
    row.append(button,toggle);grid.append(row);
  }
  channel.addEventListener('message',({data})=>{
    if(!main&&data?.type==='admin-command'&&data.action==='open-layer'){
      if(data.layer==='canvas-btn')showCanvasDashboard();else if(MR.LAYERS.some(l=>l.id===data.layer))openHostLayer(data.layer);
    }
    if(!main&&data?.type==='notice')alert(data.text);
  });
  const apps=document.createElement('button');apps.textContent='▦ Apps';apps.title='Open app drawer';apps.onclick=()=>dialog.showModal();
  const canvas=document.createElement('button');canvas.textContent='✎ Canvas';canvas.id=main?'canvas-btn':'canvas-dashboard-btn';canvas.title='Draw on the map';canvas.onclick=()=>{
    if(main){MR_ADAPTER.setLayer('canvas-btn',true);MR_SESSION.publish();showDrawing();}
    else {command('layer',{layer:'canvas-btn',enabled:true});command('canvas-tool',{tool:'pen'});showCanvasDashboard();}
  };
  const admin=document.createElement('a');admin.href='controller.html#session';admin.textContent='Session';
  if(main)admin.target='ACE_Controller';
  else {
    admin.href='#session';
    const panel=document.getElementById('main-panel'),sessionPage=document.createElement('section');
    sessionPage.id='mr-session-page';sessionPage.hidden=true;panel.append(sessionPage);
    const showSession=()=>{
      const visible=location.hash==='#session';document.body.classList.toggle('mr-session-open',visible);sessionPage.hidden=!visible;
      admin.setAttribute('aria-current',visible?'page':'false');
      if(visible){document.getElementById('welcome-screen').classList.add('hidden');if(!sessionPage.firstChild){const frame=document.createElement('iframe');frame.src='session/?embedded=1';frame.title='Session management';sessionPage.append(frame);}}
    };
    const leaveSession=()=>{if(location.hash==='#session'){history.replaceState(null,'',location.pathname+location.search);showSession();}};
    document.querySelectorAll('.control-btn').forEach(button=>button.addEventListener('click',leaveSession,true));
    apps.addEventListener('click',leaveSession);canvas.addEventListener('click',leaveSession);
    admin.addEventListener('click',()=>{if(location.hash==='#session')showSession();});
    const showLinkedLayer=()=>{
      if(!location.hash.startsWith('#layer='))return;
      const id=decodeURIComponent(location.hash.slice(7));
      if(!MR.LAYERS.some(layer=>layer.id===id))return;
      if(id==='canvas-btn')showCanvasDashboard();else openHostLayer(id);
    };
    window.addEventListener('hashchange',()=>{showSession();showLinkedLayer();});showSession();showLinkedLayer();
  }
  const strip=document.createElement('div');strip.className='mr-session-strip';const bubbles=document.createElement('div');strip.append(bubbles,apps,canvas,admin);
  if(main){strip.style.cssText='position:fixed;bottom:10px;left:70px;z-index:1001';document.body.append(strip);}
  else document.querySelector('header')?.append(strip);
  function update(next){const previous=state;const canvasActivated=!!state&&next.layers['canvas-btn']&&!state.layers['canvas-btn'];state=next;if(!main&&canvasActivated)showCanvasDashboard();bubbles.replaceChildren();for(const p of next.participants.slice(0,8)){const b=document.createElement('span');b.className='bubble'+(p.online?'':' offline');b.style.setProperty('--color',p.color);b.textContent=p.avatar;b.title=p.name+(p.slot?' · Controller '+p.slot:' · Spectator');bubbles.append(b);}if(next.participants.length>8)bubbles.append('+'+(next.participants.length-8));
    for(const b of grid.children){b.classList.toggle('active',!!state.layers[b.dataset.layer]);b.querySelector('input').checked=!!state.layers[b.dataset.layer];}
    if(!main)for(const layer of MR.LAYERS){
      if(layer.id==='canvas-btn')continue;
      if(previous?previous.layers[layer.id]!==next.layers[layer.id]:next.layers[layer.id])setAnimationState(layer.id,!!next.layers[layer.id],!!previous);
    }
    renderCanvasObjects();
  }
  function renderCanvasObjects(){
    const list=document.getElementById('mr-canvas-objects');if(!list||!state)return;list.replaceChildren();
    for(const object of state.objects){const row=document.createElement('p'),label=document.createElement('span');label.textContent=object.creatorName+' · '+object.tool+(object.text?' · '+object.text:'');const remove=document.createElement('button');remove.textContent='Delete';remove.onclick=()=>command('canvas',{command:{operation:'delete',objectId:object.id}});row.append(label,' ',remove);list.append(row);}
  }
  function showCanvasDashboard(){
    if(main)return;
    if(location.hash==='#session'){history.replaceState(null,'',location.pathname+location.search);window.dispatchEvent(new Event('hashchange'));}
    setSunStudyLayout(false);document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('dashboard-title').textContent='Canvas';document.getElementById('legend-title').textContent='Shared annotations';
    document.getElementById('legend-content').innerHTML='<p>Draw on the main map with the mouse. Canvas stays above every active layer.</p><div id="mr-canvas-objects"></div>';
    document.getElementById('dashboard-content').innerHTML='<div class="dashboard-card"><p>Select a tool, then use the mouse on the map.</p><select id="mr-canvas-tool" aria-label="Canvas tool"></select> <input id="mr-canvas-color" type="color" value="#38bdf8" aria-label="Drawing colour"><select id="mr-canvas-width" aria-label="Stroke width"><option value="2">Fine</option><option value="4">Medium</option><option value="8">Bold</option></select><p id="mr-canvas-actions"></p></div>';
    const picker=document.getElementById('mr-canvas-tool');for(const[value,label]of [['pen','Pen'],['line','Line'],['arrow','Arrow'],['polygon','Polygon'],['marker','Marker'],['comment','Comment'],['select','Select / move'],['reshape','Edit vertices'],['off','Finish drawing']])picker.add(new Option(label,value));
    const sync=()=>command('canvas-tool',{tool:picker.value,color:document.getElementById('mr-canvas-color').value,width:Number(document.getElementById('mr-canvas-width').value)});
    picker.onchange=sync;document.getElementById('mr-canvas-color').oninput=sync;document.getElementById('mr-canvas-width').onchange=sync;
    for(const action of ['undo','redo']){const b=document.createElement('button');b.textContent=action==='undo'?'Undo host edit':'Redo host edit';b.onclick=()=>command('canvas',{command:{operation:action}});document.getElementById('mr-canvas-actions').append(b);}
    renderCanvasObjects();
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
  window.addEventListener('mr-canvas-tool',e=>{if(e.detail.tool==='off'){toolbar.hidden=true;window.MR_CANVAS_EDITING=false;view.setTool('off');}else{tool.value=e.detail.tool;if(e.detail.color){color.value=e.detail.color;view.color=e.detail.color;}if(e.detail.width)view.width=e.detail.width;showDrawing();}});
  window.addEventListener('mr-session-state',e=>view.setState(e.detail));
  window.addEventListener('mr-objects',e=>{view.objects=e.detail.objects;view.drafts=e.detail.drafts;view.render();});
  window.addEventListener('mr-canvas-visibility',e=>{view.layers={...view.layers,'canvas-btn':e.detail};if(!e.detail){toolbar.hidden=true;window.MR_CANVAS_EDITING=false;view.setTool('off');}view.render();});
  const pointers=new Map();window.addEventListener('mr-pointer',({detail:p})=>{
    let marker=pointers.get(p.id);if(!marker){marker=document.createElement('div');marker.className='mr-pointer';document.body.append(marker);pointers.set(p.id,marker);}marker.style.setProperty('--pointer-color',p.color);marker.textContent=p.name;const c=view.project(p.coordinate);marker.style.left=c.x+'px';marker.style.top=c.y+'px';marker.hidden=false;clearTimeout(marker.timer);marker.timer=setTimeout(()=>marker.hidden=true,2500);
  });
  let inviteUrl='', ribbonCm=5;
  try{ribbonCm=Math.min(10,Math.max(5,Number(localStorage.getItem('mr-ribbon-cm'))||5));}catch{}
  const ribbon=document.createElement('div');ribbon.className='mr-idle-ribbon';ribbon.hidden=true;
  const label=document.createElement('div');label.className='mr-idle-label';label.textContent='Street Life';
  const join=document.createElement('div');join.className='mr-idle-join';
  const caption=document.createElement('span');caption.textContent='Scan to join';
  const qr=document.createElement('div');qr.className='mr-idle-qr';join.append(caption,qr);ribbon.append(label,join);document.body.append(ribbon);
  const setting=document.createElement('label');setting.className='mr-ribbon-setting';setting.textContent='Bottom ribbon height (cm) ';
  const height=document.createElement('input');height.type='number';height.min='5';height.max='10';height.step='0.5';height.value=ribbonCm;
  setting.append(height);dialog.append(setting);
  height.onchange=()=>{ribbonCm=Math.min(10,Math.max(5,Number(height.value)||5));height.value=ribbonCm;try{localStorage.setItem('mr-ribbon-cm',ribbonCm);}catch{}placeRibbon();};
  function placeRibbon(){
    const session=window.MR_SESSION?.getState();
    ribbon.hidden=!inviteUrl||!!session?.endedAt||!window.streetLifeAnimation?.isActive()||Object.values(session?.layers||{}).some(Boolean);
    if(ribbon.hidden)return;
    const t=MR_ADAPTER.table(),rect=map.getContainer().getBoundingClientRect(),h=t.height*ribbonCm/t.heightCm;
    ribbon.style.cssText=`left:${t.left+rect.left}px;top:${t.top+rect.top+t.height-h}px;width:${t.width}px;height:${h}px;--ribbon-size:${h}px`;
  }
  window.addEventListener('mr-invite',({detail:url})=>{
    inviteUrl=url;qr.replaceChildren();
    if(url&&typeof QRCode!=='undefined')new QRCode(qr,{text:url,width:512,height:512,correctLevel:QRCode.CorrectLevel.L,colorDark:'#000000',colorLight:'#ffffff'});
    placeRibbon();
  });
  for(const event of ['mr-session-state','mr-transform','mr-street-life','resize'])window.addEventListener(event,placeRibbon);
  map.on('move',placeRibbon);
})();
