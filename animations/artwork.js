(function(){
  'use strict';
  const C=window.ArtworkCore,channel=new BroadcastChannel('map_controller_channel');
  const canvas=document.createElement('canvas');canvas.id='artwork-canvas';canvas.hidden=true;document.body.append(canvas);
  const ctx=canvas.getContext('2d'),hud=document.createElement('div');hud.id='artwork-hud';hud.hidden=true;
  hud.innerHTML='<div class="artwork-caption"><span id="artwork-chapter">Artwork</span><span>Vishvi Rajakaruna</span></div><div id="artwork-hint">Click to reveal · M to magnify</div><div class="artwork-controls"><button data-artwork="previous" aria-label="Previous chapter">Back</button><button data-artwork="next">Next</button><button data-artwork="restart">Replay</button><button data-artwork="show_all">Show all</button><button data-artwork="retry" hidden>Retry</button><button data-artwork="stop">Close</button></div>';
  document.body.append(hud);
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const state={isActive:false,loading:false,error:null,chapter:0,fromChapter:0,transitioning:false,startedAt:0,reducedMotion:media.matches,hover:0,lens:{enabled:false,pinned:false,x:.5,y:.5,zoom:3,diameter:600,span:600}};
  let scene=null,controller=null,generation=0,raf=0,transform=null,saved=[],latestPointer=0,pointerTimer=0,lastRender=0,dirty=true;
  const button=()=>document.getElementById('artwork-btn');
  function snapshot(){return {...state,lens:{...state.lens},sentAt:Date.now()};}
  function publish(){if(window.MR_ADAPTER)MR_ADAPTER.active['artwork-btn']=state.isActive;canvas.dataset.chapter=String(state.chapter);canvas.dataset.status=state.loading?'loading':state.error?'error':state.isActive?'active':'inactive';updateHUD();channel.postMessage({type:'artwork_state',...snapshot()});}
  function updateHUD(){
    button()?.classList.toggle('active',state.isActive);
    const mag=document.getElementById('artwork-magnifier-btn');if(mag){mag.hidden=!state.isActive;mag.classList.toggle('active',state.lens.enabled);mag.setAttribute('aria-pressed',String(state.lens.enabled));}
    document.getElementById('artwork-chapter').textContent=state.loading?'Preparing the drawing…':state.error?'Artwork unavailable':state.chapter===0?'The drawing':state.chapter===8?'All seven artworks':`Artwork ${state.chapter} / 7`;
    document.getElementById('artwork-hint').textContent=state.error|| (state.lens.enabled?(state.lens.pinned?'Lens pinned · click to release':'Move to explore · click to pin') : state.chapter===8?'Hover to explore · M to magnify':'Click to reveal · M to magnify');
    canvas.style.cursor=state.lens.enabled?'crosshair':'pointer';
    hud.querySelector('[data-artwork="retry"]').hidden=!state.error;
    for(const b of hud.querySelectorAll('[data-artwork]'))b.disabled= !['stop','retry'].includes(b.dataset.artwork)&&(state.loading||!!state.error||(state.transitioning&&['next','previous'].includes(b.dataset.artwork))||(b.dataset.artwork==='next'&&state.chapter===8)||(b.dataset.artwork==='previous'&&state.chapter===0));
  }
  function resize(){if(!state.isActive)return;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);dirty=true;project();schedule();}
  function project(){if(!scene||!window.map)return;const m=scene.manifest.registration.matrix,rect=map.getContainer().getBoundingClientRect();
    const point=(x,y)=>{const p=map.project(C.geo(m,x,y));return {x:p.x+rect.left,y:p.y+rect.top};};
    transform=C.affine(point(0,0),point(C.W,0),point(0,C.H));state.lens.span=state.lens.diameter/(state.lens.zoom*transform.scale);dirty=true;
  }
  function schedule(){if(!raf&&state.isActive&&!document.hidden)raf=requestAnimationFrame(render);}
  function render(stamp=performance.now()){raf=0;if(!state.isActive)return;if(state.lens.enabled&&!state.transitioning&&!dirty&&stamp-lastRender<33){schedule();return;}lastRender=stamp;const now=Date.now(),dpr=canvas.width/innerWidth;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);
    if(state.loading||state.error){ctx.fillStyle='rgba(0,0,0,.94)';ctx.fillRect(0,0,innerWidth,innerHeight);return;}
    const f=C.frame(state,now);ctx.fillStyle=`rgba(0,0,0,${f.black})`;ctx.fillRect(0,0,innerWidth,innerHeight);
    if(scene&&transform){const size=window.computeOverlayPixelSize(),left=(innerWidth-size.w)/2,top=(innerHeight-size.h)/2;ctx.save();ctx.beginPath();ctx.rect(left,top,size.w,size.h);ctx.clip();
      ctx.transform(transform.a,transform.b,transform.c,transform.d,transform.e,transform.f);scene.draw(ctx,state,now);ctx.restore();
      if(state.lens.enabled){
        const x=state.lens.x*C.W,y=state.lens.y*C.H,r=state.lens.span/2;
        const arrival=state.reducedMotion?1:C.ease((now-(state.lens.changedAt||0))/550);
        const breath=state.reducedMotion?1:.88+.12*Math.sin(now*Math.PI/4000);
        ctx.save();ctx.transform(transform.a,transform.b,transform.c,transform.d,transform.e,transform.f);
        // Quiet the whole table outside the sample, preserving its calibration.
        ctx.fillStyle=`rgba(0,0,0,${.8*arrival})`;ctx.beginPath();ctx.rect(-C.W*8,-C.H*8,C.W*16,C.H*16);ctx.arc(x,y,r,0,Math.PI*2);ctx.fill('evenodd');
        const halo=ctx.createRadialGradient(x,y,r*.82,x,y,r*1.65);
        halo.addColorStop(0,'rgba(255,213,143,0)');halo.addColorStop(.23,`rgba(255,222,166,${.18*breath*arrival})`);halo.addColorStop(.5,`rgba(235,191,114,${.065*arrival})`);halo.addColorStop(1,'rgba(235,191,114,0)');
        ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,r*1.65,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=state.lens.pinned?'rgba(255,223,167,.9)':'rgba(255,241,210,.7)';ctx.lineWidth=1/transform.scale;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle=`rgba(255,251,233,${.6*breath})`;ctx.lineWidth=2/transform.scale;ctx.beginPath();ctx.arc(x,y,r+2/transform.scale,Math.PI*1.1,Math.PI*1.65);ctx.stroke();
        ctx.strokeStyle='rgba(255,226,170,.16)';ctx.lineWidth=.75/transform.scale;ctx.beginPath();ctx.arc(x,y,r-3/transform.scale,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
    }
    dirty=false;
    if(state.lens.enabled&&!state.reducedMotion||now-(state.hoverStartedAt||0)<450)schedule();
    if(state.transitioning){if(f.done){state.transitioning=false;publish();}else schedule();}
  }
  function setLayer(id,on){if(window.MR_ADAPTER)MR_ADAPTER.setLayer(id,on);else {const b=document.getElementById(id);if(b&&b.classList.contains('active')!==on)b.click();}}
  function suspend(){saved=(window.MR?.LAYERS||[]).filter(l=>l.id!=='artwork-btn'&&(window.MR_ADAPTER?.active[l.id]||document.getElementById(l.id)?.classList.contains('active'))).map(l=>l.id);for(const id of saved)setLayer(id,false);window.streetLifeAnimation?.stop();}
  async function start(){if(state.isActive)return;state.isActive=true;state.loading=true;state.error=null;state.chapter=state.fromChapter=0;state.transitioning=false;state.lens.enabled=false;state.lens.pinned=false;
    button()?.classList.add('active');document.body.classList.add('artwork-presenting');suspend();canvas.hidden=hud.hidden=false;bind();resize();channel.postMessage({type:'animation_state',animationId:'artwork-btn',isActive:true});publish();await load();}
  async function load(){const own=++generation;controller?.abort();controller=new AbortController();state.loading=true;state.error=null;publish();schedule();
    try{scene=scene||await C.Scene.load(controller.signal);if(own!==generation||!state.isActive)return;state.loading=false;state.startedAt=Date.now();state.transitioning=true;project();publish();schedule();}
    catch(e){if(own!==generation||!state.isActive||e.name==='AbortError')return;state.loading=false;state.error='The artwork could not load. Please retry.';publish();schedule();}
  }
  function stop(exclude){if(!state.isActive)return;state.isActive=false;++generation;controller?.abort();cancelAnimationFrame(raf);raf=0;state.loading=false;state.transitioning=false;state.lens.enabled=false;canvas.hidden=hud.hidden=true;unbind();ctx.clearRect(0,0,canvas.width,canvas.height);button()?.classList.remove('active');document.body.classList.remove('artwork-presenting');channel.postMessage({type:'animation_state',animationId:'artwork-btn',isActive:false});publish();
    const restore=saved;saved=[];for(const id of restore)if(id!==exclude)setLayer(id,true);window.streetLifeAnimation?.updateVisibility();}
  function control(action,value){
    if(action==='request_state'){publish();return;}
    if(!state.isActive)return;
    if(action==='stop'){stop();return;}if(action==='retry'){load();return;}
    if(action==='set_lens'){state.lens.enabled=!!value;state.lens.pinned=false;state.lens.changedAt=Date.now();}
    else if(action==='set_lens_position'){if(!state.lens.enabled||state.lens.pinned||!value||!Number.isFinite(value.x)||!Number.isFinite(value.y)||value.x<0||value.x>1||value.y<0||value.y>1)return;state.lens.x=value.x;state.lens.y=value.y;}
    else if(action==='set_zoom'){if(!Number.isFinite(value)||value<2||value>6)return;state.lens.zoom=value;project();}
    else if(action==='set_lens_diameter'){if(!Number.isFinite(value)||value<100||value>720)return;state.lens.diameter=value;project();}
    else if(action==='pin_lens'){state.lens.pinned=!!value;}
    else {
      if(state.loading||state.error||state.transitioning&&['next','previous'].includes(action))return;
      const chapter=action==='next'?state.chapter+1:action==='previous'?state.chapter-1:action==='restart'?0:action==='show_all'?8:null;
      if(chapter===null||!C.transition(state,chapter))return;
    }
    publish();dirty=true;schedule();
  }
  function move(event){if(!scene||state.loading||state.error||!transform)return;const p=transform.inverse(event.clientX,event.clientY);if(p.x<0||p.y<0||p.x>C.W||p.y>C.H)return;
    if(state.lens.enabled&&!state.lens.pinned){state.lens.x=p.x/C.W;state.lens.y=p.y/C.H;dirty=true;schedule();if(!pointerTimer){const delay=Math.max(0,50-(performance.now()-latestPointer));pointerTimer=setTimeout(()=>{pointerTimer=0;latestPointer=performance.now();if(state.isActive)publish();},delay);}}
    else if(state.chapter===8&&!state.lens.enabled){const found=scene.items.find(i=>Math.hypot(i.anchor[0]-p.x,i.anchor[1]-p.y)<45);if(state.hover!==(found?.id||0)){state.previousHover=state.hover;state.hover=found?.id||0;state.hoverStartedAt=Date.now();publish();schedule();}}
  }
  function leave(){if(state.hover&&!state.lens.enabled){state.previousHover=state.hover;state.hover=0;state.hoverStartedAt=Date.now();publish();schedule();}}
  function click(e){if(e.button!==0)return;e.preventDefault();e.stopPropagation();if(state.lens.enabled)control('pin_lens',!state.lens.pinned);else control('next');}
  function keyboard(e){if(!state.isActive||e.repeat||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const action=e.key==='ArrowRight'?'next':e.key==='ArrowLeft'?'previous':e.key.toLowerCase()==='m'?'set_lens':e.key==='Escape'&&state.lens.enabled?'set_lens':null;
    if(action){e.preventDefault();e.stopImmediatePropagation();control(action,e.key==='Escape'?false:!state.lens.enabled);}}
  function switching(e){const b=e.target.closest?.('.icon-btn');if(b&&b.id!=='artwork-btn'&&b.id!=='artwork-magnifier-btn'&&window.MR?.LAYERS.some(l=>l.id===b.id))stop(b.id);}
  function mapChanged(){project();publish();schedule();}
  function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0;}else schedule();}
  function bind(){canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('click',click);window.addEventListener('keydown',keyboard,true);document.addEventListener('click',switching,true);window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);map.on('move',mapChanged);}
  function unbind(){clearTimeout(pointerTimer);pointerTimer=0;canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('click',click);window.removeEventListener('keydown',keyboard,true);document.removeEventListener('click',switching,true);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);map.off('move',mapChanged);}
  channel.onmessage=({data})=>{if(data.type==='artwork_control'&&(!window.MR||MR.validControl(data)))control(data.action,data.value);};
  hud.addEventListener('click',e=>{const b=e.target.closest('[data-artwork]');if(b)control(b.dataset.artwork);});
  button()?.addEventListener('click',()=>{if(state.isActive)stop();else start().catch(error=>{console.error('Artwork activation failed',error);state.error=error.message;state.loading=false;publish();});});
  document.getElementById('artwork-magnifier-btn')?.addEventListener('click',()=>control('set_lens',!state.lens.enabled));
  media.addEventListener('change',()=>{state.reducedMotion=media.matches;if(state.isActive){publish();schedule();}});
  window.artworkAnimation={start,stop,toggle:()=>state.isActive?stop():start(),control,getState:snapshot,isActive:()=>state.isActive};
})();
