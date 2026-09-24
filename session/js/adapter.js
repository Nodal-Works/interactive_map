(function() {
  'use strict';
  const channel = new BroadcastChannel('map_controller_channel');
  let transformRevision = 0;
  let messageRevision = 0;
  const snapshots = {};
  const active = Object.fromEntries(MR.LAYERS.map(layer => [layer.id, false]));
  channel.addEventListener('message', ({data}) => {
    if (!data?.type || /calibrat|memory|sam_segment/.test(data.type)) return;
    data.mrVersion = ++messageRevision;
    if (data.type === 'animation_state' && data.animationId in active) active[data.animationId] = !!data.isActive;
    if (!MR.validControl(data) && data.type !== 'control_action') {
      snapshots[data.type === 'animation_state' ? data.animationId : data.type] = data;
      window.dispatchEvent(new CustomEvent('mr-state', {detail: data}));
    } else if (!data.sessionAction) {
      snapshots['control:' + data.type + ':' + data.action] = data;
      window.dispatchEvent(new CustomEvent('mr-desktop-action', {detail: data}));
      window.dispatchEvent(new CustomEvent('mr-state', {detail: data}));
    }
  });
  function table() {
    const size = computeOverlayPixelSize(), rect = map.getContainer().getBoundingClientRect();
    const left = (innerWidth - size.w) / 2 - rect.left, top = (innerHeight - size.h) / 2 - rect.top;
    const corners = [[left,top],[left+size.w,top],[left+size.w,top+size.h],[left,top+size.h]].map(p => map.unproject(p).toArray());
    return {widthCm: 100, heightCm: 60, width: size.w, height: size.h, left, top, corners,
      revision: transformRevision, bearing: map.getBearing()};
  }
  function coordinate(message) {
    const t = table();
    if (message.transform !== t.revision) throw Error('Table alignment changed. Fit the table and try again.');
    if (!Number.isFinite(message.x) || !Number.isFinite(message.y) || message.x < 0 || message.x > 1 || message.y < 0 || message.y > 1) throw Error('Touch is outside the table');
    return map.unproject([t.left + message.x * t.width, t.top + message.y * t.height]).toArray();
  }
  function control(message) {
    if (!MR.validControl(message)) throw Error('Control is not available remotely');
    channel.postMessage({...message, sessionAction: true});
    // BroadcastChannel deliberately does not deliver to its sending object.
    snapshots['control:' + message.type + ':' + message.action] = {...message,mrVersion:++messageRevision};
  }
  function setLayer(layer, enabled) {
    if (!(layer in active) || typeof enabled !== 'boolean') throw Error('Unknown layer');
    if (layer === 'canvas-btn') { active[layer] = enabled; window.dispatchEvent(new CustomEvent('mr-canvas-visibility', {detail: enabled})); return; }
    if (active[layer] !== enabled) {
      const button=document.getElementById(layer);
      if(!button)throw Error('This layer is unavailable on the host');
      active[layer]=enabled; // Serialize repeated desired-state commands before asynchronous broadcasts arrive.
      button.click();
    }
    // Handlers emit authoritative animation_state asynchronously through BroadcastChannel.
  }
  function gesture(message) {
    if (!active[message.layer]) throw Error('Turn on this layer first');
    const c = coordinate(message);
    switch (message.layer) {
      case 'isovist-btn': window.isovistSession.point(c, message.tool === 'heading'); break;
      case 'thermal-comfort-btn': window.thermalComfortLayer.selectPoint(c); break;
      case 'epc-btn': window.mrSelectEpc(c); break;
      case 'ecom-energy-btn': window.mrSelectEcom?.(c); break;
      case 'street-view-btn': window.mrSelectStreetView(c); break;
      default: throw Error('This layer has no map selection tool');
    }
    return c;
  }
  const rasterCache = new Map();
  async function raster(url) {
    if (!rasterCache.has(url)) {
      if (rasterCache.size > 12) rasterCache.delete(rasterCache.keys().next().value);
      rasterCache.set(url, fetch(url).then(r => {if (!r.ok) throw Error('Map preview unavailable'); return r.blob();}).then(blob => new Promise(resolve => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob);
      })).catch(() => {rasterCache.delete(url); return null;}));
    }
    return rasterCache.get(url);
  }
  async function mapState() {
    const features = [], images = [];
    const style = map.getStyle();
    for (const [name, source] of Object.entries(style?.sources || {})) {
      if (!/^(isovist-|coolpaths-|epc-selected|epc-buildings|ecom-)/.test(name)) continue;
      if (['isovist-all-trees','isovist-gradient'].includes(name)) continue;
      const visibleLayers = style.layers.filter(layer => layer.source === name && layer.layout?.visibility !== 'none');
      if (!visibleLayers.length) continue;
      const data = map.getSource(name)?._data;
      if (source.type === 'geojson' && typeof data === 'object') {
        for (const f of (data.features || []).slice(0, 2500)) features.push({type: 'Feature', geometry: f.geometry,
          properties: {source: name, color: f.properties?.kind==='coolest' ? '#16a34a' : f.properties?.kind==='shortest' ? '#0ea5e9' : name==='isovist-viewer' ? '#fb7185' : name==='isovist-trees' ? '#4ade80' : name.startsWith('isovist') ? '#eab308' : name.startsWith('coolpaths') ? '#fb923c' : '#38bdf8'}});
      } else if (source.type === 'image' && source.url && source.coordinates) {
        const image = await raster(source.url); if (image) images.push({id: name, image, coordinates: source.coordinates});
      }
    }
    if (active['cfd-simulation-btn']) {
      const image = window.cfdSession?.preview(); if (image) images.push({id: 'wind', image, coordinates: table().corners});
    }
    return {type: 'map', table: table(), features, images};
  }
  function getState() {
    const sun=window.sunStudy;
    return {layers: {...active}, messages: Object.values(snapshots), table: table(),
      isovist: window.isovistSession?.getState(), cfd: window.cfdSession?.getState(),
      thermal: window.thermalComfortLayer?.getState(), sun: sun ? {time:sun.timeOfDay,date:`${sun.date.getFullYear()}-${String(sun.date.getMonth()+1).padStart(2,'0')}-${String(sun.date.getDate()).padStart(2,'0')}`,animating:sun.isAnimating,trees:sun.treesVisible,falseColor:sun.isFalseColorMode,opacity:sun.shadowOpacity,speed:sun.animationSpeed}:null};
  }
  window.MR_ADAPTER = {table, coordinate, control, setLayer, gesture, getState, mapState, active, channel};
  map.on('moveend', () => { transformRevision++; window.dispatchEvent(new Event('mr-transform')); });
  window.addEventListener('resize', () => { transformRevision++; window.dispatchEvent(new Event('mr-transform')); });
  setTimeout(() => {
    for (const data of [{type:'cfd_control',action:'get_state'}, {type:'thermal_control',action:'request_state'},
      {type:'bird_control',action:'request_status'}, {type:'slideshow_control',action:'request_status'}, {type:'ecom_request_summary'}]) channel.postMessage(data);
  }, 1200);
})();
