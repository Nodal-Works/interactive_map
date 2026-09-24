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
    else {command('layer',{layer:'canvas-btn',enabled:true});command('canvas-tool',{tool:'pen'});showCanvasDashboard();}
  };
  const admin=document.createElement('a');admin.href='session/';admin.target='mr-studio-admin';admin.textContent='Session';
  const strip=document.createElement('div');strip.className='mr-session-strip';const bubbles=document.createElement('div');strip.append(bubbles,apps,canvas,admin);
  if(main){strip.style.cssText='position:fixed;bottom:10px;left:70px;z-index:1001';document.body.append(strip);}
  else document.querySelector('header')?.append(strip);
  function update(next){state=next;bubbles.replaceChildren();for(const p of next.participants.slice(0,8)){const b=document.createElement('span');b.className='bubble'+(p.online?'':' offline');b.style.setProperty('--color',p.color);b.textContent=p.avatar;b.title=p.name+(p.slot?' · Controller '+p.slot:' · Spectator');bubbles.append(b);}if(next.participants.length>8)bubbles.append('+'+(next.participants.length-8));
    for(const b of grid.children)b.classList.toggle('active',!!state.layers[b.dataset.layer]);
    renderCanvasObjects();
  }
  function renderCanvasObjects(){
    const list=document.getElementById('mr-canvas-objects');if(!list||!state)return;list.replaceChildren();
    for(const object of state.objects){const row=document.createElement('p'),label=document.createElement('span');label.textContent=object.creatorName+' · '+object.tool+(object.text?' · '+object.text:'');const remove=document.createElement('button');remove.textContent='Delete';remove.onclick=()=>command('canvas',{command:{operation:'delete',objectId:object.id}});row.append(label,' ',remove);list.append(row);}
  }
  function showCanvasDashboard(){
    if(main)return;
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
  window.addEventListener('mr-invite',({detail:url})=>{
    if(typeof QRCode==='undefined')return;
    for(const id of ['left-sidebar','right-sidebar']){
      const sidebar=document.getElementById(id),banner=document.createElement('div');banner.className='mr-qr-banner';banner.title='Join session — click for a larger QR';banner.role='button';banner.tabIndex=0;
      banner.onclick=()=>window.open('session/','mr-studio-admin');banner.onkeydown=e=>{if(e.key==='Enter')banner.click();};sidebar?.append(banner);new QRCode(banner,{text:url,width:180,height:180,correctLevel:QRCode.CorrectLevel.L});
      const place=()=>{
        const occupied=[...sidebar.querySelectorAll('.icon-btn,.sidebar-logo')].map(el=>el.getBoundingClientRect()).filter(r=>r.height>0).map(r=>[r.top-5,r.bottom+5]);
        const title=sidebar.querySelector('.sidebar-title');if(title){const range=document.createRange();range.selectNodeContents(title);const r=range.getBoundingClientRect();occupied.push([r.top-8,r.bottom+8]);}
        occupied.push([innerHeight,innerHeight]);occupied.sort((a,b)=>a[0]-b[0]);let end=8,best=null;
        for(const[start,stop]of occupied){if(start-end>=58&&(!best||start-end>best[1]-best[0]))best=[end,start];end=Math.max(end,stop);}
        banner.hidden=!best;if(best){banner.style.bottom='auto';banner.style.top=((best[0]+best[1])/2-27)+'px';}
      };place();window.addEventListener('resize',place);
    }
  });
})();
