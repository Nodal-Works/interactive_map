// Prepared CoolPaths PET map and live origin/destination routing.
(function () {
  'use strict';

  const host = location.protocol === 'file:' ? '127.0.0.1' : location.hostname;
  const API = `http://${host}:8001/api/coolpaths`;
  const channel = new BroadcastChannel('map_controller_channel');
  const EMPTY = { type: 'FeatureCollection', features: [] };
  const ids = {
    image: 'coolpaths-pet-image', raster: 'coolpaths-pet-raster',
    streets: 'coolpaths-streets', streetLine: 'coolpaths-street-line',
    routes: 'coolpaths-routes', shortest: 'coolpaths-shortest', coolest: 'coolpaths-coolest',
    stops: 'coolpaths-stops', origin: 'coolpaths-origin', destination: 'coolpaths-destination'
  };
  const state = {
    active: false, ready: false, phase: 'idle', message: '', hour: 14,
    showRaster: true, showStreets: true, meanPet: null, airTemp: null, studyDate: '2026-07-15',
    status: null, origin: null, destination: null, route: null
  };
  let layersAdded = false;
  let requestNumber = 0;
  let hoverPopup = null;

  function imageCoordinates(bounds) {
    const [west, south, east, north] = bounds;
    return [[west, north], [east, north], [east, south], [west, south]];
  }

  async function requestJson(path, options) {
    const response = await fetch(`${API}${path}`, { cache: 'no-store', ...options });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`);
    return body;
  }

  function setSource(name, data) {
    const source = map.getSource(name);
    if (source) source.setData(data);
  }

  function publish() {
    channel.postMessage({ type: 'thermal_state', ...state });
    const hud = document.getElementById('thermal-comfort-hud');
    if (!hud) return;
    hud.hidden = !state.active;
    const value = document.getElementById('thermal-hud-pet');
    const air = document.getElementById('thermal-hud-air');
    const caption = document.getElementById('thermal-hud-caption');
    if (value) value.textContent = state.meanPet == null ? '--' : Number(state.meanPet).toFixed(1);
    if (air) air.textContent = state.airTemp == null ? 'Modeled clear-sky comfort, not air temperature' :
      `Air ${Number(state.airTemp).toFixed(1)}°C · modeled clear-sky PET`;
    if (caption) caption.textContent = state.message || `${String(state.hour).padStart(2, '0')}:00 · click the map to set an origin`;
  }

  function layerVisibility() {
    const visible = (choice) => state.active && state.ready && choice ? 'visible' : 'none';
    const settings = [
      [ids.raster, state.showRaster], [ids.streetLine, state.showStreets],
      [ids.shortest, true], [ids.coolest, true], [ids.origin, true], [ids.destination, true]
    ];
    settings.forEach(([id, choice]) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible(choice));
    });
  }

  function addLayers(bounds) {
    if (layersAdded) return;
    map.addSource(ids.image, {
      type: 'image', url: `${API}/raster/${state.hour}.png`, coordinates: imageCoordinates(bounds)
    });
    map.addSource(ids.streets, { type: 'geojson', data: EMPTY });
    map.addSource(ids.routes, { type: 'geojson', data: EMPTY });
    map.addSource(ids.stops, { type: 'geojson', data: EMPTY });
    map.addLayer({ id: ids.raster, type: 'raster', source: ids.image,
      paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0 } });
    map.addLayer({ id: ids.streetLine, type: 'line', source: ids.streets,
      paint: {
        'line-color': ['interpolate', ['linear'], ['get', 'pet'],
          20, '#22d3ee', 24, '#10b981', 30, '#facc15', 36, '#fb923c', 44, '#ef4444'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 5],
        'line-opacity': 0.96
      } });
    map.addLayer({ id: ids.shortest, type: 'line', source: ids.routes,
      filter: ['==', ['get', 'kind'], 'shortest'],
      paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-dasharray': [1.5, 1.5],
        'line-opacity': 0.95 } });
    map.addLayer({ id: ids.coolest, type: 'line', source: ids.routes,
      filter: ['==', ['get', 'kind'], 'coolest'],
      paint: { 'line-color': '#48e7ff', 'line-width': 6, 'line-opacity': 0.95 } });
    map.addLayer({ id: ids.origin, type: 'circle', source: ids.stops,
      filter: ['==', ['get', 'kind'], 'origin'],
      paint: { 'circle-radius': 8, 'circle-color': '#eaffff', 'circle-stroke-color': '#06b6d4',
        'circle-stroke-width': 4 } });
    map.addLayer({ id: ids.destination, type: 'circle', source: ids.stops,
      filter: ['==', ['get', 'kind'], 'destination'],
      paint: { 'circle-radius': 8, 'circle-color': '#fff7ed', 'circle-stroke-color': '#f97316',
        'circle-stroke-width': 4 } });
    map.on('mouseenter', ids.streetLine, () => {
      if (state.active && state.ready) map.getCanvas().style.cursor = 'crosshair';
    });
    map.on('mouseleave', ids.streetLine, () => {
      map.getCanvas().style.cursor = state.active && state.ready ? 'crosshair' : '';
      if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
    });
    map.on('mousemove', ids.streetLine, (event) => {
      if (!state.active || !state.ready || !event.features?.length) return;
      const feature = event.features[0];
      const p = feature.properties || {};
      if (!hoverPopup) hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      const node = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = p.name || 'Walking path';
      const detail = document.createElement('div');
      detail.textContent = `${Number(p.pet).toFixed(1)}°C PET · ${String(state.hour).padStart(2, '0')}:00`;
      node.append(title, detail);
      hoverPopup.setLngLat(event.lngLat).setDOMContent(node).addTo(map);
    });
    layersAdded = true;
    layerVisibility();
  }

  function updateStops() {
    const points = [];
    if (state.origin) points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: state.origin },
      properties: { kind: 'origin' } });
    if (state.destination) points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: state.destination },
      properties: { kind: 'destination' } });
    setSource(ids.stops, { type: 'FeatureCollection', features: points });
  }

  function clearRoute() {
    requestNumber += 1;
    state.origin = null;
    state.destination = null;
    state.route = null;
    state.phase = state.ready ? 'choose-origin' : state.phase;
    state.message = state.ready ? 'Click the map to set an origin' : state.message;
    setSource(ids.routes, EMPTY);
    updateStops();
    publish();
  }

  async function fetchRoute() {
    if (!state.origin || !state.destination) return;
    const ownRequest = ++requestNumber;
    state.phase = 'routing';
    state.message = 'Finding shortest and coolest walking routes…';
    publish();
    try {
      const route = await requestJson('/route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: state.origin, destination: state.destination, hour: state.hour })
      });
      if (ownRequest !== requestNumber || !state.active) return;
      state.route = route;
      state.origin = route.snapped_origin;
      state.destination = route.snapped_destination;
      state.phase = 'route-ready';
      state.message = `Coolest route · ${route.comparison.heat_reduction_pct}% less heat exposure`;
      setSource(ids.routes, { type: 'FeatureCollection', features: [route.shortest, route.coolest] });
      updateStops();
    } catch (error) {
      if (ownRequest !== requestNumber) return;
      state.route = null;
      state.phase = 'route-error';
      state.message = error.message;
      setSource(ids.routes, EMPTY);
    }
    publish();
  }

  async function loadHour() {
    if (!state.ready || !state.active) return;
    const ownRequest = ++requestNumber;
    state.phase = 'loading-hour';
    state.message = `Loading PET at ${String(state.hour).padStart(2, '0')}:00…`;
    publish();
    try {
      const streets = await requestJson(`/streets/${state.hour}`);
      if (ownRequest !== requestNumber || !state.active) return;
      setSource(ids.streets, streets);
      map.getSource(ids.image).updateImage({
        url: `${API}/raster/${state.hour}.png`,
        coordinates: imageCoordinates(state.status.image_bounds)
      });
      state.meanPet = streets.properties.mean_pet_c;
      state.airTemp = state.status.hours[String(state.hour)].air_temperature_c;
      state.phase = state.origin && state.destination ? 'routing' :
        state.origin ? 'choose-destination' : 'choose-origin';
      state.message = state.origin && state.destination ? 'Updating route for selected hour…' :
        state.origin ? 'Click the map to set a destination' : 'Click the map to set an origin';
      publish();
      if (state.origin && state.destination) fetchRoute();
    } catch (error) {
      if (ownRequest !== requestNumber) return;
      state.phase = 'error';
      state.message = error.message;
      state.meanPet = null;
      state.airTemp = null;
      setSource(ids.streets, EMPTY);
      setSource(ids.routes, EMPTY);
      publish();
    }
  }

  async function initialize() {
    const activation = requestNumber;
    state.phase = 'connecting';
    state.message = 'Connecting to CoolPaths server…';
    publish();
    try {
      const status = await requestJson('/status');
      if (!status.ready) throw new Error(status.message || 'Study data is not prepared');
      await (map.loaded() ? Promise.resolve() : new Promise(resolve => map.once('load', resolve)));
      if (!state.active || activation !== requestNumber) return;
      state.status = status;
      state.ready = true;
      state.studyDate = status.study_date;
      addLayers(status.image_bounds);
      layerVisibility();
      map.getCanvas().style.cursor = 'crosshair';
      await loadHour();
    } catch (error) {
      if (!state.active || activation !== requestNumber) return;
      state.ready = false;
      state.phase = 'unavailable';
      state.message = error.message === 'Failed to fetch' ?
        'CoolPaths server unavailable on port 8001' : error.message;
      publish();
    }
  }

  async function toggle() {
    state.active = !state.active;
    requestNumber += 1;
    channel.postMessage({ type: 'animation_state', animationId: 'thermal-comfort-btn', isActive: state.active });
    if (state.active) await initialize();
    else {
      map.getCanvas().style.cursor = '';
      if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
      layerVisibility();
      state.phase = 'idle';
      state.message = '';
      publish();
    }
  }

  map.on('click', async (event) => {
    if (!state.active || !state.ready || ['loading-hour', 'error', 'unavailable'].includes(state.phase)) return;
    const startsNewRoute = !state.origin || !!state.destination;
    const ownRequest = ++requestNumber;
    const point = [event.lngLat.lng, event.lngLat.lat];
    if (startsNewRoute) {
      state.origin = null;
      state.destination = null;
      state.route = null;
      setSource(ids.routes, EMPTY);
      updateStops();
    }
    state.phase = 'snapping';
    state.message = `Snapping ${startsNewRoute ? 'origin' : 'destination'} to a walking path…`;
    publish();
    try {
      const snapped = await requestJson('/snap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ point, hour: state.hour })
      });
      if (ownRequest !== requestNumber || !state.active) return;
      if (startsNewRoute) {
        state.origin = snapped.coordinate;
        state.phase = 'choose-destination';
        state.message = 'Click the map to set a destination';
        updateStops();
        publish();
        return;
      }
      state.destination = snapped.coordinate;
      updateStops();
      fetchRoute();
    } catch (error) {
      if (ownRequest !== requestNumber || !state.active) return;
      state.phase = 'route-error';
      state.message = error.message;
      publish();
    }
  });

  channel.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'thermal_control') return;
    if (data.action === 'request_state') publish();
    if (data.action === 'clear_route') clearRoute();
    if (data.action === 'set_hour') {
      const next = Number(data.value);
      if (Number.isInteger(next) && next >= 8 && next <= 20 && next !== state.hour) {
        state.hour = next;
        loadHour();
      }
    }
    if (data.action === 'show_raster' || data.action === 'show_streets') {
      state[data.action === 'show_raster' ? 'showRaster' : 'showStreets'] = !!data.value;
      layerVisibility();
      publish();
    }
  });

  document.getElementById('thermal-comfort-btn')?.addEventListener('click', toggle);
  window.thermalComfortLayer = { toggle, clearRoute, getState: () => ({ ...state }) };
}());
