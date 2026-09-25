(function(){
  'use strict';
  const channel=new BroadcastChannel('map_controller_channel'),C=window.ArtworkCore;
  const clientMode=new URLSearchParams(location.search).get('sessionController')==='1';
  let state=null,scene=null,lens=null,frame=0,load=null,visible=false,clockOffset=0,lastDraw=0,measuredDiameter=0,sampleTimer=0,pendingSample=null,lastSampleAt=0,navigatorBase=null,navigatorKey='';
  const canControl=()=>!clientMode||!document.body.classList.contains('mr-readonly');
  const send=(action,value)=>{if(action==='request_state'||canControl())channel.postMessage({type:'artwork_control',action,...(value===undefined?{}:{value})});};
  function paint(now){frame=0;if(!visible||document.hidden||!scene||!state?.isActive)return;
    const canvas=document.getElementById('artwork-dashboard-view');if(!canvas)return;
    const time=Date.now()+clockOffset;
    if(state.lens.enabled){
      if(!lens)lens=new C.Lens(canvas);
      if(now-lastDraw>32||state.reducedMotion){lens.draw(scene,state,time);lastDraw=now;}
      if(clientMode)drawNavigator(time);
      if(!state.reducedMotion||state.transitioning)schedule();
    }else{
      if(lens){lens.dispose();lens=null;}
      const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const ctx=canvas.getContext('2d'),scale=Math.min(w/C.W,h/C.H);ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.setTransform(scale,0,0,scale,(w-C.W*scale)/2,(h-C.H*scale)/2);scene.draw(ctx,state,time);
      if(state.transitioning||time-(state.hoverStartedAt||0)<450)schedule();
    }
  }
  function drawNavigator(time){
    const canvas=document.getElementById('artwork-navigator');if(!canvas||!scene)return;
    const w=Math.round(canvas.getBoundingClientRect().width*Math.min(devicePixelRatio||1,2)),h=Math.round(w*C.H/C.W);if(!w)return;
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;navigatorKey='';}
    const key=[w,h,state.chapter,state.fromChapter,state.startedAt,state.hover,state.transitioning?time:0].join(':');
    navigatorBase ||= document.createElement('canvas');
    if(navigatorKey!==key){navigatorBase.width=w;navigatorBase.height=h;const c=navigatorBase.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,w,h);c.scale(w/C.W,h/C.H);scene.draw(c,state,time);navigatorKey=key;}
    const c=canvas.getContext('2d');c.clearRect(0,0,w,h);c.drawImage(navigatorBase,0,0);c.strokeStyle='#ffe0a6';c.lineWidth=1.5*(devicePixelRatio||1);c.beginPath();c.arc(state.lens.x*w,state.lens.y*h,state.lens.span*w/C.W/2,0,Math.PI*2);c.stroke();
  }
  function queueSample(point){
    if(!canControl()||!state?.isActive||!state.lens.enabled||state.lens.pinned)return;
    pendingSample=point;
    if(!sampleTimer)sampleTimer=setTimeout(()=>{sampleTimer=0;const p=pendingSample;pendingSample=null;lastSampleAt=performance.now();if(p&&state?.isActive&&state.lens.enabled&&!state.lens.pinned)send('set_lens_position',p);},Math.max(0,50-(performance.now()-lastSampleAt)));
  }
  function bindNavigator(){
    const canvas=document.getElementById('artwork-navigator');let pointer=null;
    const sample=e=>{const r=canvas.getBoundingClientRect();queueSample({x:C.clamp((e.clientX-r.left)/r.width),y:C.clamp((e.clientY-r.top)/r.height)});};
    canvas.addEventListener('pointerdown',e=>{if(!canControl()||!state?.isActive||state.lens.pinned||e.button!==0)return;e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);sample(e);});
    canvas.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();sample(e);}});
    const end=e=>{if(e.pointerId!==pointer)return;if(e.type==='pointerup')sample(e);if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);pointer=null;};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('keydown',e=>{const delta={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]}[e.key];if(!delta||!state)return;e.preventDefault();queueSample({x:C.clamp(state.lens.x+delta[0]),y:C.clamp(state.lens.y+delta[1])});});
  }
  function schedule(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(paint);}
  function refresh(){if(!visible)return;
    const panel=document.getElementById('artwork-dashboard');if(!panel)return;
    const active=!!state?.isActive,enabled=active&&state.lens.enabled;panel.classList.toggle('lens-active',enabled);
    const title=document.getElementById('artwork-dashboard-title'),status=document.getElementById('artwork-dashboard-status');
    title.textContent=enabled?'Look closer':state?.chapter===8?'The complete composition':state?.chapter?`Artwork ${state.chapter}`:'The drawing';
    status.textContent=state?.error||(!active?'Turn on Artwork to begin':state.loading?'Preparing Vishvi’s drawing…':enabled?(state.lens.pinned?(clientMode?'Pinned · tap Unpin to explore':'Pinned · click the map to release'):(clientMode?'Drag across the drawing below to explore':'Move across the map · click to pin')):'A study of art, architecture and visibility');
    for(const b of panel.querySelectorAll('[data-artwork-action]')){
      const action=b.dataset.artworkAction;b.disabled=!active||state.loading||!!state.error;
      if(['next','previous'].includes(action))b.disabled ||= state.transitioning||action==='next'&&state.chapter===8||action==='previous'&&state.chapter===0;
      if(action==='retry'){b.hidden=!state?.error;b.disabled=!active;}
      if(action==='set_lens'){b.classList.toggle('selected',enabled);b.setAttribute('aria-pressed',String(enabled));}
      if(action==='pin_lens'){b.hidden=!enabled;b.textContent=state?.lens.pinned?'Unpin':'Pin';}
    }
    const zoom=document.getElementById('artwork-zoom');zoom.disabled=!enabled;zoom.value=state?.lens.zoom||3;
    document.getElementById('artwork-zoom-value').textContent=`${zoom.value}×`;
    panel.querySelector('.artwork-zoom').hidden=!enabled;
    panel.querySelector('.artwork-navigator-wrap').hidden=!(clientMode&&enabled);
    document.getElementById('artwork-navigator').setAttribute('aria-disabled',String(!canControl()||!enabled||state?.lens.pinned));
    const dots=panel.querySelectorAll('.artwork-chapters span');dots.forEach((dot,i)=>{dot.classList.toggle('revealed',active&&(state.chapter===8||i<state.chapter));dot.classList.toggle('current',state?.chapter===i+1);});
    if(active&&!scene&&!load)loadAssets();
    schedule();measure();
  }
  async function loadAssets(){load=new AbortController();const own=load;try{const result=await C.Scene.load(own.signal);if(load!==own)return;scene=result;schedule();}catch(e){if(e.name!=='AbortError'&&visible){document.getElementById('artwork-dashboard-status').textContent='Dashboard artwork could not load. Retry to reconnect.';const b=document.querySelector('[data-artwork-action="retry"]');b.hidden=false;b.disabled=false;}}finally{if(load===own)load=null;}}
  function measure(){if(clientMode||!visible||!state?.lens.enabled)return;const canvas=document.getElementById('artwork-dashboard-view'),diameter=Math.round(canvas.getBoundingClientRect().width);if(diameter>=100&&diameter<=720&&Math.abs(diameter-measuredDiameter)>2){measuredDiameter=diameter;send('set_lens_diameter',diameter);}}
  function show(){if(visible&&document.getElementById('artwork-dashboard')){refresh();send('request_state');return;}if(visible)hide();visible=true;measuredDiameter=0;
    document.getElementById('main-panel').classList.add('artwork-mode');
    document.getElementById('dashboard-title').textContent='Artwork';
    document.getElementById('dashboard-content').innerHTML=`<div id="artwork-dashboard">
      <div class="artwork-kicker">LINDHOLMEN · VISIBILITY STUDIES</div><h2 id="artwork-dashboard-title">The drawing</h2>
      <p id="artwork-dashboard-status" aria-live="polite">Connecting to the map…</p>
      <div class="artwork-view-wrap"><canvas id="artwork-dashboard-view" aria-label="Vishvi Rajakaruna’s artwork, enlarged when the magnifier is active"></canvas></div>
      <div class="artwork-navigator-wrap" hidden><canvas id="artwork-navigator" tabindex="0" role="img" aria-label="Position the magnifier on the drawing" aria-describedby="artwork-navigator-hint"></canvas><p id="artwork-navigator-hint">Drag to explore · arrow keys move the lens</p></div>
      <div class="artwork-chapters" aria-label="Seven artwork chapters">${Array.from({length:7},(_,i)=>`<span title="Artwork ${i+1}"></span>`).join('')}</div>
      <div class="artwork-dashboard-controls"><button data-artwork-action="previous">Back</button><button data-artwork-action="next">Next <span aria-hidden="true">→</span></button><button data-artwork-action="set_lens" aria-pressed="false"><span class="material-icons" aria-hidden="true">search</span> Magnifier</button><button data-artwork-action="pin_lens" hidden>Pin</button></div>
      <div class="artwork-zoom" hidden><label for="artwork-zoom">Magnification</label><input id="artwork-zoom" type="range" min="2" max="6" step=".25" value="3"><output id="artwork-zoom-value">3×</output></div>
      <div class="artwork-secondary-controls"><button data-artwork-action="restart">Replay</button><button data-artwork-action="show_all">Show all</button><button data-artwork-action="retry" hidden>Retry</button></div>
      <p class="artwork-credit">Artwork and visibility studies by <strong>Vishvi Rajakaruna</strong></p></div>`;
    document.getElementById('legend-content').textContent='Original architectural linework and seven artwork visibility studies.';
    const panel=document.getElementById('artwork-dashboard');panel.addEventListener('click',e=>{const b=e.target.closest('[data-artwork-action]');if(!b)return;const a=b.dataset.artworkAction;
      if(a==='retry'){load?.abort();load=null;scene=null;loadAssets();if(state?.error)send('retry');}
      else send(a,a==='set_lens'?!state?.lens.enabled:a==='pin_lens'?!state?.lens.pinned:undefined);
    });
    bindNavigator();
    document.getElementById('artwork-zoom').addEventListener('input',e=>send('set_zoom',Number(e.target.value)));
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);window.addEventListener('keydown',keys,true);
    refresh();send('request_state');
  }
  function hide(){visible=false;clearTimeout(sampleTimer);sampleTimer=0;pendingSample=null;navigatorBase=null;navigatorKey='';cancelAnimationFrame(frame);frame=0;lens?.dispose();lens=null;load?.abort();load=null;scene=null;window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',keys,true);document.getElementById('main-panel')?.classList.remove('artwork-mode');}
  function resize(){measure();schedule();}
  function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();}
  function keys(e){if(!visible||!canControl()||!state?.isActive||e.repeat||e.target.id==='artwork-navigator'||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const a=e.key==='ArrowRight'?'next':e.key==='ArrowLeft'?'previous':e.key.toLowerCase()==='m'?'set_lens':e.key==='Escape'&&state.lens.enabled?'set_lens':null;
    if(a){e.preventDefault();e.stopImmediatePropagation();send(a,a==='set_lens'?(e.key==='Escape'?false:!state.lens.enabled):undefined);}}
  channel.onmessage=({data})=>{if(data.type!=='artwork_state')return;const changed=state?.isActive!==data.isActive;state=data;if(changed&&typeof setAnimationState==='function')setAnimationState('artwork-btn',state.isActive,false);clockOffset=data.sentAt-Date.now();
    if(!state.isActive){cancelAnimationFrame(frame);frame=0;lens?.dispose();lens=null;scene=null;load?.abort();load=null;}
    refresh();};
  window.ArtworkDashboard={show,hide,getState:()=>state};
})();
