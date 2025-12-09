// MapLibre GL JS implementation for interactive_map
// Native bearing/rotation support and raster basemap switching

// Global function to compute overlay pixel size based on physical dimensions
// Defaults match the controller values
window.computeOverlayPixelSize = function() {
  const SCREEN_WIDTH_CM = 111.93;
  // const SCREEN_HEIGHT_CM = 62.96; // Not used for width-based scaling
  const TABLE_WIDTH_CM = 100;
  const TABLE_HEIGHT_CM = 60;
  
  const pxPerCm = window.innerWidth / SCREEN_WIDTH_CM;
  const w = Math.round(TABLE_WIDTH_CM * pxPerCm);
  const h = Math.round(TABLE_HEIGHT_CM * pxPerCm);
  
  return { w, h };
};

// Handle Start Overlay and Audio Context
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('start-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      // Resume any existing audio contexts or create a dummy one to unlock
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      ctx.resume().then(() => {
        console.log('AudioContext unlocked');
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

// Default fallback values (used if calibration file fails to load)
let tableCenter = [11.977770568930168, 57.68839377903814]; // [lon, lat]
let initialZoom = 15.806953679037164;
let initialBearing = -92.58546386659737; // degrees

// Try to load calibration synchronously via XMLHttpRequest (for compatibility with other scripts)
try {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'map-calibration.json', false); // synchronous request
  xhr.send(null);
  if (xhr.status === 200) {
    const calibration = JSON.parse(xhr.responseText);
    tableCenter = [calibration.center.lng, calibration.center.lat];
    initialZoom = calibration.zoom;
    initialBearing = calibration.bearing;
    console.log('Loaded map calibration from map-calibration.json');
  }
} catch (e) {
  console.warn('Could not load map-calibration.json, using defaults:', e);
}

// Create the map with loaded (or default) calibration
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {},
    layers: []
  },
  center: tableCenter,
  zoom: initialZoom,
  bearing: initialBearing,
  pitch: 0
});

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

// When map loads, add raster sources and layers
map.on('load', () => {
  // add each source and a raster layer; only cartoDark will be visible by default
  Object.keys(basemaps).forEach(key => {
    const bm = basemaps[key];
    map.addSource(bm.id, { type: 'raster', tiles: bm.tiles, tileSize: bm.tileSize });
    map.addLayer({
      id: bm.id + '-layer',
      type: 'raster',
      source: bm.id,
      layout: { visibility: key === 'cartoDark' ? 'visible' : 'none' }
    });
  });

  // Add table polygon and markers as a GeoJSON source
  const tableCorners = [
    [11.98451803339398,57.682927961987396],
    [11.983585758783713,57.6941405253463],
    [11.971022042873042,57.693840269664186],
    [11.971958186071914,57.68262783563063]
  ];

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
  
  // Toggle table markers visibility
  const toggleTableMarkersBtn = document.getElementById('toggle-table-markers-btn');
  let tableMarkersVisible = false;
  toggleTableMarkersBtn.classList.add('toggled-off');

  toggleTableMarkersBtn.addEventListener('click', () => {
    tableMarkersVisible = !tableMarkersVisible;
    const visibility = tableMarkersVisible ? 'visible' : 'none';
    
    // Toggle all table layers
    ['table-fill', 'table-line', 'table-corners', 'table-center'].forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
    
    // Update button appearance
    if (tableMarkersVisible) {
      toggleTableMarkersBtn.classList.remove('toggled-off');
    } else {
      toggleTableMarkersBtn.classList.add('toggled-off');
    }
  });
});

// Simple basemap switcher (call setBasemap('cartoDark') etc.)
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
  // No line or point layers for cleaner building visualization
}

// Calibration overlay (DOM rectangle centered on screen)
const tableOverlay = document.getElementById('table-overlay');

// Hide overlay by default
if (tableOverlay) tableOverlay.style.display = 'none';

let centerLocked = false;

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
    try { map.dragPan.enable(); } catch(e){}
    try { map.doubleClickZoom.enable(); } catch(e){}
    try { map.scrollZoom.enable(); } catch(e){}
    try { map.boxZoom.enable(); } catch(e){}
    try { map.keyboard.enable(); } catch(e){}
    try { map.touchZoomRotate.enable(); } catch(e){}
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
  if (tableOverlay && tableOverlay.style.display !== 'none') showOverlay();
});

// Basemap switcher
const basemapKeys = ['cartoDark', 'cartoPositron', 'osm', 'esri', 'opentopo'];
let currentBasemapIndex = 0; // Start with cartoDark

const basemapToggleBtn = document.getElementById('basemap-toggle');
basemapToggleBtn.addEventListener('click', () => {
  currentBasemapIndex = (currentBasemapIndex + 1) % basemapKeys.length;
  const newBasemap = basemapKeys[currentBasemapIndex];
  setBasemap(newBasemap);
  showToast(`Basemap: ${newBasemap}`);
});

// expose setBasemap for debugging
window.setBasemap = setBasemap;
window.map = map;

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

const controllerChannel = new BroadcastChannel('map_controller_channel');

controllerChannel.onmessage = (event) => {
    const data = event.data;
    console.log('Main window received:', data);

    if (data.type === 'control_action') {
        const targetId = data.target;
        const btn = document.getElementById(targetId);
        if (btn) {
            // Simulate click or trigger the function directly
            // Using click() is easiest as it triggers existing event listeners
            btn.click();
            
            // Show toast to confirm action from controller
            showToast(`Remote command: ${targetId}`);
        }
    } else if (data.type === 'reset_view') {
        map.flyTo({
            center: tableCenter,
            zoom: initialZoom,
            bearing: initialBearing,
            pitch: 0
        });
    } else if (data.type === 'calibrate_action') {
        const action = data.action;
        
        if (action === 'show_overlay') {
            const { sw, sh, tw, th } = data.params;
            const px = window.innerWidth / parseFloat(sw);
            const w = Math.round(parseFloat(tw) * px);
            const h = Math.round(parseFloat(th) * px);
            
            const tableOverlay = document.getElementById('table-overlay');
            if (tableOverlay) {
                tableOverlay.style.width = w + 'px';
                tableOverlay.style.height = h + 'px';
                tableOverlay.style.display = 'block';
            }
            
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
                bearing: bearing
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
            
        } else if (action === 'zoom_in') {
            map.zoomTo(Math.min(map.getZoom()+0.1, 22));
        } else if (action === 'zoom_out') {
            map.zoomTo(Math.max(map.getZoom()-0.1, 0));
        } else if (action === 'rotate_left') {
            map.rotateTo((map.getBearing() - 0.1) % 360);
        } else if (action === 'rotate_right') {
            map.rotateTo((map.getBearing() + 0.1) % 360);
        } else if (action === 'reset_rotation') {
            map.rotateTo(0);
        } else if (action === 'lock_center') {
            setInteractionLock(data.value);
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
['cfd-simulation-btn', 'stormwater-btn', 'sun-study-btn', 'slideshow-btn', 'grid-animation-btn', 'isovist-btn', 'bird-sounds-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('click', () => {
            broadcastState(id);
        });
    }
});


