// Qualitative, planar wind around building footprints. Screen-clockwise flow direction.
/* global CFD, CFDVisuals, map, computeOverlayPixelSize, showToast */
(function () {
  'use strict';
  const canvas = document.getElementById('cfd-simulation-canvas');
  const button = document.getElementById('cfd-simulation-btn');
  if (!canvas || !button || typeof CFD === 'undefined' || typeof CFDVisuals === 'undefined') return;
  const ctx = canvas.getContext('2d');
  const heat = document.createElement('canvas'), heatCtx = heat.getContext('2d');
  const walls = document.createElement('canvas'), wallCtx = walls.getContext('2d');
  const status = document.createElement('div');
  status.id = 'cfd-status'; status.setAttribute('role', 'status'); status.hidden = true;
  canvas.insertAdjacentElement('afterend', status);
  const channel = new BroadcastChannel('map_controller_channel');
  const audio = (window.mrMuseumAudio || (url=>new Audio(url)))(window.mrAsset('media/sound/wind.mp3')); audio.loop = true;
  const settings = { ...CFD.DEFAULTS };
  let heatColors;
  function refreshColors() {
    heatColors = Array.from({ length: 256 }, (_, i) => CFD.speedColor(i * settings.colorMaxMps / 255, settings.palette, settings.colorMaxMps));
  }
  refreshColors();
  let active = false, generation = 0, worker = null, fallback = null, runnerTimer = null;
  let animation = null, rebuildTimer = null, field = null, visuals = null, lastTime = null;
  let renderWorker=null,renderReady=false,renderBusy=false;
  let compatibilityMode = false;
  let phase = 'Stopped', lastStateTime = 0, heatImage = null, lastSnapshot = 0, lastHeatTime = 0;
  let targetField = null;
  const cache = new Map();
  function loadJSON(url) {
    if (!cache.has(url)) cache.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error(`Unable to load ${url}`);
      return r.json();
    }).catch(e => { cache.delete(url); throw e; }));
    return cache.get(url);
  }
  function sendState() {
    channel.postMessage({ type: 'cfd_state', ...settings, active, phase,
      steps: field?.steps || 0, diagnostics: field?.diagnostics || null });
  }
  function setPhase(value) {
    if (phase !== value) { phase = value; status.textContent = value; sendState(); }
  }
  function haltRunner() {
    renderWorker?.terminate();renderWorker=null;renderReady=false;renderBusy=false;
    if (worker) { worker.terminate(); worker = null; }
    clearTimeout(runnerTimer); runnerTimer = null; fallback = null;
  }
  function fail(message) {
    haltRunner(); active = false; generation++;
    (window.MR_FRAMES ? window.MR_FRAMES.cancel.bind(window.MR_FRAMES) : cancelAnimationFrame)(animation); animation = null;
    audio.pause(); audio.currentTime = 0;
    button.classList.remove('toggled-on');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setPhase(`Wind stopped: ${message}`); status.hidden = false;
    channel.postMessage({ type: 'animation_state', animationId: button.id, isActive: false });
    console.error(message);
  }
  function acceptSnapshot(data, id) {
    if (!active || generation !== id || !field) return;
    if (data.type === 'error') { fail(data.message); return; }
    const { ux, uy, ...metadata } = data;
    Object.assign(field, metadata);
    if(renderWorker)renderWorker.postMessage({type:'snapshot',value:{...metadata,ux,uy}},[ux.buffer,uy.buffer]);else targetField = { ux, uy };
    setPhase((data.developing ? 'Developing flow' : 'Flow settled') + (compatibilityMode ? ' · compatibility mode' : ''));
    if (performance.now() - lastStateTime > 1000) { lastStateTime = performance.now(); sendState(); }
  }
  function startFallback(options, id) {
    if (!active || generation !== id) return;
    compatibilityMode = true;
    // One atomic lattice step must also fit comfortably on the UI thread.
    // High resolutions remain available in worker mode.
    if (options.resolution > 100) {
      fail('A worker is required for this wind resolution. Reload to retry.');
      return;
    }
    try {
      fallback = new CFD.Solver(options);
      acceptSnapshot(fallback.snapshot(), id);
      function run() {
        if (!active || generation !== id || !fallback) return;
        try {
          const deadline = performance.now() + 5;
          let steps = 0;
          do { fallback.step(); steps++; } while (steps < 8 && performance.now() < deadline);
          if (performance.now() - lastSnapshot > 100) {
            acceptSnapshot(fallback.snapshot(), id); lastSnapshot = performance.now();
          }
          runnerTimer = setTimeout(run, 16);
        } catch (error) { fail(error.message); }
      }
      runnerTimer = setTimeout(run, 0);
    } catch (error) { fail(error.message); }
  }
  function startRunner(options, id) {
    if (compatibilityMode) { startFallback(options, id); return; }
    try {
      worker = new Worker('animations/cfd-worker.js');
      worker.onmessage = ({ data }) => {
        if (data.generation === id) acceptSnapshot(data, id);
      };
      worker.onerror = event => {
        event.preventDefault();
        if (generation !== id || !active) return;
        worker.terminate(); worker = null;
        console.warn('CFD worker unavailable; using bounded main-thread batches.');
        startFallback(options, id);
      };
      worker.postMessage({ type: 'init', generation: id, options });
    } catch (error) { startFallback(options, id); }
  }
  async function rebuild() {
    clearTimeout(rebuildTimer);
    const id = ++generation;
    haltRunner(); field = null; targetField = null; visuals = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!active) return;
    setPhase('Loading wind geometry');
    try {
      if (typeof map === 'undefined') throw new Error('Map is not ready');
      const source = map.getSource('usergeo');
      const userData = source?._data;
      const userFeatures = userData?.features?.filter(f => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type));
      const buildingTask = userFeatures?.length ? Promise.resolve({ features: userFeatures }) : loadJSON(window.mrAsset('media/building-footprints.geojson'));
      const treeTask = settings.trees ? loadJSON(window.mrAsset('media/trees.geojson')) : Promise.resolve({ features: [] });
      const [buildings, trees] = await Promise.all([buildingTask, treeTask]);
      if (!active || generation !== id) return;
      const size = computeOverlayPixelSize();
      canvas.width = size.w; canvas.height = size.h;
      canvas.style.width = size.w + 'px'; canvas.style.height = size.h + 'px';
      const grid = CFD.domain(size.w, size.h, settings.resolution, settings.angle);
      const mapRect = map.getContainer().getBoundingClientRect(), rect = canvas.getBoundingClientRect();
      const project = coord => {
        const p = map.project(coord);
        return { x: p.x + mapRect.left - rect.left, y: p.y + mapRect.top - rect.top };
      };
      // Project a geodesic eastward displacement; MapLibre uses a 512px world tile.
      const radiusPixels = (coord, meters) => {
        const a = project(coord), b = project([coord[0] + meters / (111320 * Math.cos(coord[1] * Math.PI / 180)), coord[1]]);
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      const effectiveBuildings = [...(buildings.features || []), ...(window.MR_CFD_OBSTACLES || [])];
      const solid = CFD.rasterizeBuildings(effectiveBuildings, project, grid);
      const canopy = CFD.rasterizeTrees(trees.features || [], project, radiusPixels, grid);
      const options = { ...grid, ...settings, solid, canopy, dragReferenceCellSize: Math.max(size.w, size.h) / 100 };
      // Only the worker owns distribution arrays. Main thread owns the mask and latest velocity snapshot.
      field = { ...options, ux: new Float32Array(grid.nx * grid.ny), uy: new Float32Array(grid.nx * grid.ny),
        latticeSpeed: Math.min(settings.windSpeed * .005, .05), steps: 0 };
      field.facadeEdges = CFDVisuals.facadeEdges(effectiveBuildings, project, field);
      heat.width = grid.vw; heat.height = grid.vh;
      heatImage = heatCtx.createImageData(grid.vw, grid.vh);
      walls.width = grid.vw; walls.height = grid.vh;
      const wallImage = wallCtx.createImageData(grid.vw, grid.vh);
      for (let y = 0; y < grid.vh; y++) for (let x = 0; x < grid.vw; x++) {
        wallImage.data[(y * grid.vw + x) * 4 + 3] = solid[(y + grid.y0) * grid.nx + x + grid.x0] ? 255 : 0;
      }
      wallCtx.putImageData(wallImage, 0, 0);
      if(typeof OffscreenCanvas!=='undefined' && typeof createImageBitmap==='function'){
        renderWorker=new Worker('animations/cfd-render-worker.js');
        renderWorker.onmessage=({data})=>{
          if(!active || generation!==id){data.bitmap?.close();return;}
          if(data.type==='error'){fail('Wind drawing failed: '+data.message);return;}
          if(data.type==='ready')renderReady=true;
          if(data.type==='frame'){renderBusy=false;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(data.bitmap,0,0);data.bitmap.close();window.MR_FRAMES?.recordRender?.('wind');}
        };
        renderWorker.onerror=()=>{if(active && generation===id)fail('Wind drawing worker could not start.');};
        renderWorker.postMessage({type:'init',field,settings,width:canvas.width,height:canvas.height,scale:window.mrTableScale?.()??1});
      }else visuals = new CFDVisuals.Renderer(field, settings);
      startRunner(options, id);
    } catch (error) { if (active && generation === id) fail(error.message); }
  }
  function scheduleRebuild() {
    if (!active) return;
    // Invalidate pending loads/messages immediately, including during slider drags.
    generation++; haltRunner(); field = null; targetField = null; visuals = null;
    clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 120);
    setPhase('Updating wind geometry');
  }
  function updateHeat() {
    if (!heatImage || !field) return;
    const g = field, pixels = heatImage.data;
    for (let y = 0; y < g.vh; y++) for (let x = 0; x < g.vw; x++) {
      const n = (y + g.y0) * g.nx + x + g.x0, offset = (y * g.vw + x) * 4;
      const speed = Math.hypot(g.ux[n], g.uy[n]) * g.windSpeed / g.latticeSpeed;
      const c = heatColors[Math.max(0, Math.min(255, Math.round(speed * 255 / settings.colorMaxMps)))];
      pixels[offset] = c[0]; pixels[offset + 1] = c[1]; pixels[offset + 2] = c[2]; pixels[offset + 3] = g.solid[n] ? 0 : 51;
    }
    heatCtx.putImageData(heatImage, 0, 0);
  }
  function draw(now) {
    if (!active) return;
    if(renderWorker){
      if(renderReady && !renderBusy){renderBusy=true;renderWorker.postMessage({type:'frame',now});}
      animation=(window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES,'wind') : requestAnimationFrame)(draw);return;
    }
    const dt = lastTime === null ? 0 : Math.min(.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (field && visuals) {
      const g = field;
      if (targetField) CFD.smoothField(g, targetField, dt);
      if (now - lastHeatTime > 50) { updateHeat(); lastHeatTime = now; }
      // Nearest-neighbor masking keeps heat out of buildings; the faint overlay hides grid noise.
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = settings.visualStyle === 'particles' ? .45 : 1;
      ctx.drawImage(heat, 0, 0, g.vw * g.cellSize, g.vh * g.cellSize);
      ctx.globalAlpha = 1;
      visuals.update(dt);
      visuals.draw(ctx);
      // Clip the full stroke width, including bright tips, to fluid space.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(walls, 0, 0, g.vw * g.cellSize, g.vh * g.cellSize);
      ctx.globalCompositeOperation = 'source-over';
      // The facade halo straddles the vector edge; flow marks remain masked.
      visuals.drawFacades(ctx);
    }
    animation = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'wind') : requestAnimationFrame)(draw);
  }
  function stop() {
    active = false; generation++; haltRunner(); clearTimeout(rebuildTimer);
    (window.MR_FRAMES ? window.MR_FRAMES.cancel.bind(window.MR_FRAMES) : cancelAnimationFrame)(animation); animation = null; lastTime = null;
    field = null; targetField = null; visuals = null;
    canvas.classList.remove('active'); button.classList.remove('toggled-on');
    audio.pause(); audio.currentTime = 0; status.hidden = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setPhase('Stopped');
    channel.postMessage({ type: 'animation_state', animationId: button.id, isActive: false });
  }
  function start() {
    if (active) { stop(); return; }
    active = true; lastTime = null;
    canvas.classList.add('active'); button.classList.add('toggled-on'); status.hidden = false;
    channel.postMessage({ type: 'animation_state', animationId: button.id, isActive: true });
    audio.play().catch(() => {});
    rebuild(); animation = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'wind') : requestAnimationFrame)(draw);
  }
  button.addEventListener('click', start);
  window.MR_LAYERS?.register(button.id,{getEnabled:()=>active,enable:()=>{if(!active)start();},disable:stop,isReady:()=>!!field && field.steps>0,getError:()=>phase.startsWith('Wind stopped:')?phase:null});
  window.cfdSession = {getState: () => ({...settings, active, phase}), preview: () => {
    if (!active || !field) return null;
    const preview = document.createElement('canvas'); preview.width = 300; preview.height = Math.round(300 * canvas.height / canvas.width);
    preview.getContext('2d').drawImage(canvas, 0, 0, preview.width, preview.height);
    return preview.toDataURL('image/webp', .6);
  }};
  window.addEventListener('resize', scheduleRebuild);
  window.addEventListener('cfd-geometry-changed', scheduleRebuild);
  if (typeof map !== 'undefined') map.on('moveend', scheduleRebuild);
  document.addEventListener('visibilitychange', () => {
    lastTime = null;
  });
  channel.onmessage = ({ data }) => {
    if (data.type !== 'cfd_control') return;
    if (data.action === 'get_state') { sendState(); return; }
    const number = Number(data.value);
    let reset = false;
    switch (data.action) {
      case 'set_wind_speed':
        if (!Number.isFinite(number)) return;
        settings.windSpeed = Math.max(1, Math.min(20, number)); reset = true; break;
      case 'set_wind_direction':
        if (!Number.isFinite(number)) return;
        settings.angle = ((number % 360) + 360) % 360; reset = true; break;
      case 'set_viscosity':
        if (!Number.isFinite(number)) return;
        settings.viscosity = .02 + .13 * Math.max(0, Math.min(1, number)); reset = true; break;
      case 'set_resolution':
        if (![100, 150, 200, 250, 300].includes(number)) return;
        settings.resolution = number; reset = true; break;
      case 'toggle_trees':
        if (typeof data.value !== 'boolean' || settings.trees === data.value) { sendState(); return; }
        settings.trees = data.value; reset = true; break;
      case 'set_particles':
        if (![200, 500, 1000].includes(number)) return;
        settings.particles = number; break;
      case 'set_visual_style':
        if (typeof data.value !== 'string' || !Object.hasOwn(CFDVisuals.STYLES, data.value)) return;
        settings.visualStyle = data.value; break;
      case 'set_facade_glow':
        if (typeof data.value !== 'boolean') return;
        settings.facadeGlow = data.value; break;
      case 'set_color_palette':
        if (typeof data.value !== 'string' || !Object.hasOwn(CFD.PALETTES, data.value)) return;
        settings.palette = data.value; refreshColors(); updateHeat(); break;
      case 'set_color_range':
        if (!CFD.COLOR_RANGES.includes(number)) return;
        settings.colorMaxMps = number; refreshColors(); updateHeat(); break;
      case 'set_particle_speed':
        if (!Number.isFinite(number)) return;
        settings.playback = Math.max(2, Math.min(40, number)); break;
      default: return;
    }
    if (reset) scheduleRebuild();
    else if (renderWorker)renderWorker.postMessage({type:'settings',settings});
    else if (visuals) visuals.configure(settings);
    sendState();
  };
})();
