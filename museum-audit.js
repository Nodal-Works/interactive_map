/* Opt-in exhibit diagnostics: index.html?audit=1. Never loaded in normal operation.
 * RAF cadence measures main-thread opportunities, not completed GPU frames.
 * Samples discard time in hidden tabs and reset on local layer interactions.
 */
(() => {
  'use strict';
  const output = document.createElement('output');
  output.id = 'museum-audit';
  output.setAttribute('aria-label', 'Museum performance diagnostics');
  Object.assign(output.style, {position:'fixed', right:'8px', top:'8px', zIndex:100000,
    background:'#07111eee', color:'#e6f3ff', padding:'8px', font:'11px monospace',
    maxWidth:'310px', whiteSpace:'pre-wrap', pointerEvents:'none'});
  document.body.appendChild(output);
  let intervals = [], longTasks = [], previous = 0, start = performance.now(), settle = start + 3000;
  let mapFrames = 0, attached = false, hidden = document.hidden, lastPublish = 0;
  function reset() {
    intervals = []; longTasks = []; previous = 0; mapFrames = 0;
    start = performance.now(); settle = start + 3000;
    delete output.dataset.report;
    output.textContent = 'Audit warming up (3 seconds)…';
  }
  window.addEventListener('mr-layer-state',reset);
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; reset(); });
  document.addEventListener('click', event => {
    if (event.target.closest('button,input')) reset();
  }, true);
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver(list => {
      if (!hidden) for (const entry of list.getEntries())
        if (entry.startTime >= settle) longTasks.push(entry.duration);
    }).observe({type:'longtask', buffered:false});
  }
  function sample(now) {
    requestAnimationFrame(sample);
    if (hidden) return;
    if (!attached && window.map?.on) {
      attached = true;
      window.map.on('render', () => { if (!hidden && performance.now() >= settle) mapFrames++; });
    }
    if (now < settle) { previous = 0; return; }
    if (previous) intervals.push(now - previous);
    previous = now;
    if (now - lastPublish < 1000) return;
    lastPublish = now;
    const sorted = intervals.slice().sort((a,b) => a-b);
    const percentile = p => +(sorted[Math.min(sorted.length-1, Math.floor(sorted.length*p))] || 0).toFixed(2);
    const duration = intervals.reduce((a,b) => a+b, 0);
    const report = {
      seconds: +((now-settle)/1000).toFixed(1), samples: intervals.length,
      rafHz: duration ? +(1000*intervals.length/duration).toFixed(1) : 0,
      p50ms: percentile(.5), p95ms: percentile(.95), p99ms: percentile(.99),
      over33ms: intervals.filter(t => t > 33.34).length,
      longTasks: longTasks.length, longestTaskMs: +Math.max(0,...longTasks).toFixed(1),
      layerStatus: window.MR_LAYERS?.getState(), scheduler: window.MR_FRAMES?.stats(),
      mapRenders: mapFrames, viewport: [innerWidth,innerHeight], dpr: devicePixelRatio,
      active: [...document.querySelectorAll('button.active,button.toggled-on,button.toggled-off')].map(b => b.id || b.textContent.trim()),
      canvases: [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width && getComputedStyle(c).display !== 'none').map(c => ({id:c.id,width:c.width,height:c.height})),
      note: 'RAF cadence, not GPU FPS; 3s warm-up. Reload for independent sample.'
    };
    output.dataset.report = JSON.stringify(report);
    output.textContent = `${report.rafHz} Hz RAF | p95 ${report.p95ms} ms\n${report.seconds}s | >33ms ${report.over33ms} | long tasks ${report.longTasks}\n${report.viewport.join(' × ')} · DPR ${report.dpr}\nAudit only · click controls to reset`;
    // Bound memory during multi-hour exhibit soak tests.
    if (intervals.length >= 3600) reset();
  }
  requestAnimationFrame(sample);
})();
