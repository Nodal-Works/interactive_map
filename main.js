// MapLibre GL JS implementation for interactive_map
// Native bearing/rotation support and raster basemap switching

// One rectangle shared by the map, canvases, grid and phone gestures.
window.getTableLayout = function() {
  const container=document.getElementById('map');
  const rect=container.getBoundingClientRect();
  return window.MR_TABLE.rectangle(window.MR_CALIBRATION.dimensions,
    {width:innerWidth,height:innerHeight},rect);
};
window.computeOverlayPixelSize = function() {
  const {w,h}=window.getTableLayout(); return {w,h};
};
window.updateTablePresentation();
function clipTableLayers() {
  const active=window.MR_CALIBRATION.dimensions.layoutMode !== 'legacy';
  const t=window.getTableLayout();
  for (const el of document.querySelectorAll('#map, #sun-study-canvas, #sun-study-overlay, #stormwater-canvas, #cfd-simulation-canvas, #street-life-canvas, #trafik-canvas, #slideshow-canvas, #grid-animation-canvas, #bird-sounds-canvas, #street-animation-canvas, .mr-map-overlay.desktop')) {
    const r=el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    el.style.clipPath=active ? `inset(${Math.max(0,t.top-r.top)}px ${Math.max(0,r.right-t.left-t.w)}px ${Math.max(0,r.bottom-t.top-t.h)}px ${Math.max(0,t.left-r.left)}px)` : '';
  }
}
window.clipTableLayers=clipTableLayers;
function showOverlay() {
  const t=window.getTableLayout(),el=document.getElementById('table-overlay');
  if(el) Object.assign(el.style,{left:`${t.left}px`,top:`${t.top}px`,transform:'none',width:`${t.w}px`,height:`${t.h}px`});
}

// Handle Start Overlay and Audio Context
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('start-overlay');
  if (overlay) {
    overlay.addEventListener('click', (event) => {
      event.stopPropagation();
      // Resume any existing audio contexts or create a dummy one to unlock
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      ctx.resume().then(() => {
        console.log('AudioContext unlocked');
        if(window.APP_CONFIG.presentation?.intro) window.mrPlayIntroduction();
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);
      });
    });
  }
});

// Helper: read DOM elements
const toastContainer = document.getElementById('toast-container');
function showToast(msg, timeout = 3000) {
  if (!toastContainer) return console.log(msg);
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, timeout);
}
window.showToast = showToast;

let tableCenter = [window.MR_CALIBRATION.current.center.lng, window.MR_CALIBRATION.current.center.lat];
let initialZoom = window.MR_CALIBRATION.current.zoom;
let initialBearing = window.MR_CALIBRATION.current.bearing;
let mapboxToken = '';

try {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'trafik-config.json', false);
  xhr.send(null);
  if (xhr.status === 200) {
    const config = JSON.parse(xhr.responseText);
    mapboxToken = config.mapboxtoken || config.mapboxToken || '';
  }
} catch (e) {
  console.warn('Could not load Mapbox token from trafik-config.json');
}

// Create the map with loaded (or default) calibration
const map = new maplibregl.Map({
  pixelRatio: window.APP_CONFIG.location ? 1 : (window.devicePixelRatio || 1),
  container: 'map',
  style: {
    version: 8,
    glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: []
  },
  center: tableCenter,
  zoom: initialZoom,
  bearing: initialBearing,
  pitch: 0
});
const refreshTableMapScale=window.installTableMapScale(map);

