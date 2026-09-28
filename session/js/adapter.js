(function() {
  'use strict';
  const channel = new BroadcastChannel('map_controller_channel');
  let transformRevision = 0;
  let messageRevision = 0;
  let canvasBasemap;
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
    const g=window.MR_TABLE.geometry(), d=window.MR_CALIBRATION.dimensions;
    return {widthCm:d.tableWidth,heightCm:d.tableHeight,width:g.w,height:g.h,
      left:g.left-g.mapRect.left,top:g.top-g.mapRect.top,corners:g.corners,
      revision:transformRevision,bearing:map.getBearing()};
  }
  function coordinate(message) {
    if(message.transform!==transformRevision)throw Error('Table alignment changed. Fit the table and try again.');
    if(!Number.isFinite(message.x)||!Number.isFinite(message.y)||message.x<0||message.x>1||message.y<0||message.y>1)throw Error('Touch is outside the table');
    const g=window.MR_TABLE.geometry(),p=MR_TABLE.affine(g.points,1,1).project(message.x,message.y);
    return map.unproject([p.x-g.mapRect.left,p.y-g.mapRect.top]).toArray();
  }

  function control(message) {
    if (message?.type === 'ecom_activate') return setLayer('ecom-energy-btn', true);
    if (!MR.validControl(message)) throw Error('Control is not available remotely');
    channel.postMessage({...message, sessionAction: true});
    // BroadcastChannel deliberately does not deliver to its sending object.
    snapshots['control:' + message.type + ':' + message.action] = {...message,mrVersion:++messageRevision};
  }
  function setLayer(layer, enabled) {
    if (!(layer in active) || typeof enabled !== 'boolean') throw Error('Unknown layer');
    if (layer === 'ecom-energy-btn') {
      if (!window.ecomEnergyLayer) throw Error('ECOM is still starting. Please try again.');
      return window.ecomEnergyLayer.setEnabled(enabled);
    }
    if (layer === 'canvas-btn') {
      if(enabled && !active[layer]) { canvasBasemap=window.getBasemap();window.setBasemap(window.defaultDarkBasemap || 'cartoDark'); }
      if(!enabled && active[layer] && window.getBasemap()===(window.defaultDarkBasemap || 'cartoDark') && canvasBasemap)window.setBasemap(canvasBasemap);
      active[layer] = enabled;document.getElementById(layer)?.classList.toggle('active',enabled);
      window.dispatchEvent(new CustomEvent('mr-canvas-visibility', {detail: enabled})); return;
    }
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
  function getState() {
    const sun=window.sunStudy;
    return {layers: {...active}, messages: Object.values(snapshots), table: table(),
      isovist: window.isovistSession?.getState(), cfd: window.cfdSession?.getState(),
      thermal: window.thermalComfortLayer?.getState(), sun: sun ? {time:sun.timeOfDay,date:`${sun.date.getFullYear()}-${String(sun.date.getMonth()+1).padStart(2,'0')}-${String(sun.date.getDate()).padStart(2,'0')}`,animating:sun.isAnimating,trees:sun.treesVisible,falseColor:sun.isFalseColorMode,opacity:sun.shadowOpacity,speed:sun.animationSpeed}:null};
  }
  window.MR_ADAPTER = {table, coordinate, control, setLayer, gesture, getState, active, channel};
  map.on('moveend', () => { transformRevision++; window.dispatchEvent(new Event('mr-transform')); });
  window.addEventListener('resize', () => { transformRevision++; window.dispatchEvent(new Event('mr-transform')); });
  setTimeout(() => {
    for (const data of [{type:'cfd_control',action:'get_state'}, {type:'thermal_control',action:'request_state'},
      {type:'bird_control',action:'request_status'}, {type:'slideshow_control',action:'request_status'}, {type:'ecom_request_summary'}]) channel.postMessage(data);
  }, 1200);
})();
