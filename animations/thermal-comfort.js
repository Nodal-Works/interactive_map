// Prepared CoolPaths PET map and live origin/destination routing.
(function () {
  'use strict';

  const host = location.protocol === 'file:' ? '127.0.0.1' : location.hostname;
  const API = window.MR_SERVICES ? `${window.MR_SERVICES.coolpaths}/api/coolpaths` : `http://${host}:8001/api/coolpaths`;
  const channel = new BroadcastChannel('map_controller_channel');
  const EMPTY = { type: 'FeatureCollection', features: [] };
  const STEPS = window.COOLPATHS_GUIDE;
  const ids = {
    image: 'coolpaths-pet-image', raster: 'coolpaths-pet-raster',
    streets: 'coolpaths-streets', streetLine: 'coolpaths-street-line',
    routes: 'coolpaths-routes', shortest: 'coolpaths-shortest', coolest: 'coolpaths-coolest',
    stops: 'coolpaths-stops', origin: 'coolpaths-origin', destination: 'coolpaths-destination',
    inputImage: 'coolpaths-input-image', inputRaster: 'coolpaths-input-raster',
    buildings: 'coolpaths-buildings', buildingsFill: 'coolpaths-building-volume',
    sample: 'coolpaths-inspection', sampleCircle: 'coolpaths-inspection-circle',
    sun: 'coolpaths-sun', sunRay: 'coolpaths-sun-ray', sunDot: 'coolpaths-sun-dot'
  };
  const state = {
    active: false, ready: false, phase: 'idle', message: '', hour: 14,
    showRaster: true, showStreets: true, meanPet: null, airTemp: null, studyDate: '2026-07-15',
    status: null, origin: null, destination: null, route: null,
    mode: 'route', inspection: null, inspectionPoint: null, inspectionLoading: false, inspectionError: '',
    catalog: null, demoRoute: null,
    tour: { open: false, playing: false, step: 0, layer: 'buildings', loading: false, error: '' }
  };
  let layersAdded = false;
  let requestNumber = 0;
  let hoverPopup = null;
  let tourRequest = 0;
  let inspectionRequest = 0;
  let tourTimer = null;
  let buildingsLoaded = false;

  function displayedRoute() {
    return state.route || (state.tour.open && state.tour.step === 5 ? state.demoRoute : null);
  }

  function drawRoutes() {
    const route = displayedRoute();
    setSource(ids.routes, route ? { type: 'FeatureCollection', features: [route.shortest, route.coolest] } : EMPTY);
    updateStops();
  }

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
    if (caption) caption.textContent = state.tour.open ?
      `${STEPS[state.tour.step].title} · ${String(state.hour).padStart(2, '0')}:00 · click to inspect` :
      state.mode === 'inspect' ? 'Click the map to inspect a location in the dashboard' :
      state.message || `${String(state.hour).padStart(2, '0')}:00 · click the map to set an origin`;
  }

  function layerVisibility() {
    const visible = (choice) => state.active && state.ready && choice ? 'visible' : 'none';
    const settings = [
      [ids.raster, state.tour.open ? state.tour.layer === 'pet' : state.showRaster],
      [ids.streetLine, state.tour.open ? ['streets', 'routes'].includes(state.tour.layer) : state.showStreets],
      [ids.shortest, !state.tour.open || state.tour.layer === 'routes'],
      [ids.coolest, !state.tour.open || state.tour.layer === 'routes'],
      [ids.origin, !state.tour.open || state.tour.layer === 'routes'],
      [ids.destination, !state.tour.open || state.tour.layer === 'routes'],
      [ids.inputRaster, state.tour.open && !state.tour.loading && !state.tour.error &&
        !['buildings', 'pet', 'streets', 'routes'].includes(state.tour.layer)],
      [ids.buildingsFill, state.tour.open && state.tour.layer === 'buildings' && !state.tour.loading],
      [ids.sunRay, state.tour.open && state.tour.step === 2],
      [ids.sunDot, state.tour.open && state.tour.step === 2],
      [ids.sampleCircle, state.mode === 'inspect' && !!state.inspectionPoint]
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
    map.addSource(ids.inputImage, { type: 'image', url: `${API}/raster/${state.hour}.png`, coordinates: imageCoordinates(bounds) });
    [ids.buildings, ids.sample, ids.sun].forEach(id => map.addSource(id, { type: 'geojson', data: EMPTY }));
    map.addLayer({ id: ids.raster, type: 'raster', source: ids.image,
      paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0 } });
    map.addLayer({ id: ids.inputRaster, type: 'raster', source: ids.inputImage,
      paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 200 } });
    map.addLayer({ id: ids.buildingsFill, type: 'fill-extrusion', source: ids.buildings,
      paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'height_m'], 0, '#a5b4fc', 30, '#6366f1'],
        'fill-extrusion-height': ['get', 'height_m'], 'fill-extrusion-opacity': 0.85 } });
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
    map.addLayer({ id: ids.sampleCircle, type: 'circle', source: ids.sample,
      paint: { 'circle-radius': 10, 'circle-color': '#e879f9', 'circle-opacity': 0.35,
        'circle-stroke-color': '#fae8ff', 'circle-stroke-width': 3 } });
    map.addLayer({ id: ids.sunRay, type: 'line', source: ids.sun,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#fbbf24', 'line-width': 3, 'line-dasharray': [2, 2] } });
    map.addLayer({ id: ids.sunDot, type: 'circle', source: ids.sun,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': '#fbbf24', 'circle-radius': 11, 'circle-stroke-color': '#fef3c7', 'circle-stroke-width': 3 } });
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
    const demo = state.tour.open && state.tour.step === 5 && !state.route ? state.demoRoute : null;
    const origin = demo?.snapped_origin || state.origin;
    const destination = demo?.snapped_destination || state.destination;
    if (origin) points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: origin },
      properties: { kind: 'origin' } });
    if (destination) points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: destination },
      properties: { kind: 'destination' } });
    setSource(ids.stops, { type: 'FeatureCollection', features: points });
  }

  function pauseTour() {
    clearTimeout(tourTimer);
    tourTimer = null;
    state.tour.playing = false;
  }

  function sunDirection() {
    if (!state.catalog?.sun) return;
    const [w, s, e, n] = state.status.bounds;
    const center = [(w + e) / 2, (s + n) / 2];
    const angle = state.catalog.sun.azimuth_deg * Math.PI / 180;
    const sun = [center[0] + Math.sin(angle) * 280 / (111320 * Math.cos(center[1] * Math.PI / 180)),
      center[1] + Math.cos(angle) * 280 / 111320];
    setSource(ids.sun, { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [center, sun] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: sun } }
    ] });
  }

  async function refreshTour() {
    if (!state.tour.open || !state.ready || !state.active) return;
    const ownRequest = ++tourRequest;
    const layer = state.tour.layer;
    const hour = state.hour;
    state.tour.loading = true;
    state.tour.error = '';
    layerVisibility();
    publish();
    try {
      const catalog = await requestJson(`/layers?hour=${hour}`);
      let buildingData = null;
      let demo = null;
      if (layer === 'buildings' && !buildingsLoaded) buildingData = await requestJson('/buildings');
      else if (layer === 'routes' && !state.route) demo = await requestJson(`/demo-route/${hour}`);
      else if (!['buildings', 'routes', 'streets', 'pet'].includes(layer)) {
        const response = await fetch(`${API}/layers/${layer}/${hour}.png`);
        if (!response.ok) throw new Error(`${catalog.layers[layer]?.title || layer} is unavailable`);
        await response.arrayBuffer();
      }
      if (ownRequest !== tourRequest || !state.tour.open || !state.active) return;
      state.catalog = catalog;
      if (buildingData) { setSource(ids.buildings, buildingData); buildingsLoaded = true; }
      if (demo) state.demoRoute = demo;
      if (!['buildings', 'routes', 'streets', 'pet'].includes(layer)) {
        map.getSource(ids.inputImage).updateImage({ url: `${API}/layers/${layer}/${hour}.png`,
          coordinates: imageCoordinates(state.status.image_bounds) });
      }
      sunDirection();
      drawRoutes();
      state.tour.loading = false;
    } catch (error) {
      if (ownRequest !== tourRequest) return;
      state.tour.loading = false;
      state.tour.error = error.message;
      pauseTour();
    }
    layerVisibility();
    publish();
  }

  async function chooseStep(index) {
    if (!state.active || !state.ready || !Number.isInteger(index) || !STEPS[index]) return;
    pauseTour();
    state.tour.open = true;
    state.tour.step = index;
    state.tour.layer = STEPS[index].layer;
    state.mode = 'inspect';
    await refreshTour();
  }

  function endTour() {
    pauseTour();
    tourRequest += 1;
    state.tour.open = false;
    state.tour.loading = false;
    state.mode = 'route';
    drawRoutes();
    layerVisibility();
    publish();
  }

  function scheduleTour(sunFrame = 0) {
    if (!state.tour.playing) return;
    tourTimer = setTimeout(async () => {
      if (!state.active || !state.tour.playing) return;
      const step = state.tour.step;
      if (step === 2 && sunFrame < 5) {
        state.hour = [8, 11, 14, 17, 20][sunFrame];
        await loadHour();
        if (state.tour.playing && state.tour.step === step) scheduleTour(sunFrame + 1);
        return;
      }
      if (step === STEPS.length - 1) { pauseTour(); publish(); return; }
      await chooseStep(step + 1);
      // chooseStep pauses; a user pause during the request must also stay paused.
      if (state.active && state.tour.open && state.tour.step === step + 1 && !state.tour.error && autoAdvanceToken === playbackToken) {
        state.tour.playing = true;
        publish();
        scheduleTour();
      }
    }, state.tour.step === 2 ? 2400 : 8000);
    const autoAdvanceToken = playbackToken;
  }

  let playbackToken = 0;
  async function playTour() {
    const token = ++playbackToken;
    if (!state.tour.open || state.tour.step === 5) await chooseStep(0);
    if (token !== playbackToken || !state.active || !state.ready || state.tour.error) return;
    state.tour.playing = true;
    publish();
    scheduleTour();
  }

  async function inspectPoint(point) {
    const ownRequest = ++inspectionRequest;
    state.inspectionPoint = point;
    state.inspectionLoading = true;
    state.inspectionError = '';
    state.inspection = null;
    setSource(ids.sample, { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } }
    ] });
    layerVisibility();
    publish();
    try {
      const result = await requestJson('/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ point, hour: state.hour }) });
      if (ownRequest !== inspectionRequest || !state.active) return;
      state.inspection = result;
    } catch (error) {
      if (ownRequest !== inspectionRequest) return;
      state.inspectionError = error.message;
    }
    state.inspectionLoading = false;
    publish();
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
      drawRoutes();
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
    const loadedHour = state.hour;
    state.phase = 'loading-hour';
    state.message = `Loading PET at ${String(state.hour).padStart(2, '0')}:00…`;
    state.route = null;
    state.demoRoute = null;
    drawRoutes();
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
      if (state.origin && state.destination) await fetchRoute();
      if (!state.active || state.hour !== loadedHour) return;
      await Promise.all([
        state.tour.open ? refreshTour() : Promise.resolve(),
        state.inspectionPoint ? inspectPoint(state.inspectionPoint) : Promise.resolve()
      ]);
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
    document.getElementById('thermal-comfort-btn')?.classList.toggle('active',state.active);
    requestNumber += 1;
    channel.postMessage({ type: 'animation_state', animationId: 'thermal-comfort-btn', isActive: state.active });
    if (state.active) await initialize();
    else {
      playbackToken += 1;
      inspectionRequest += 1;
      state.inspectionLoading = false;
      endTour();
      map.getCanvas().style.cursor = '';
      if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
      layerVisibility();
      state.phase = 'idle';
      state.message = '';
      publish();
    }
  }

  async function selectPoint(event) {
    if (!state.active || !state.ready || ['loading-hour', 'error', 'unavailable'].includes(state.phase)) return;
    if (state.mode === 'inspect') {
      playbackToken += 1;
      pauseTour();
      await inspectPoint([event.lngLat.lng, event.lngLat.lat]);
      return;
    }
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
      if (ownRequest !== requestNumber || !state.active || state.mode !== 'route') return;
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
  }
  map.on('click', event => { if (!window.MR_CANVAS_EDITING) selectPoint(event); });

  channel.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'thermal_control') return;
    if (data.action === 'request_state') publish();
    if (data.action === 'clear_route') { playbackToken += 1; endTour(); clearRoute(); }
    if (data.action === 'set_mode') {
      playbackToken += 1;
      pauseTour();
      if (data.value === 'route') endTour();
      else if (data.value === 'inspect') { state.mode = 'inspect'; layerVisibility(); publish(); }
    }
    if (data.action === 'tour_play') {
      if (state.tour.playing) { playbackToken += 1; pauseTour(); publish(); }
      else playTour();
    }
    if (data.action === 'tour_pause') { playbackToken += 1; pauseTour(); publish(); }
    if (data.action === 'tour_step') { playbackToken += 1; chooseStep(Number(data.value)); }
    if (data.action === 'tour_next' || data.action === 'tour_back') {
      playbackToken += 1;
      chooseStep(Math.max(0, Math.min(STEPS.length - 1, state.tour.step + (data.action === 'tour_next' ? 1 : -1))));
    }
    if (data.action === 'tour_end') { playbackToken += 1; endTour(); }
    if (data.action === 'tour_explore') {
      playbackToken += 1;
      pauseTour();
      state.mode = 'inspect';
      layerVisibility();
      publish();
    }
    if (data.action === 'tour_layer' && state.tour.open && STEPS[state.tour.step].choices.includes(data.value)) {
      playbackToken += 1;
      pauseTour();
      state.tour.layer = data.value;
      refreshTour();
    }
    if (data.action === 'set_hour') {
      const next = Number(data.value);
      if (Number.isInteger(next) && next >= 8 && next <= 20 && next !== state.hour) {
        playbackToken += 1;
        pauseTour();
        state.hour = next;
        loadHour();
      }
    }
    if (data.action === 'show_raster' || data.action === 'show_streets') {
      if (state.tour.open) { playbackToken += 1; endTour(); }
      state[data.action === 'show_raster' ? 'showRaster' : 'showStreets'] = !!data.value;
      layerVisibility();
      publish();
    }
  });

  document.getElementById('thermal-comfort-btn')?.addEventListener('click', toggle);
  window.thermalComfortLayer = { toggle, clearRoute, selectPoint: coordinate => selectPoint({lngLat: {lng: coordinate[0], lat: coordinate[1]}}), getState: () => ({ ...state }) };
}());
