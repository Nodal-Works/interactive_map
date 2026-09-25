(function(){
  'use strict';
  const $=id=>document.getElementById(id),channel=new BroadcastChannel('mr_session_admin');let state,lastInvite='',lastReceived=0;
  function command(action,extra={}){channel.postMessage({type:'admin-command',action,...extra});}
  function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
  function render(){
    if(!state)return;
    $('host-status').textContent=state.endedAt?'Session ended. Start a new round when ready.':state.peerStatus+(state.paused?' · remote editing paused':' · four shared controller slots');
    $('save').textContent=state.saveStatus;
    $('copy').disabled=!state.invite;$('pause').disabled=!!state.endedAt;$('end').disabled=!!state.endedAt;$('start').disabled=!state.endedAt;
    $('pause').textContent=state.paused?'Resume editing':'Pause editing';
    $('download').href='/api/session/'+state.sessionId;
    if(lastInvite!==state.invite){lastInvite=state.invite;$('qr').replaceChildren();$('qr').hidden=!lastInvite;if(lastInvite&&typeof QRCode!=='undefined')new QRCode($('qr'),{text:lastInvite,width:220,height:220,correctLevel:QRCode.CorrectLevel.L});$('invite').textContent=lastInvite;$('invite').href=lastInvite;}
    const online=state.participants.filter(p=>p.online),editors=online.filter(p=>p.slot).length;
    $('metrics').replaceChildren(...[[editors+'/4','Active editors'],[online.length-editors,'Spectators'],[state.participants.length,'People joined'],[state.eventCount,'Recorded events'],[Math.floor(((state.endedAt?Date.parse(state.endedAt):Date.now())-Date.parse(state.startedAt))/60000)+'m','Session duration']].map(([value,label])=>{const el=text('div','', 'metric');el.append(text('b',value),text('span',label));return el;}));
    $('participants').replaceChildren(...state.participants.map(p=>{
      const row=text('div','','participant');const info=text('span',p.avatar+' '+p.name);info.append(text('small',` · ${p.online?'online':'offline'} · ${p.slot?'Controller '+p.slot:'Spectator'}${p.focus?' · '+(MR.LAYERS.find(l=>l.id===p.focus.layer)?.name||'')+' / '+p.focus.tab:''}`));row.append(info);
      if(p.slot){const release=text('button','Release slot');release.onclick=()=>command('release',{personId:p.id});row.append(release);}return row;
    }));
    if(!state.participants.length)$('participants').append(text('p','Share the QR code to welcome the first participant.'));
    $('services').replaceChildren(...Object.entries(state.services).map(([name,value])=>text('p',`${name} · :${value.port} · ${value.status}`)));
    const filter=$('filter').value.toLowerCase();
    $('events').replaceChildren(...state.events.filter(e=>JSON.stringify([e.actor?.name,e.kind,e.details]).toLowerCase().includes(filter)).map(e=>{
      const li=text('li',`${e.actor?.avatar||'⌂'} ${e.actor?.name||'Session'} · ${e.kind}`);
      li.append(text('small',new Date(e.timestamp).toLocaleTimeString()+' · '+JSON.stringify(e.details)));return li;
    }));
    $('objects').replaceChildren(...state.objects.map(object=>{
      const row=text('div','','participant');row.append(text('span',`${object.creatorName} · ${object.tool}${object.text?' · '+object.text:''}`));const remove=text('button','Delete');remove.onclick=()=>command('canvas',{command:{operation:'delete',objectId:object.id}});row.append(remove);return row;
    }));
  }
  channel.onmessage=({data})=>{if(data?.type==='admin-state'){state=data;lastReceived=Date.now();render();}if(data?.type==='notice')$('host-status').textContent=data.text;};
  $('filter').oninput=render;$('copy').onclick=()=>navigator.clipboard.writeText(state.invite);
  $('pause').onclick=()=>command('pause',{value:!state.paused});$('end').onclick=()=>{if(confirm('End this session and disconnect its participants?'))command('end');};$('start').onclick=()=>command('start');
  setInterval(()=>{channel.postMessage({type:'admin-request'});if(lastReceived&&Date.now()-lastReceived>7000){$('host-status').textContent='Main display disconnected. Open it through the launcher to start a fresh round.';$('copy').disabled=true;$('pause').disabled=true;$('end').disabled=true;$('qr').hidden=true;}},2500);
  channel.postMessage({type:'admin-request'});
})();