// Saved manual cameras take precedence; automatic presets fit the actual table.
let autoTableFit=!!window.MR_CALIBRATION.current.fitToTable;
let tableFlip=!!window.MR_CALIBRATION.current.tableFlip;
let fittingTable=false;
function fitTableCamera() {
  fittingTable=true;
  try {
    const rect=map.getContainer().getBoundingClientRect();
    const camera=window.MR_TABLE.fit(window.APP_CONFIG.area.corners,window.getTableLayout(),rect,tableFlip);
    map.jumpTo(camera);
    tableCenter=[camera.center.lng,camera.center.lat];
    initialZoom=camera.zoom; initialBearing=camera.bearing;
  } finally { fittingTable=false; }
  clipTableLayers();
}
if (autoTableFit) fitTableCamera();
else if (window.MR_CALIBRATION.current.fitBounds) {
  const [w,s,e,n] = window.MR_CALIBRATION.current.fitBounds;
  map.fitBounds([[w,s],[e,n]], {padding:40, duration:0, bearing:0});
  const center = map.getCenter();
  tableCenter = [center.lng, center.lat];
  initialZoom = map.getZoom();
}
map.on('movestart',event=>{if(event.originalEvent && !fittingTable)autoTableFit=false;});
map.on('resize',()=>{if(autoTableFit)fitTableCamera();requestAnimationFrame(clipTableLayers);});
map.on('load',()=>requestAnimationFrame(clipTableLayers));

let introTimer, introClick;
window.mrSkipIntroduction = () => { clearTimeout(introTimer); if(introClick)map.off("click",introClick);introClick=null; map.stop();map.jumpTo({center:tableCenter,zoom:initialZoom,bearing:initialBearing,pitch:0}); };
window.mrPlayIntroduction = () => {
  window.mrSkipIntroduction();
  map.jumpTo({center:tableCenter,zoom:initialZoom-2,bearing:initialBearing,pitch:0});
  introClick=()=>{introClick=null;introTimer=setTimeout(()=>map.flyTo({center:tableCenter,zoom:initialZoom,bearing:initialBearing,pitch:0,duration:6500,essential:true}),900);};
  map.once('click',introClick);
};
const EPC_CLASS_COLORS = {
  A: '#16803c',
  B: '#4f9f3e',
  C: '#91b93e',
  D: '#d1c83b',
  E: '#e7a832',
  F: '#dd702d',
  G: '#bd3c2f'
};
let epcModeActive = false;
let epcSelectedFeature = null;

function epcColorExpression() {
  return ['match', ['get', 'energy_class'],
    ...Object.entries(EPC_CLASS_COLORS).flat(), '#6b7280'];
}

function setEpcMode(active) {
  epcModeActive = active;
  ['epc-buildings-fill', 'epc-buildings-line'].forEach(layerId => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', active ? 'visible' : 'none');
  });
  if (!active) {
    epcSelectedFeature = null;
    const selectedSource = map.getSource('epc-selected');
    if (selectedSource) selectedSource.setData({ type: 'FeatureCollection', features: [] });
  }
  const button = document.getElementById('epc-btn');
  if (button) button.classList.toggle('active', active);
}

async function loadEpcBuildings() {
  try {
    const response = await fetch(window.mrAsset('media/building-footprints-epc.geojson'));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    map.addSource('epc-buildings', { type: 'geojson', data });
    map.addLayer({
      id: 'epc-buildings-fill', type: 'fill', source: 'epc-buildings',
      paint: { 'fill-color': epcColorExpression(), 'fill-opacity': 0.72 },
      layout: { visibility: epcModeActive ? 'visible' : 'none' }
    });
    map.addLayer({
      id: 'epc-buildings-line', type: 'line', source: 'epc-buildings',
      paint: { 'line-color': '#111827', 'line-width': 0.7, 'line-opacity': 0.65 },
      layout: { visibility: epcModeActive ? 'visible' : 'none' }
    });
    map.addSource('epc-selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'epc-selected-fill', type: 'fill', source: 'epc-selected',
      paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.12 }
    });
    map.addLayer({
      id: 'epc-selected-line', type: 'line', source: 'epc-selected',
      paint: { 'line-color': '#ffffff', 'line-width': 3 }
    });
    map.on('mouseenter', 'epc-buildings-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'epc-buildings-fill', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'epc-buildings-fill', event => {
      if (window.MR_CANVAS_EDITING) return;
      const feature = event.features?.[0];
      if (!feature) return;
      epcSelectedFeature = feature;
      map.getSource('epc-selected').setData({ type: 'FeatureCollection', features: [feature] });
      new maplibregl.Popup({ closeButton: false })
        .setLngLat(event.lngLat)
        .setHTML(`<strong>EPC ${feature.properties?.energy_class || 'No data'}</strong>`)
        .addTo(map);
      epcChannel.postMessage({
        type: 'epc_building_selected',
        building: { type: 'Feature', geometry: feature.geometry, properties: feature.properties }
      });
    });
  } catch (error) {
    console.error('[EPC] Could not load EPC GeoJSON:', error);
    showToast('EPC data could not be loaded');
  }
}

