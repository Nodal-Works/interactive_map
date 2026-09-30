/* Opt-in measurement UI, also injected into an unchanged Git revision by benchmark_demo.py. */
(function(){
  window.MR_CFD_PROFILE = true;
  window.MR_CFD_PROFILE_SAMPLES = { frames: [], solver: [], gpu: [] };
  function windProfile(){
    const result={};
    for(const [kind,rows] of Object.entries(window.MR_CFD_PROFILE_SAMPLES)){
      const summary={count:rows.total||rows.length,retained:rows.length};
      for(const key of Object.keys(rows[0]||{})){
        if(typeof rows[0][key]!=='number'){summary[key]=rows.at(-1)[key];continue;}
        const values=rows.map(r=>r[key]).sort((a,b)=>a-b);
        summary[key]={mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)],max:values.at(-1)};
      }
      result[kind]=summary;
    }
    return result;
  }
  const panel=document.createElement('details');panel.open=true;
  panel.style.cssText='position:fixed;right:65px;top:8px;z-index:12000;background:#101827;color:white;padding:12px;width:360px;font:13px monospace;max-height:45vh;overflow:auto';
  panel.innerHTML='<summary>Demo diagnostics</summary><button id="measure-demo">Measure 30 seconds</button> <button id="soak-demo">Run four-hour soak</button> <button id="stop-soak-demo">Stop soak</button><pre id="demo-metrics">Ready</pre>';
  document.body.append(panel);
  const windControls=document.createElement('div');
  windControls.innerHTML='<p>Wind renderer: <a href="?cfdBackend=canvas2d">Canvas reference</a> · <a href="?cfdBackend=webgl2">WebGL2</a></p><label>Wind target style <select id="wind-target-style"><option value="particles">Particles</option><option value="ribbons">Ribbons</option></select></label> <button id="wind-target">Apply full wind target</button><p><label>Sample duration <select id="sample-duration"><option value="30000">30 seconds</option><option value="60000">60 seconds</option><option value="600000">10 minutes</option></select></label></p>';
  panel.insertBefore(windControls,panel.querySelector('pre'));
  const recovery=document.createElement('button');recovery.textContent='Test wind GPU recovery';recovery.onclick=()=>window.dispatchEvent(new Event('cfd-profile-context-loss'));windControls.append(recovery);
  const backendStatus=document.createElement('p');backendStatus.id='wind-backend-status';windControls.append(backendStatus);
  setInterval(()=>{const r=window.MR_CFD_RENDERER;backendStatus.textContent=r?`${r.backend}: ${r.submitted} submitted / ${r.completed} GPU completed${r.context?' · '+r.context:''}${r.fallbackReason?' · '+r.fallbackReason:''}`:'Wind inactive';},1000);
  const control=new BroadcastChannel('map_controller_channel');
  windControls.querySelector('#wind-target').onclick=async()=>{
    for(const [action,value] of [['set_resolution',300],['set_particles',1000],['toggle_trees',true],['set_wind_speed',5],['set_wind_direction',0],['set_facade_glow',true],['set_visual_style',windControls.querySelector('select').value]])control.postMessage({type:'cfd_control',action,value});
    if(!window.MR_LAYERS?.getState()['cfd-simulation-btn']?.active)document.getElementById('cfd-simulation-btn').click();
  };
  const pauseLabel=document.createElement('label');
  pauseLabel.innerHTML='<input type="checkbox" id="pause-wind-profile"> Pause wind solver (diagnostic only)';
  panel.insertBefore(pauseLabel,panel.querySelector('pre'));
  pauseLabel.querySelector('input').onchange=e=>window.dispatchEvent(new CustomEvent('cfd-profile-pause',{detail:e.target.checked}));
  let solverPaused=false;
  window.addEventListener('cfd-profile-state',e=>{solverPaused=!!e.detail;if(sampling&&solverPaused)pausedDuringSample=true;pauseLabel.querySelector('input').checked=solverPaused;});
  const output=panel.querySelector('pre');let sampling=false,soaking=false,hiddenFrames=0,longTasks=0,soakTimer,sampleTimer,soakRun=null,pausedDuringSample=false;
  document.addEventListener('visibilitychange',()=>{if(sampling&&document.hidden)hiddenFrames++;});
  try{new PerformanceObserver(list=>{if(sampling)longTasks+=list.getEntries().length;}).observe({type:'longtask',buffered:false});}catch{}
  function graphics(){
    const canvas=document.querySelector('.maplibregl-canvas');
    const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
    const ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'Unavailable';
  }
  function sample(label='manual',requestedDuration){
    if(sampling)return Promise.resolve(null);
    let resolveSample;const completion=new Promise(resolve=>{resolveSample=resolve;});
    sampling=true;hiddenFrames=document.hidden?1:0;longTasks=0;pausedDuringSample=solverPaused;
    window.MR_CFD_PROFILE_SAMPLES = { frames: [], solver: [], gpu: [] };
    const duration=requestedDuration||Number(panel.querySelector('#sample-duration').value);
    const counters={...window.MR_CFD_RENDERER};
    const start=performance.now(),memoryStart=performance.memory?.usedJSHeapSize,frames=[];
    let previous=null,finished=false,timer;
    const finish=()=>{
      if(finished)return;finished=true;clearTimeout(timer);
      sampling=false;frames.sort((a,b)=>a-b);
      const mean=frames.reduce((a,b)=>a+b,0)/frames.length;
      const elapsedMs=performance.now()-start;
      const report={label,soakRun:soaking?soakRun:null,graphics:graphics(),date:new Date().toISOString(),viewport:[innerWidth,innerHeight],screen:[screen.width,screen.height],devicePixelRatio,
        elapsedMs,windFrameHz:(window.MR_CFD_PROFILE_SAMPLES.frames.total||window.MR_CFD_PROFILE_SAMPLES.frames.length)*1000/elapsedMs,solverPaused,pausedDuringSample,
        samples:frames.length,hiddenFrames,meanMs:mean,fps:1000/mean,p95Ms:frames[Math.floor(frames.length*.95)],longTasks,
        nodes:document.getElementsByTagName('*').length,canvases:document.querySelectorAll('canvas').length,
        activeButtons:Array.from(document.querySelectorAll('.icon-btn.active,.icon-btn.toggled-on')).map(b=>b.id),
        memoryStart,memoryEnd:performance.memory?.usedJSHeapSize,layers:window.MR_LAYERS?.getState(),scheduler:window.MR_FRAMES?.stats(),
        windProfile: windProfile(),windSettings:window.cfdSession?.getState(),windCanvas:[document.getElementById('cfd-simulation-canvas')?.width,document.getElementById('cfd-simulation-canvas')?.height],
        stormwaterRenderer:{...window.MR_STORMWATER_RENDERER},renderer:{...window.MR_CFD_RENDERER},submittedHz:((window.MR_CFD_RENDERER?.submitted||0)-(counters.submitted||0))*1000/elapsedMs,
        gpuCompletedHz:counters.backend==='webgl2'?((window.MR_CFD_RENDERER?.completed||0)-(counters.completed||0))*1000/elapsedMs:null,
        ribbonGeometryHz:((window.MR_CFD_RENDERER?.geometryCompleted||0)-(counters.geometryCompleted||0))*1000/elapsedMs,
        backpressureFrames:(window.MR_CFD_RENDERER?.backpressure||0)-(counters.backpressure||0)};
      const intervals=window.MR_CFD_PROFILE_SAMPLES.frames.intervals;
      report.windIntervals=null;
      if(intervals?.count){let count=0,p95=0;for(let i=0;i<intervals.histogram.length;i++){count+=intervals.histogram[i];if(count>intervals.count*.95){p95=i/10;break;}}
        report.windIntervals={count:intervals.count,p95,over33ms:intervals.over33ms/intervals.count};}
      output.textContent=JSON.stringify(report,null,2);
      fetch('/__benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)}).catch(()=>{});
      resolveSample(report);
    };
    function frame(now){
      if(finished)return;
      if(document.hidden){hiddenFrames++;previous=null;}else{if(previous!==null)frames.push(now-previous);previous=now;}
      if(now-start<duration)requestAnimationFrame(frame);else finish();
    }
    output.textContent='Measuring '+label+'…';requestAnimationFrame(frame);
    // Hidden tabs may stop rAF entirely. Such samples are explicitly invalid.
    timer=setTimeout(()=>{if(!finished){if(document.hidden)hiddenFrames++;finish();}},duration+2000);
    return completion;
  }
  const acceptance=document.createElement('button');acceptance.textContent='Run wind acceptance sequence';windControls.append(acceptance);
  acceptance.onclick=async()=>{
    if(sampling||soaking)return;acceptance.disabled=true;
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),reports=[];
    try{
      document.getElementById('start-overlay')?.click();
      windControls.querySelector('#wind-target-style').value='particles';windControls.querySelector('#wind-target').click();
      output.textContent='Warming full-quality particles for 30 seconds…';await pause(30000);
      for(const style of ['particles','ribbons']){
        control.postMessage({type:'cfd_control',action:'set_visual_style',value:style});
        output.textContent='Warming '+style+'…';await pause(10000);
        for(let i=1;i<=3;i++)reports.push(await sample(`wind acceptance ${style} ${i}`,60000));
      }
      reports.push(await sample('wind acceptance ribbons sustained 10 minutes',600000));
      const pass=reports.every(r=>r&&!r.hiddenFrames&&!r.pausedDuringSample&&r.renderer.backend==='webgl2'&&r.gpuCompletedHz>=59&&(r.windSettings.visualStyle!=='ribbons'||r.ribbonGeometryHz>=59)&&r.windIntervals?.p95<=17.5&&r.windIntervals?.over33ms<.01);
      output.textContent=JSON.stringify({label:'wind acceptance summary',pass,runs:reports.map(r=>({label:r?.label,hz:r?.gpuCompletedHz,intervals:r?.windIntervals,phase:r?.windSettings.phase}))},null,2);
    }finally{acceptance.disabled=false;}
  };
  panel.querySelector('#measure-demo').onclick=()=>sample();
  let last=[];
  function disableLast(){
    for(const id of last){const b=document.getElementById(id);if(window.MR_LAYERS?.getState()[id]?.active||b?.classList.contains('active')||b?.classList.contains('toggled-on'))b.click();}
    last=[];
  }
  panel.querySelector('#stop-soak-demo').onclick=()=>{soaking=false;clearTimeout(soakTimer);clearTimeout(sampleTimer);disableLast();output.textContent='Soak stopped by operator';};
  panel.querySelector('#soak-demo').onclick=()=>{
    if(soaking||sampling)return;soaking=true;
    soakRun=new Date().toISOString();
    fetch('/__benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'soak started',soakRun,date:soakRun})}).catch(()=>{});
    const start=Date.now(),cases=[['bird-sounds-btn'],['cfd-simulation-btn'],['stormwater-btn'],['sun-study-btn'],['slideshow-btn'],['grid-animation-btn'],['cfd-simulation-btn','stormwater-btn'],[]];let step=0;
    function cycle(){
      if(!soaking)return;
      disableLast();
      if(Date.now()-start>=4*60*60*1000){
        soaking=false;output.textContent='Four-hour soak complete';
        fetch('/__benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'soak complete',soakRun,elapsedMs:Date.now()-start,cycles:step,date:new Date().toISOString()})}).catch(()=>{});
        return;
      }
      last=cases[step++%cases.length];for(const id of last)document.getElementById(id)?.click();
      sampleTimer=setTimeout(()=>sample('soak '+step+' '+last.join('+')),20000);soakTimer=setTimeout(cycle,60000);
    }
    cycle();
  };
})();
