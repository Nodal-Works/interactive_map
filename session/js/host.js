(async function() {
  'use strict';
  const adapter = window.MR_ADAPTER;
  if (!adapter) return;
  const admin = new BroadcastChannel('mr_session_admin');
  const people = new Map(), slots = [null,null,null,null], events = [], objects = [];
  const undo = new Map(), redo = new Map(), drafts = new Map();
  let peer, invite = '', sessionId = MR.id(), token = MR.id(), startedAt = new Date().toISOString();
  let endedAt = null, paused = false, revision = 0, saveStatus = 'Local canvas', saveTimer, broadcastTimer, saving = false, dirty = false;
  let local = false, peerStatus = 'Connecting', mapBusy = false;
  const hostActor = {id:'host', name:'Host', avatar:'⌂', color:'#ffffff'};
  const seen = new Set();
  let runtime = {clientUrl: MR_CONFIG.clientUrl, services:{}};
  function roster() {return [...people.values()].map(p => ({id:p.id,name:p.name,avatar:p.avatar,color:p.color,
    online:!!p.connection?.open, slot:slots.indexOf(p.id) + 1 || null, focus:p.focus, joinedAt:p.joinedAt,lastSeen:p.lastSeen}));}
  function snapshot() {
    return {type:'state', sessionId, revision, endedAt, paused, participants:roster(), slots, objects,
      ...adapter.getState()};
  }
  function summary() {
    return {...snapshot(), type:'admin-state', invite, peerStatus, saveStatus, services:runtime.services,
      events:events.slice(-150).reverse(), eventCount:events.length, startedAt};
  }
  function publish() {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      const state = snapshot();
      for (const person of people.values()) if (person.connection?.open) person.send(state);
      admin.postMessage(summary());
      window.dispatchEvent(new CustomEvent('mr-session-state', {detail: state}));
    }, 60);
  }
  function logState() {
    const current = adapter.getState();
    return {layers:current.layers, objects:structuredClone(objects), table:current.table,
      isovist:current.isovist,cfd:current.cfd,thermal:current.thermal,
      controls: current.messages.filter(m => MR.validControl(m) && m.type !== 'ecom_layer')};
  }
  function documentLog() {
    return {schemaVersion:2, sessionId, startedAt, endedAt, updatedAt:new Date().toISOString(),revision,
      release:MR.RELEASE, table:adapter.table(), participants:roster(), finalState:logState(), events};
  }
  async function save() {
    if (!local || saving || !dirty) return;
    saving = true; dirty = false; saveStatus = 'Saving…';
    try {
      const response = await fetch('/api/session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(documentLog())});
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      saveStatus = 'Saved locally';
    } catch (error) {dirty = true; saveStatus = 'Save failed — retrying: ' + error.message;}
    saving = false;
    if (dirty) saveTimer = setTimeout(save, 2000);
    admin.postMessage(summary());
  }
  function record(kind, actor, details) {
    revision++;
    events.push({seq:events.length+1,timestamp:new Date().toISOString(),elapsedMs:Date.now()-Date.parse(startedAt),
      actor:actor ? {id:actor.id,name:actor.name,avatar:actor.avatar,color:actor.color,slot:slots.indexOf(actor.id)+1 || null}:null,
      kind,details,stateAfter:logState(),participantsAfter:roster(),slotsAfter:[...slots]});
    dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); publish();
  }
  function renderObjects() {
    window.MR_CFD_OBSTACLES = objects.filter(o => o.tool === 'obstacle').map(o => ({type:'Feature',properties:{id:o.id},
      geometry:{type:'Polygon',coordinates:[[...o.points,o.points[0]]]}}));
    window.dispatchEvent(new CustomEvent('mr-objects', {detail:{objects,drafts:[...drafts.values()]}}));
  }
  function canvas(actor, action) {
    if (action.operation === 'undo' || action.operation === 'redo') {
      const from = action.operation === 'undo' ? undo : redo, to = action.operation === 'undo' ? redo : undo;
      const history = from.get(actor.id) || [], change = history.pop();
      if (!change) return;
      const target = action.operation === 'undo' ? change.before : change.after;
      const currentId = (change.after || change.before).id;
      const index = objects.findIndex(o => o.id === currentId);
      const expected = action.operation === 'undo' ? change.after : change.before;
      if (JSON.stringify(objects[index] || null) !== JSON.stringify(expected)) {history.push(change); throw Error('This annotation changed since your edit');}
      if (target) {if (index < 0) objects.push(structuredClone(target)); else objects[index] = structuredClone(target);}
      else if (index >= 0) objects.splice(index,1);
      if (!to.has(actor.id)) to.set(actor.id, []); to.get(actor.id).push(change);
      record('canvas.' + action.operation,actor,{objectId:currentId});
    } else {
      if (action.operation === 'create' && objects.length >= 1000) throw Error('Canvas has reached 1,000 objects');
      if (action.operation === 'create' && objects.some(o => o.id === action.objectId)) throw Error('Annotation already exists');
      if (!['create','update','delete'].includes(action.operation)) throw Error('Unknown canvas action');
      const change = MR.editObject(objects,actor,action);
      if (!undo.has(actor.id)) undo.set(actor.id,[]);
      undo.get(actor.id).push(structuredClone(change)); redo.set(actor.id,[]);
      record('canvas.'+action.operation,actor,{objectId:(change.after||change.before).id,tool:(change.after||change.before).tool});
    }
    drafts.delete(actor.id); renderObjects(); window.dispatchEvent(new Event('cfd-geometry-changed')); publish();
  }
  function allowedFetch(path, method) {
    if (typeof path !== 'string' || path.includes('..') || path.includes('\\') || path.length > 1200) return false;
    if (method === 'GET' && /^\/api\/streetview\?/.test(path)) return true;
    return /^\/api\/services\/(ecom|coolpaths|sam)\//.test(path) && ['GET','POST'].includes(method);
  }
  async function request(person, message) {
    if (!allowedFetch(message.path,message.method)) throw Error('Service operation not allowed');
    if (message.method === 'POST' && (paused || !slots.includes(person.id))) throw Error('An editing slot is required');
    if (person.requests >= 4) throw Error('Please wait for the current request');
    if (typeof message.body !== 'string' && message.body != null) throw Error('Invalid body');
    if ((message.body?.length || 0) > 8*1024*1024) throw Error('Request too large');
    person.requests++;
    const connection = person.connection;
    try {
      const body = message.body == null ? undefined : Uint8Array.from(atob(message.body), c => c.charCodeAt(0));
      const response = await fetch(message.path,{method:message.method,headers:{'Content-Type':String(message.contentType || 'application/json').slice(0,200)},body,signal:AbortSignal.timeout(180000)});
      const blob = await response.blob();
      if (blob.size > 16*1024*1024) throw Error('Response too large');
      const encoded = await new Promise(resolve => {const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
      if (connection !== person.connection || !connection.open) return;
      person.send({type:'rpc-result',requestId:message.requestId,status:response.status,contentType:blob.type,body:encoded});
      if (message.method === 'POST') record('service.completed',person,{path:message.path,status:response.status});
    } finally {person.requests--;}
  }
  function release(id, actor=hostActor) {
    const index = slots.indexOf(id); if (index < 0) return;
    slots[index]=null; drafts.delete(id); renderObjects(); record('slot.released',actor,{participantId:id,slot:index+1});
  }
  async function handle(person,message) {
    if (endedAt || !message || typeof message !== 'object') return;
    person.lastSeen = Date.now();
    if (message.type === 'ping') {person.send({type:'pong',time:message.time});return;}
    const now = Date.now();
    if (now - person.rateStart > 1000) {person.rateStart=now;person.rate=0;}
    if (++person.rate > 80) return;
    try {
      if (message.type === 'profile') {
        if (typeof message.name !== 'string' || !message.name.trim() || message.name.length > 32 || !MR.AVATARS.includes(message.avatar)) throw Error('Invalid profile');
        person.name=message.name.trim(); person.avatar=message.avatar; record('profile.changed',person,{}); return;
      }
      if (message.type === 'focus') {
        if (MR.LAYERS.some(l=>l.id===message.layer)) person.focus={layer:message.layer,tab:message.tab==='map'?'map':'controls'};
        publish(); return;
      }
      if (message.type === 'claim-slot') {
        if (!Number.isInteger(message.slot) || message.slot<1 || message.slot>4) throw Error('Invalid slot');
        if (slots.includes(person.id)) return;
        if (slots[message.slot-1]) throw Error('That slot is occupied');
        slots[message.slot-1]=person.id; record('slot.claimed',person,{slot:message.slot}); return;
      }
      if (message.type === 'release-slot') {release(person.id,person);return;}
      if (message.type === 'rpc') {await request(person,message);return;}
      if (message.type === 'control' && MR.validControl(message.message) && /request|get_state|ping/.test(message.message.action || message.message.type)) {adapter.control(message.message);return;}
      if (paused || !slots.includes(person.id)) throw Error(paused?'Host paused remote editing':'Choose an editing slot first');
      if (message.type === 'draft') {
        if (message.object === null) drafts.delete(person.id);
        else if (MR.validObject(message.object)) drafts.set(person.id,{...message.object,creatorId:person.id,creatorName:person.name});
        renderObjects();
        for (const p of people.values()) if (p.connection?.open) p.send({type:'drafts',drafts:[...drafts.values()]});
        return;
      }
      if (typeof message.actionId !== 'string' || message.actionId.length > 80) throw Error('Missing action ID');
      const key=person.id+':'+message.actionId;
      if (seen.has(key)) {person.send({type:'ack',actionId:message.actionId});return;}
      if (message.type === 'layer') adapter.setLayer(message.layer,message.enabled);
      else if (message.type === 'control') adapter.control(message.message);
      else if (message.type === 'gesture') {
        const c=adapter.gesture(message);
        window.dispatchEvent(new CustomEvent('mr-pointer',{detail:{...person,coordinate:c}}));
        if (message.phase === 'move') {seen.add(key);return;}
      } else if (message.type === 'canvas') canvas(person,message);
      else throw Error('Unknown session action');
      seen.add(key); if (seen.size>10000) seen.delete(seen.values().next().value);
      if (message.type !== 'canvas') record(message.type,person,message.type === 'control' ? {type:message.message.type,action:message.message.action,value:message.message.value} : {layer:message.layer,enabled:message.enabled,x:message.x,y:message.y});
      person.send({type:'ack',actionId:message.actionId}); publish();
    } catch(error) {person.send({type:'error',requestId:message.requestId,actionId:message.actionId,text:error.message});}
  }
  function connect(connection) {
    const meta = connection.metadata || {};
    const reject = text => {connection.on('open',()=>{connection.send({type:'rejected',text});setTimeout(()=>connection.close(),100);});};
    if (endedAt || meta.token!==token || meta.release!==MR.RELEASE || !/^[a-f0-9]{32}$/.test(meta.clientId||'') || !/^[a-f0-9]{32}$/.test(meta.resumeKey||'')) {reject('Invitation expired or client version changed. Scan the current QR.');return;}
    let person=people.get(meta.clientId);
    if (person && person.resumeKey!==meta.resumeKey) {reject('Identity could not be verified');return;}
    if (!person && people.size>=64) {reject('The session has reached its participant limit');return;}
    const reconnect=!!person;
    if (!person) {
      const n=people.size;
      person={id:meta.clientId,resumeKey:meta.resumeKey,name:['Curious','Cosmic','Sunny','Merry'][n%4]+' '+['Otter','Fox','Owl','Penguin'][Math.floor(n/4)%4]+' '+(n+1),avatar:MR.AVATARS[n%MR.AVATARS.length],color:MR.COLORS[n%MR.COLORS.length],joinedAt:new Date().toISOString(),requests:0,rate:0,rateStart:0};
      people.set(person.id,person);
    }
    const previous=person.connection; person.connection=connection; previous?.close();
    person.send=MR.wire(connection,message=>{if(person.connection===connection)handle(person,message);});
    connection.on('open',()=>{
      if(person.connection!==connection)return;
      person.lastSeen=Date.now(); person.send({type:'welcome',personId:person.id,...snapshot()});
      // Explicit type after the snapshot; it also supplies the initial authoritative state.
      person.send({type:'identity',personId:person.id}); record(reconnect?'participant.reconnected':'participant.joined',person,{});
      fetch('media/building-footprints.geojson').then(r=>r.json()).then(data=>person.send({type:'base',data})).catch(()=>{});
    });
    connection.on('close',()=>{if(person.connection===connection){drafts.delete(person.id);renderObjects();record('participant.disconnected',person,{});}});
    connection.on('error',()=>{});
  }
  function end() {
    if(endedAt)return;
    endedAt=new Date().toISOString(); record('session.ended',hostActor,{});save();
    for(const p of people.values()) {p.send({type:'ended',text:'The host ended this session.'});setTimeout(()=>p.connection?.close(),150);}
    peer?.destroy(); invite='';publish();
  }
  admin.onmessage=({data})=>{
    if(data?.type==='admin-request'){admin.postMessage(summary());return;}
    if(data?.type!=='admin-command')return;
    if(data.action==='release')release(data.personId);
    if(data.action==='pause'){paused=!!data.value;drafts.clear();renderObjects();record('session.paused',hostActor,{paused});}
    if(data.action==='end')end();
    if(data.action==='start' && endedAt)location.reload();
    if(data.action==='canvas')try{canvas(hostActor,data.command);}catch(e){admin.postMessage({type:'notice',text:e.message});}
    if(data.action==='layer')adapter.setLayer(data.layer,!!data.enabled);
    if(data.action==='canvas-tool')window.dispatchEvent(new CustomEvent('mr-canvas-tool',{detail:data.tool}));
  };
  window.MR_SESSION={canvas:command=>canvas(hostActor,command),getObjects:()=>objects,getState:snapshot,publish,hostActor};
  window.addEventListener('mr-state',publish);
  window.addEventListener('mr-transform',()=>{drafts.clear();renderObjects();record('table.changed',hostActor,{});});
  window.addEventListener('mr-desktop-action',event=>{if(!endedAt && !/request|get_state|ping/.test(event.detail.action||event.detail.type))record('desktop.control',hostActor,{type:event.detail.type,action:event.detail.action,value:event.detail.value});});
  window.addEventListener('beforeunload',()=>{
    if(!local || endedAt)return;
    const payload=JSON.stringify({sessionId,endedAt:new Date().toISOString()});
    navigator.sendBeacon('/api/session/end',new Blob([payload],{type:'application/json'}));
  });
  setInterval(async()=>{
    for(const person of people.values()) if(person.connection?.open && Date.now()-person.lastSeen>22000)person.connection.close();
    if(mapBusy || ![...people.values()].some(p=>p.connection?.open && p.focus?.tab==='map'))return;
    mapBusy=true;
    try{const state=await adapter.mapState();for(const p of people.values())if(p.connection?.open && p.focus?.tab==='map')p.send(state);}catch(error){console.warn('Companion map:',error.message);}finally{mapBusy=false;}
  },1200);
  try {
    const response=await fetch('/api/runtime'); if(!response.ok)throw Error('Use start_services.sh to enable remote sessions');
    runtime=await response.json(); local=true;
    if(typeof Peer!=='function')throw Error('PeerJS could not load. Check internet access.');
    peer=new Peer(MR_CONFIG.peer);
    peer.on('open',id=>{
      const url=new URL(runtime.clientUrl || MR_CONFIG.clientUrl);url.search=new URLSearchParams({host:id,token,release:MR.RELEASE}).toString();
      invite=url.href;peerStatus='Ready';record('session.started',hostActor,{});window.dispatchEvent(new CustomEvent('mr-invite',{detail:invite}));
    });
    peer.on('connection',connect);
    peer.on('disconnected',()=>{peerStatus='Reconnecting';publish();if(!endedAt)try{peer.reconnect();}catch{}});
    peer.on('error',error=>{peerStatus=error.type||error.message;publish();});
    setInterval(()=>fetch('/api/runtime').then(r=>r.json()).then(value=>{runtime=value;admin.postMessage(summary());}).catch(()=>{}),10000);
  }catch(error){peerStatus=error.message;publish();}
})();