// Navigation controls hidden - map is calibrated for projection

// Raster basemap sources and layers
// Note: MapLibre doesn't support {s} placeholder - use explicit subdomain URLs
const basemaps = {
  osm: {
    id: 'osm-source',
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
    ],
    tileSize: 256,
    attribution: '&copy; OpenStreetMap contributors'
  },
  osmLight: {
    id: 'osm-light-source',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    paint: { 'raster-saturation': -1, 'raster-contrast': -0.2, 'raster-brightness-min': 0.25 }
  },
  cartoPositron: {
    id: 'carto-pos-source',
    tiles: [
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'
    ],
    tileSize: 256,
    attribution: '&copy; CARTO & OpenStreetMap'
  },
  cartoDark: {
    id: 'carto-dark-source',
    tiles: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
    ],
    tileSize: 256,
    attribution: '&copy; CARTO & OpenStreetMap'
  },
  esri: {
    id: 'esri-source',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: '&copy; Esri'
  },
  opentopo: {
    id: 'opentopo-source',
    tiles: [
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
    ],
    tileSize: 256,
    attribution: '&copy; OpenTopoMap'
  }
};

if (mapboxToken) {
  basemaps.mapboxDark = {
    id: 'mapbox-dark-source',
    tiles: [`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(mapboxToken)}`],
    tileSize: 256,
    attribution: '&copy; Mapbox &copy; OpenStreetMap'
  };
  basemaps.mapboxLight = {
    id: 'mapbox-light-source',
    tiles: [`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(mapboxToken)}`],
    tileSize: 256,
    attribution: '&copy; Mapbox &copy; OpenStreetMap'
  };
  basemaps.mapboxOutdoors = {
    id: 'mapbox-outdoors-source',
    tiles: [`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(mapboxToken)}`],
    tileSize: 256,
    attribution: '&copy; Mapbox &copy; OpenStreetMap'
  };
  basemaps.mapboxSatellite = {
    id: 'mapbox-satellite-source',
    tiles: [`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(mapboxToken)}`],
    tileSize: 256,
    attribution: '&copy; Mapbox'
  };
  basemaps.mapboxSatelliteStreets = {
    id: 'mapbox-satellite-streets-source',
    tiles: [`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(mapboxToken)}`],
    tileSize: 256,
    attribution: '&copy; Mapbox &copy; OpenStreetMap'
  };
  basemaps.mapboxStreets = {
    id: 'mapbox-streets-source',
    tiles: [`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(mapboxToken)}`],
    tileSize: 256,
    attribution: '&copy; Mapbox &copy; OpenStreetMap'
  };
}

basemaps.black = {
  id: 'black-source',
  type: 'background',
  color: '#000000',
  attribution: ''
};

const defaultBasemap = mapboxToken ? 'mapboxDark' : window.APP_CONFIG.location ? 'osm' : 'cartoDark';

