/* Exhibit runtime: one RAF owner, explicit layer lifecycle, fixed quality. */
(function(root) {
  'use strict';
  function createFrames(request, cancel, clock, hidden = () => false) {
    const pending = new Map(),costs=new Map(),renders=new Map(); let frame = null, serial = 0;
    function tick(now) {
      frame = null;
      if (!hidden()) {
        const batch = [...pending.values()]; pending.clear();
        for (const task of batch) { const start=clock();try { task.callback(now); } catch(error) { root.console?.error(error); }const ms=clock()-start,old=costs.get(task.owner);costs.set(task.owner,{meanMs:old?old.meanMs*.9+ms*.1:ms,maxMs:Math.max(old?.maxMs||0,ms)}); }
      }
      if (pending.size && frame === null) frame = request(tick);
    }
    return {
      request(owner, callback) {
        const id = ++serial; pending.set(owner, {id, owner, callback});
        if (frame === null) frame = request(tick);
        return id;
      },
      cancel(id) {
        for (const [owner, task] of pending) if (task.id === id) pending.delete(owner);
        if (!pending.size && frame !== null) { cancel(frame); frame = null; }
      },
      delta(owner, now = clock()) {
        const previous = this.times.get(owner); this.times.set(owner, now);
        return previous === undefined ? 0 : Math.max(0, Math.min((now - previous) / 1000, .05));
      },
      times: new Map(), reset() { this.times.clear(); },
      recordRender(owner, now=clock()) {
        const samples=renders.get(owner)||[];samples.push(now);if(samples.length>600)samples.shift();renders.set(owner,samples);
      },
      stats: () => ({canvasSubmissions:Object.fromEntries([...renders].map(([owner,samples])=>[owner,{hz:samples.length>1?+(1000*(samples.length-1)/(samples.at(-1)-samples[0])).toFixed(1):0,samples:samples.length}])),pending:pending.size, owners:[...pending.keys()],costs:Object.fromEntries(costs)})
    };
  }
  if (typeof module !== 'undefined') module.exports = {createFrames};
  if (!root.document) return;
  root.MR_FRAMES = createFrames(root.requestAnimationFrame.bind(root), root.cancelAnimationFrame.bind(root), () => performance.now(), () => document.hidden);
  document.addEventListener('visibilitychange', () => root.MR_FRAMES.reset());
  let muted=false;
  const media=new Set(),buses=new Map();
  root.MR_AUDIO={
    track(element){media.add(element);element.muted=muted;return element;},
    destination(context){if(!buses.has(context)){const gain=context.createGain(),limiter=context.createDynamicsCompressor();gain.gain.value=muted?0:.7;limiter.threshold.value=-12;limiter.ratio.value=8;gain.connect(limiter);limiter.connect(context.destination);buses.set(context,gain);}return buses.get(context);},
    setMuted(value){muted=value;for(const element of media)element.muted=muted;for(const [context,gain]of buses)gain.gain.setTargetAtTime(muted?0:.7,context.currentTime,.05);},
    release(element){media.delete(element);},
    dispose(){for(const element of media)element.pause();media.clear();for(const gain of buses.values())gain.disconnect();buses.clear();}
  };
  root.mrMuseumAudio=url=>root.MR_AUDIO.track(new Audio(url));
  const entries = new Map(), channel = new BroadcastChannel('map_controller_channel');
  function state(entry) {
    const active = !!entry.api.getEnabled();
    const ready = entry.api.isReady ? entry.api.isReady() : true;
    const error=entry.error || entry.api.getError?.();
    return {requested:entry.requested, active, status:error ? 'error' : entry.pending || (active && !ready) ? 'loading' : active ? 'ready' : 'off', error:error || null};
  }
  function publish(id) {
    const entry = entries.get(id), value = state(entry), signature = JSON.stringify(value);
    if (entry.signature === signature) return;
    entry.signature = signature;
    if(value.active)root.clipTableLayers?.();
    const button = document.getElementById(id);
    if(button) { button.setAttribute('aria-pressed', String(value.active)); button.setAttribute('aria-busy',String(value.status==='loading')); }
    channel.postMessage({type:'animation_state',animationId:id,isActive:value.active,lifecycle:value});
    root.dispatchEvent(new CustomEvent('mr-layer-state',{detail:{id,...value}}));
  }
  root.MR_LAYERS = {
    register(id, api) {
      if(entries.has(id)) return;
      entries.set(id,{api,requested:!!api.getEnabled(),revision:0,pending:false,error:null});
      publish(id);
    },
    has: id => entries.has(id),
    getState: () => Object.fromEntries([...entries].map(([id,e]) => [id,state(e)])),
    async setEnabled(id, enabled) {
      const entry = entries.get(id);
      if (!entry || typeof enabled !== 'boolean') throw Error('Layer is not ready');
      if(root.APP_CONFIG?.disabledLayers?.includes(id)) throw Error('Layer is unavailable for this location');
      if(entry.requested===enabled && (entry.pending || (!!entry.api.getEnabled()===enabled && !entry.error))) return;
      entry.requested=enabled; entry.error=null; const revision=++entry.revision;
      entry.pending=enabled;entry.startedAt=performance.now(); publish(id);
      try {
        await (enabled ? entry.api.enable(() => entry.revision===revision && entry.requested) : entry.api.disable());
        if(entry.revision!==revision)return;
        if(enabled && !entry.api.getEnabled()) throw Error('Layer could not start. Please retry.');
      } catch(error) {
        if(entry.revision!==revision)return;
        entry.error=error.message; entry.requested=false;
        entry.api.disable(); root.showToast?.(error.message);
      } finally {
        if(entry.revision===revision){entry.pending=false;publish(id);}
      }
    },
    fail(id,message){const e=entries.get(id);if(!e)return;e.revision++;e.pending=false;e.requested=false;e.error=message;e.api.disable();publish(id);root.showToast?.(message);},
    dispose() { for(const [id,e] of entries){e.revision++;e.api.disable();e.api.dispose?.();} entries.clear(); root.MR_AUDIO.dispose(); channel.close(); clearInterval(poll); }
  };
  document.addEventListener('click', event => {
    const button=event.target.closest?.('button');
    if(!button || !entries.has(button.id))return;
    event.preventDefault(); event.stopImmediatePropagation();
    const entry=entries.get(button.id);
    root.MR_LAYERS.setEnabled(button.id,!entry.requested);
  },true);
  // Legacy module timers may stop themselves (grid) or report service failure.
  const poll=setInterval(()=>{for(const [id,e] of entries){const loading=state(e).status==='loading';if(loading && !e.wasLoading)e.startedAt=performance.now();e.wasLoading=loading;if(loading && performance.now()-e.startedAt>45000){root.MR_LAYERS.fail(id,'Layer loading timed out. Check the data service, then retry.');continue;}if(!e.pending && !e.error)e.requested=!!e.api.getEnabled();publish(id);}},250);
  root.addEventListener('pagehide',()=>root.MR_LAYERS.dispose(),{once:true});
})(typeof window === 'undefined' ? globalThis : window);
