/* Opt-in measurement UI, also injected into an unchanged Git revision by benchmark_demo.py. */
(function(){
  const panel=document.createElement('details');panel.open=true;
  panel.style.cssText='position:fixed;right:65px;top:8px;z-index:12000;background:#101827;color:white;padding:12px;width:360px;font:13px monospace;max-height:45vh;overflow:auto';
  panel.innerHTML='<summary>Demo diagnostics</summary><button id="measure-demo">Measure 30 seconds</button> <button id="soak-demo">Run four-hour soak</button> <button id="stop-soak-demo">Stop soak</button><pre id="demo-metrics">Ready</pre>';
  document.body.append(panel);
  const output=panel.querySelector('pre');let sampling=false,soaking=false,hiddenFrames=0,longTasks=0,soakTimer,sampleTimer;
  try{new PerformanceObserver(list=>{if(sampling)longTasks+=list.getEntries().length;}).observe({type:'longtask',buffered:false});}catch{}
  function graphics(){
    const canvas=document.querySelector('.maplibregl-canvas');
    const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
    const ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'Unavailable';
  }
  function sample(label='manual'){
    if(sampling)return;
    sampling=true;hiddenFrames=0;longTasks=0;
    const start=performance.now(),memoryStart=performance.memory?.usedJSHeapSize,frames=[];
    let previous=null,finished=false,timer;
    const finish=()=>{
      if(finished)return;finished=true;clearTimeout(timer);
      sampling=false;frames.sort((a,b)=>a-b);
      const mean=frames.reduce((a,b)=>a+b,0)/frames.length;
      const report={label,graphics:graphics(),date:new Date().toISOString(),viewport:[innerWidth,innerHeight],screen:[screen.width,screen.height],devicePixelRatio,
        samples:frames.length,hiddenFrames,meanMs:mean,fps:1000/mean,p95Ms:frames[Math.floor(frames.length*.95)],longTasks,
        nodes:document.getElementsByTagName('*').length,canvases:document.querySelectorAll('canvas').length,
        activeButtons:Array.from(document.querySelectorAll('.icon-btn.active,.icon-btn.toggled-on')).map(b=>b.id),
        memoryStart,memoryEnd:performance.memory?.usedJSHeapSize,layers:window.MR_LAYERS?.getState(),scheduler:window.MR_FRAMES?.stats()};
      output.textContent=JSON.stringify(report,null,2);
      fetch('/__benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)}).catch(()=>{});
    };
    function frame(now){
      if(finished)return;
      if(document.hidden){hiddenFrames++;previous=null;}else{if(previous!==null)frames.push(now-previous);previous=now;}
      if(now-start<30000)requestAnimationFrame(frame);else finish();
    }
    output.textContent='Measuring '+label+'…';requestAnimationFrame(frame);
    // Hidden tabs may stop rAF entirely. Such samples are explicitly invalid.
    timer=setTimeout(()=>{if(!finished){if(document.hidden)hiddenFrames++;finish();}},32000);
  }
  panel.querySelector('#measure-demo').onclick=()=>sample();
  let last=[];
  function disableLast(){
    for(const id of last){const b=document.getElementById(id);if(window.MR_LAYERS?.getState()[id]?.active||b?.classList.contains('active')||b?.classList.contains('toggled-on'))b.click();}
    last=[];
  }
  panel.querySelector('#stop-soak-demo').onclick=()=>{soaking=false;clearTimeout(soakTimer);clearTimeout(sampleTimer);disableLast();output.textContent='Soak stopped by operator';};
  panel.querySelector('#soak-demo').onclick=()=>{
    if(soaking||sampling)return;soaking=true;
    const start=Date.now(),cases=[['bird-sounds-btn'],['cfd-simulation-btn'],['stormwater-btn'],['sun-study-btn'],['slideshow-btn'],['grid-animation-btn'],['cfd-simulation-btn','stormwater-btn'],[]];let step=0;
    function cycle(){
      if(!soaking)return;
      disableLast();
      if(Date.now()-start>=4*60*60*1000){
        soaking=false;output.textContent='Four-hour soak complete';
        fetch('/__benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'soak complete',elapsedMs:Date.now()-start,cycles:step,date:new Date().toISOString()})}).catch(()=>{});
        return;
      }
      last=cases[step++%cases.length];for(const id of last)document.getElementById(id)?.click();
      sampleTimer=setTimeout(()=>sample('soak '+step+' '+last.join('+')),20000);soakTimer=setTimeout(cycle,60000);
    }
    cycle();
  };
})();