// When map loads, add raster sources and layers
map.on('load', () => {
  // Add each source and show the configured Mapbox dark layer when available.
  Object.keys(basemaps).forEach(key => {
    const bm = basemaps[key];
    if (bm.type === 'background') {
      map.addLayer({
        id: bm.id + '-layer',
        type: 'background',
        layout: { visibility: key === defaultBasemap ? 'visible' : 'none' },
        paint: { 'background-color': bm.color }
      });
    } else {
      map.addSource(bm.id, { type: 'raster', tiles: bm.tiles, tileSize: bm.tileSize, attribution: bm.attribution });
      map.addLayer({
        id: bm.id + '-layer',
        type: 'raster',
        source: bm.id,
        paint: bm.paint || {},
        layout: { visibility: key === defaultBasemap ? 'visible' : 'none' }
      });
    }
  });

  if(!window.APP_CONFIG.disabledLayers.includes('epc-btn'))loadEpcBuildings();

  // Add table polygon and markers as a GeoJSON source
  const tableCorners = window.APP_CONFIG.area.corners;

  const tableGeo = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...tableCorners, tableCorners[0]]] }, properties: {} },
      // corners as points
      ...tableCorners.map((pt, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: { corner: i+1 } })),
      // center
      { type: 'Feature', geometry: { type: 'Point', coordinates: tableCenter }, properties: { center: true } }
    ]
  };

  map.addSource('table', { type: 'geojson', data: tableGeo });

  // polygon fill and outline
  map.addLayer({ id: 'table-fill', type: 'fill', source: 'table', filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: 'none' }, paint: { 'fill-color': '#ffb266', 'fill-opacity': 0.15 } });
  map.addLayer({ id: 'table-line', type: 'line', source: 'table', filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: 'none' }, paint: { 'line-color': '#ff7800', 'line-width': 2 } });

  // corner circles (filter points without center property)
  map.addLayer({ id: 'table-corners', type: 'circle', source: 'table', filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'corner']], layout: { visibility: 'none' }, paint: { 'circle-radius': 6, 'circle-color': '#ff7800', 'circle-stroke-color': '#fff', 'circle-stroke-width':1 } });

  // center circle
  map.addLayer({ id: 'table-center', type: 'circle', source: 'table', filter: ['has', 'center'], layout: { visibility: 'none' }, paint: { 'circle-radius': 6, 'circle-color': '#0078d4', 'circle-stroke-color': '#fff', 'circle-stroke-width':1 } });

  // click handlers to show popups for points
  map.on('click', 'table-corners', (e) => {
    const props = e.features && e.features[0] && e.features[0].properties;
    const coords = e.features[0].geometry.coordinates.slice();
    new maplibregl.Popup().setLngLat(coords).setHTML(`Corner ${props.corner}<br/>lon=${coords[0]}<br/>lat=${coords[1]}`).addTo(map);
  });
  map.on('click', 'table-center', (e) => {
    const coords = e.features[0].geometry.coordinates.slice();
    new maplibregl.Popup().setLngLat(coords).setHTML(`Center<br/>lon=${coords[0]}<br/>lat=${coords[1]}`).addTo(map);
  });

  // fit to table bounds initially (optional - commented out since we have calibrated view)
  // try { map.fitBounds([[...tableCorners[0]], [...tableCorners[2]]], { padding: 20 }); } catch(e){}
  
  // Bearing is set via initialBearing in map constructor
  
  // Table markers visibility is now controlled via controller
});

// Simple basemap switcher (call setBasemap('cartoDark') etc.)
function getBasemap() {
  return Object.keys(basemaps).find(key => {
    const layerId = basemaps[key].id + '-layer';
    return map.getLayer(layerId) && map.getLayoutProperty(layerId, 'visibility') === 'visible';
  }) || defaultBasemap;
}

function setBasemap(key) {
  Object.keys(basemaps).forEach(k => {
    const layerId = basemaps[k].id + '-layer';
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', k === key ? 'visible' : 'none');
  });
}

// Wire up existing UI controls
const fileInput = document.getElementById('geojson-input');
const loadGeojsonBtn = document.getElementById('load-geojson-btn');

// Trigger file input when icon button is clicked
loadGeojsonBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const geojson = JSON.parse(ev.target.result);
      addUserGeo(geojson);
    } catch (err) { showToast('Invalid JSON file'); }
  };
  reader.readAsText(file);
});

// drag & drop
const mapEl = document.getElementById('map');
['dragenter','dragover'].forEach(evt => mapEl.addEventListener(evt, e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }));
mapEl.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try { addUserGeo(JSON.parse(ev.target.result)); }
    catch (err) { showToast('Invalid GeoJSON dropped.'); }
  };
  reader.readAsText(f);
});

function addUserGeo(geojson) {
  // remove previous user layer(s)
  if (map.getSource('usergeo')) {
    ['user-fill','user-line','user-point'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    map.removeSource('usergeo');
  }
  map.addSource('usergeo', { type: 'geojson', data: geojson });
  // add simple styling - only fill for polygons, no stroke or points
  map.addLayer({ id: 'user-fill', type: 'fill', source: 'usergeo', paint: { 'fill-color':'#3388ff','fill-opacity':0.2 } }, Object.keys(map.getStyle().layers).slice(-1)[0]);
  window.dispatchEvent(new Event('cfd-geometry-changed'));
  // No line or point layers for cleaner building visualization
}

// Calibration overlay (DOM rectangle centered on screen)
const tableOverlay = document.getElementById('table-overlay');

// Hide overlay by default
if (tableOverlay) tableOverlay.style.display = 'none';

let centerLocked = false;
let calibrationModeActive = false;

// Function to enable/disable map interactions based on calibration mode
function setCalibrationMode(enabled) {
  calibrationModeActive = enabled;
  if (enabled) {
    // Enable all interactions for calibration
    try { map.dragPan.enable(); } catch(e){}
    try { map.doubleClickZoom.enable(); } catch(e){}
    try { map.scrollZoom.enable(); } catch(e){}
    try { map.boxZoom.enable(); } catch(e){}
    try { map.keyboard.enable(); } catch(e){}
    try { map.touchZoomRotate.enable(); } catch(e){}
    showToast('Calibration mode: Zoom/Pan enabled');
  } else {
    // Disable zoom/pan interactions when not in calibration mode
    map.dragPan.disable();
    map.doubleClickZoom.disable();
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.touchZoomRotate.disable();
    showToast('Calibration mode off: Zoom/Pan disabled');
  }
}

// Disable zoom/pan by default after map loads
map.on('load', () => {
  // Disable all zoom/pan interactions by default
  map.dragPan.disable();
  map.doubleClickZoom.disable();
  map.scrollZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  map.touchZoomRotate.disable();
  console.log('Map interactions disabled by default (enable via calibration mode)');
});

function setInteractionLock(locked) {
  centerLocked = locked;
  if (locked) {
    map.dragPan.disable();
    map.doubleClickZoom.disable();
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.touchZoomRotate.disable();
    // keep center fixed on table center
    map.jumpTo({ center: tableCenter });
    showToast('Center locked');
  } else {
    // Only enable if calibration mode is active
    if (calibrationModeActive) {
      try { map.dragPan.enable(); } catch(e){}
      try { map.doubleClickZoom.enable(); } catch(e){}
      try { map.scrollZoom.enable(); } catch(e){}
      try { map.boxZoom.enable(); } catch(e){}
      try { map.keyboard.enable(); } catch(e){}
      try { map.touchZoomRotate.enable(); } catch(e){}
    }
    showToast('Center unlocked');
  }
}

// if centerLocked, keep map centered when user attempts programmatic moves via buttons
const originalZoomTo = map.zoomTo.bind(map);
map.zoomTo = (z) => {
  if (centerLocked) map.jumpTo({ center: tableCenter, zoom: z });
  else originalZoomTo(z);
};

// fullscreen handling
const fsToggle = document.getElementById('fullscreen-toggle');
function isFullScreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement); }
function updateFsButton() { if (!fsToggle) return; fsToggle.title = isFullScreen() ? 'Exit Fullscreen' : 'Fullscreen'; }
fsToggle && fsToggle.addEventListener('click', () => { if (!isFullScreen()) document.documentElement.requestFullscreen().catch(()=>{}); else document.exitFullscreen().catch(()=>{}); });
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange'].forEach(ev => document.addEventListener(ev, () => { updateFsButton(); setTimeout(()=>{ map.resize(); if (tableOverlay.style.display !== 'none') showOverlay(); },250); }));
updateFsButton();

// Resize overlay on window resize
window.addEventListener('resize', () => {
  window.updateTablePresentation();
  refreshTableMapScale();
  if (tableOverlay && tableOverlay.style.display !== 'none') showOverlay();
  map.resize();
  if(autoTableFit)fitTableCamera();
  requestAnimationFrame(clipTableLayers);
});

// Basemap switcher
const basemapKeys = [defaultBasemap, 'mapboxLight', 'mapboxOutdoors', 'mapboxSatellite', 'mapboxSatelliteStreets', 'mapboxStreets', 'cartoPositron', 'osm', 'esri', 'opentopo', 'black'];
if (!mapboxToken) {
  basemapKeys.splice(1, 6);
}
const basemapToggleBtn = document.getElementById('basemap-toggle');
basemapToggleBtn.addEventListener('click', () => {
  const currentIndex = basemapKeys.indexOf(getBasemap());
  const newBasemap = basemapKeys[(currentIndex + 1) % basemapKeys.length];
  setBasemap(newBasemap);
  showToast(`Basemap: ${newBasemap}`);
});

const epcChannel = new BroadcastChannel('map_controller_channel');
document.getElementById('epc-btn')?.addEventListener('click', () => {
  setEpcMode(!epcModeActive);
  epcChannel.postMessage({ type: 'animation_state', animationId: 'epc-btn', isActive: epcModeActive });
});

// expose setBasemap for debugging
window.setBasemap = setBasemap;
window.getBasemap = getBasemap;
window.map = map;
window.mrSelectEpc = coordinate => {
  const p = map.project(coordinate);
  const feature = map.queryRenderedFeatures([[p.x - 5, p.y - 5], [p.x + 5, p.y + 5]], {layers: ['epc-buildings-fill']})[0];
  if (!feature) return;
  epcSelectedFeature = feature;
  map.getSource('epc-selected').setData({type: 'FeatureCollection', features: [feature]});
  epcChannel.postMessage({type: 'epc_building_selected', building: {type: 'Feature', geometry: feature.geometry, properties: feature.properties}});
};

// Laser pointer cursor tracking
const laserPointer = document.getElementById('laser-pointer');
document.addEventListener('mousemove', (e) => {
  laserPointer.style.left = e.clientX + 'px';
  laserPointer.style.top = e.clientY + 'px';
});

// Hide laser pointer when mouse leaves window
document.addEventListener('mouseleave', () => {
  laserPointer.style.display = 'none';
});
document.addEventListener('mouseenter', () => {
  laserPointer.style.display = 'block';
});

// end of MapLibre main.js

// --- Controller / Second Screen Logic ---

// Debug mode for controller messages - set to false in production
const CONTROLLER_DEBUG = false;

const controllerChannel = new BroadcastChannel('map_controller_channel');

controllerChannel.onmessage = (event) => {
    const data = event.data;
    if (CONTROLLER_DEBUG) console.log('Main window received:', data);

    if (data.type === 'control_action') {
        const targetId = data.target;
        if(window.APP_CONFIG.disabledLayers.includes(targetId))return;
        const btn = document.getElementById(targetId);
        
        // Handle calibration mode toggle
        if (targetId === 'calibrate-btn') {
            // Toggle calibration mode
            setCalibrationMode(!calibrationModeActive);
        }
        
        if (btn) {
            // Simulate click or trigger the function directly
            // Using click() is easiest as it triggers existing event listeners
            btn.click();
            
            // Show toast to confirm action from controller
            showToast(`Remote command: ${targetId}`);
        }
    } else if (data.type === 'intro_control') {
        if(data.action==='play')window.mrPlayIntroduction();else window.mrSkipIntroduction();
    } else if (data.type === 'reset_view') {
        const current=window.MR_CALIBRATION.current;
        autoTableFit=!!current.fitToTable;tableFlip=!!current.tableFlip;
        if(autoTableFit)fitTableCamera();
        else if(current.fitBounds){
          const [w,s,e,n]=current.fitBounds;map.fitBounds([[w,s],[e,n]],{padding:40,duration:0,bearing:0});
        } else map.flyTo({center:current.center,zoom:current.zoom,bearing:current.bearing,pitch:0});
        // Also restart street life animation when resetting to default view
        if (window.streetLifeAnimation) {
            setTimeout(() => {
                window.streetLifeAnimation.updateVisibility();
            }, 500);
        }
    } else if (data.type === 'calibrate_action') {
        const action = data.action;
        const broadcastCalibration=()=>controllerChannel.postMessage({type:'calibration_state',calibration:{...window.MR_CALIBRATION.current,dimensions:{...window.MR_CALIBRATION.dimensions},fitToTable:autoTableFit,tableFlip}});
        if (['zoom_in','zoom_out','pan_up','pan_down','pan_left','pan_right','rotate_left','rotate_right','reset_rotation'].includes(action)) autoTableFit=false;
        if(action==='fit_table' || action==='flip_table'){
          autoTableFit=true;
          if(action==='flip_table')tableFlip=!tableFlip;
          if(data.dimensions)window.MR_CALIBRATION.applyDimensions(data.dimensions);
          fitTableCamera();
          showOverlay();
          broadcastCalibration();
          return;
        }
        
        if (action === 'show_overlay') {
            if(data.dimensions)window.MR_CALIBRATION.applyDimensions(data.dimensions);
            else {
              const {sw,sh,tw,th}=data.params;
              window.MR_CALIBRATION.applyDimensions({...window.MR_CALIBRATION.dimensions,screenWidth:+sw,screenHeight:+sh,tableWidth:+tw,tableHeight:+th});
            }
            showOverlay();
            document.getElementById('table-overlay').style.display='block';
            broadcastCalibration();
        } else if (action === 'hide_overlay') {
            const tableOverlay = document.getElementById('table-overlay');
            if (tableOverlay) tableOverlay.style.display = 'none';
            
        } else if (action === 'copy_calibration') {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const bearing = map.getBearing();
            
            const calibration = {
                center: { lng: center.lng, lat: center.lat },
                zoom: zoom,
                bearing: bearing,
                dimensions: {...window.MR_CALIBRATION.dimensions},
                fitToTable: autoTableFit,
                tableFlip
            };
            
            const calibrationText = `Map Calibration:
Center: [${center.lng.toFixed(8)}, ${center.lat.toFixed(8)}]
Zoom: ${zoom.toFixed(4)}
Bearing: ${bearing.toFixed(4)}°

JSON:
${JSON.stringify(calibration, null, 2)}`;

            // Send back to controller
            controllerChannel.postMessage({
                type: 'calibration_data',
                text: calibrationText
            });

            } else if (action === 'save_calibration' || action === 'overwrite_default_calibration') {
              const center = map.getCenter();
              const calibration = {
                id: `saved-${Date.now()}`,
                name: data.name || 'Default Calibration',
                author: data.author || '',
                timestamp: new Date().toISOString(),
                center: { lng: center.lng, lat: center.lat },
                zoom: map.getZoom(),
                bearing: map.getBearing(),
                dimensions: data.dimensions || {...window.MR_CALIBRATION.dimensions},
                fitToTable: autoTableFit,
                tableFlip
              };

              try {
                const saved = JSON.parse(localStorage.getItem((window.APP_CONFIG?.location?.id ? 'interactive_map_calibrations:' + window.APP_CONFIG.location.id : 'interactive_map_calibrations')) || '[]');
                saved.unshift(calibration);
                localStorage.setItem((window.APP_CONFIG?.location?.id ? 'interactive_map_calibrations:' + window.APP_CONFIG.location.id : 'interactive_map_calibrations'), JSON.stringify(saved));
                localStorage.setItem((window.APP_CONFIG?.location?.id ? 'interactive_map_selected_calibration:' + window.APP_CONFIG.location.id : 'interactive_map_selected_calibration'), calibration.id);
                window.MR_CALIBRATION.current=calibration;
                window.MR_CALIBRATION.applyDimensions(calibration.dimensions);
                if (action === 'overwrite_default_calibration') {
                  localStorage.setItem((window.APP_CONFIG?.location?.id ? 'interactive_map_default_calibration:' + window.APP_CONFIG.location.id : 'interactive_map_default_calibration'), JSON.stringify(calibration));
                  tableCenter = [calibration.center.lng, calibration.center.lat];
                  initialZoom = calibration.zoom;
                  initialBearing = calibration.bearing;
                }
                showToast(action === 'overwrite_default_calibration'
                  ? 'Default calibration overwritten'
                  : `Calibration saved: ${calibration.name}`);
                controllerChannel.postMessage({ type: 'calibration_saved', calibration });
              } catch (error) {
                console.error('Could not save calibration:', error);
                showToast('Could not save calibration');
              }

            } else if (action === 'load_calibration') {
              const calibration = data.calibration;
              if (!calibration?.center) return;
              localStorage.setItem((window.APP_CONFIG?.location?.id ? 'interactive_map_selected_calibration:' + window.APP_CONFIG.location.id : 'interactive_map_selected_calibration'), calibration.id || 'original');
              window.MR_CALIBRATION.current=calibration;
              autoTableFit=!!calibration.fitToTable;tableFlip=!!calibration.tableFlip;
              window.MR_CALIBRATION.applyDimensions(calibration.dimensions, !calibration.dimensions?.layoutMode && calibration.id!=='original');
              if(autoTableFit)fitTableCamera();
              else if(calibration.fitBounds){
                const [w,s,e,n]=calibration.fitBounds;map.fitBounds([[w,s],[e,n]],{padding:40,duration:0,bearing:0});
              } else map.jumpTo({
                center: [calibration.center.lng, calibration.center.lat],
                zoom: calibration.zoom,
                bearing: calibration.bearing
              });
              const restoredCenter=map.getCenter();tableCenter=[restoredCenter.lng,restoredCenter.lat];initialZoom=map.getZoom();initialBearing=map.getBearing();
              broadcastCalibration();
              showToast(`Calibration restored: ${calibration.name || 'Saved calibration'}`);
            
        } else if (action === 'zoom_in') {
            map.zoomTo(Math.min(map.getZoom()+0.01, 22));
        } else if (action === 'zoom_out') {
          map.zoomTo(Math.max(map.getZoom()-0.01, 0));
        } else if (action === 'pan_up') {
          map.panBy([0, -50]);
        } else if (action === 'pan_left') {
          map.panBy([-50, 0]);
        } else if (action === 'pan_right') {
          map.panBy([50, 0]);
        } else if (action === 'pan_down') {
          map.panBy([0, 50]);
        } else if (action === 'rotate_left') {
            map.rotateTo((map.getBearing() - 0.1) % 360);
        } else if (action === 'rotate_right') {
            map.rotateTo((map.getBearing() + 0.1) % 360);
        } else if (action === 'reset_rotation') {
            map.rotateTo(0);
        } else if (action === 'lock_center') {
            setInteractionLock(data.value);
        } else if (action === 'toggle_table_markers') {
            const visibility = data.value ? 'visible' : 'none';
            ['table-fill', 'table-line', 'table-corners', 'table-center'].forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', visibility);
                }
            });
        }
    }
};

// Broadcast state changes to controller
function broadcastState(activeLayerId) {
    controllerChannel.postMessage({
        type: 'state_update',
        activeLayer: activeLayerId
    });
}

// Hook into existing buttons to broadcast state
['cfd-simulation-btn', 'stormwater-btn', 'thermal-comfort-btn', 'sun-study-btn', 'slideshow-btn', 'grid-animation-btn', 'isovist-btn', 'bird-sounds-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('click', () => {
            broadcastState(id);
        });
    }
});
