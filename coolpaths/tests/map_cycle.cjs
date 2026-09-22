// Run with: node coolpaths/tests/map_cycle.cjs
// Exercises the map layer's asynchronous three-click and hour-change behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const channels = [];
class BroadcastChannel {
  constructor() { this.listeners = []; channels.push(this); }
  addEventListener(_, listener) { this.listeners.push(listener); }
  postMessage(message) {
    for (const peer of channels) if (peer !== this) {
      for (const listener of peer.listeners) listener({ data: message });
    }
  }
}

const sources = new Map();
const handlers = {};
const layers = new Map();
const timers = new Map();
let nextTimer = 0;
const map = {
  loaded: () => true,
  once: () => {},
  on(type, layerOrHandler, handler) {
    if (typeof layerOrHandler === 'function') handlers[type] = layerOrHandler;
  },
  addSource(name, definition) {
    sources.set(name, {
      ...definition,
      setData(data) { this.data = data; },
      updateImage(image) { this.image = image; }
    });
  },
  getSource: name => sources.get(name),
  addLayer: layer => layers.set(layer.id, layer),
  getLayer: name => layers.get(name),
  setLayoutProperty(name, property, value) { layers.get(name)[property] = value; },
  getCanvas: () => ({ style: {} }),
  // The installation is projection-calibrated. Any camera call is a failure.
  fitBounds() { throw new Error('Tour must never fit the map'); },
  easeTo() { throw new Error('Tour must never change the camera'); },
  flyTo() { throw new Error('Tour must never fly the camera'); },
  jumpTo() { throw new Error('Tour must never change the camera'); }
};

const route = {
  snapped_origin: [11.9, 57.7], snapped_destination: [11.91, 57.71],
  shortest: { type: 'Feature', properties: { kind: 'shortest' } },
  coolest: { type: 'Feature', properties: { kind: 'coolest' } },
  comparison: { heat_reduction_pct: 12 }
};
let routeCalls = 0;
let inspections = 0;
const weather = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [String(i + 8), { air_temperature_c: 26 }]));
const fetch = async (url, options = {}) => {
  let body;
  if (url.endsWith('/status')) body = {
    ready: true, study_date: '2026-07-15', image_bounds: [11.8, 57.6, 12, 57.8],
    hours: weather, bounds: [11.8, 57.6, 12, 57.8]
  };
  else if (url.includes('/streets/')) body = {
    type: 'FeatureCollection', features: [], properties: { mean_pet_c: 32 }
  };
  else if (url.endsWith('/snap')) body = { coordinate: JSON.parse(options.body).point };
  else if (url.endsWith('/route')) { routeCalls++; body = route; }
  else if (url.includes('/layers?')) body = { layers: {}, sun: { azimuth_deg: 180, elevation_deg: 40 } };
  else if (url.endsWith('/buildings')) body = { type: 'FeatureCollection', features: [] };
  else if (url.includes('/layers/')) body = {};
  else if (url.includes('/demo-route/')) body = { ...route, example: true };
  else if (url.endsWith('/inspect')) {
    inspections++;
    body = { ...JSON.parse(options.body), values: { pet: 31, mrt: 43, shade: 0, svf: .8, canopy: 0 }, weather: { air_temperature_c: 26 } };
  }
  else throw new Error(`Unexpected request: ${url}`);
  return { ok: true, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) };
};

const elements = new Map();
for (const id of ['thermal-comfort-hud', 'thermal-hud-pet', 'thermal-hud-caption', 'thermal-comfort-btn']) {
  elements.set(id, { textContent: '', addEventListener() {} });
}
const context = { map, BroadcastChannel, fetch, console,
  setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
  clearTimeout(id) { timers.delete(id); },
  location: { protocol: 'http:', hostname: '127.0.0.1' },
  document: { getElementById: id => elements.get(id) },
  window: {} };
vm.runInNewContext(fs.readFileSync('animations/coolpaths-guide.js', 'utf8'), context);
vm.runInNewContext(fs.readFileSync('animations/thermal-comfort.js', 'utf8'), context);
const layer = context.window.thermalComfortLayer;
const controller = new BroadcastChannel();
const states = [];
controller.addEventListener('message', event => {
  if (event.data.type === 'thermal_state') states.push(event.data);
});
const settle = () => new Promise(resolve => setTimeout(resolve, 15));

(async () => {
  await layer.toggle();
  assert.equal(layer.getState().ready, true);
  assert.equal(layer.getState().phase, 'choose-origin');
  handlers.click({ lngLat: { lng: 11.9, lat: 57.7 } });
  await settle();
  assert.equal(layer.getState().phase, 'choose-destination');
  handlers.click({ lngLat: { lng: 11.91, lat: 57.71 } });
  await settle();
  assert.equal(layer.getState().phase, 'route-ready');
  assert.equal(routeCalls, 1);
  handlers.click({ lngLat: { lng: 11.92, lat: 57.72 } });
  await settle();
  assert.equal(layer.getState().phase, 'choose-destination');
  assert.equal(layer.getState().destination, null);
  assert.equal(sources.get('coolpaths-routes').data.features.length, 0);
  controller.postMessage({ type: 'thermal_control', action: 'set_hour', value: 17 });
  await settle();
  assert.equal(layer.getState().hour, 17);
  assert.equal(sources.get('coolpaths-pet-image').image.url.includes('/17.png'), true);
  controller.postMessage({ type: 'thermal_control', action: 'show_raster', value: false });
  assert.equal(layers.get('coolpaths-pet-raster').visibility, 'none');
  assert.equal(states.at(-1).showRaster, false);
  // Fill the user's destination, then inspect without altering that route.
  handlers.click({ lngLat: { lng: 11.91, lat: 57.71 } });
  await settle();
  const userOrigin = JSON.stringify(layer.getState().origin);
  controller.postMessage({ type: 'thermal_control', action: 'tour_step', value: 0 });
  await settle();
  assert.equal(layer.getState().tour.open, true);
  assert.equal(layers.get('coolpaths-building-volume').visibility, 'visible');
  assert.equal(layers.get('coolpaths-pet-raster').visibility, 'none');
  handlers.click({ lngLat: { lng: 11.95, lat: 57.72 } });
  await settle();
  assert.equal(layer.getState().inspection.values.pet, 31);
  assert.equal(JSON.stringify(layer.getState().origin), userOrigin);
  assert.equal(layers.get('coolpaths-inspection-circle').visibility, 'visible');
  controller.postMessage({ type: 'thermal_control', action: 'tour_step', value: 2 });
  await settle();
  assert.equal(layers.get('coolpaths-input-raster').visibility, 'visible');
  assert.equal(layers.get('coolpaths-sun-dot').visibility, 'visible');
  controller.postMessage({ type: 'thermal_control', action: 'tour_play' });
  await settle();
  assert.equal(timers.size, 1);
  const [timerId, callback] = [...timers.entries()][0];
  timers.delete(timerId);
  await callback();
  assert.equal(layer.getState().hour, 8);
  assert.equal(layer.getState().inspection.hour, 8);
  assert.ok(inspections > 1);
  assert.equal(sources.get('coolpaths-input-image').image.url.includes('/shade/8.png'), true);
  controller.postMessage({ type: 'thermal_control', action: 'tour_play' });
  assert.equal(layer.getState().tour.playing, false);
  assert.equal(timers.size, 0);
  controller.postMessage({ type: 'thermal_control', action: 'tour_end' });
  assert.equal(layer.getState().mode, 'route');
  assert.equal(layer.getState().tour.open, false);
  assert.equal(layers.get('coolpaths-input-raster').visibility, 'none');
  assert.equal(layers.get('coolpaths-pet-raster').visibility, 'none'); // preserves prior toggle
  assert.equal(JSON.stringify(layer.getState().origin), userOrigin);
  controller.postMessage({ type: 'thermal_control', action: 'clear_route' });
  controller.postMessage({ type: 'thermal_control', action: 'tour_step', value: 5 });
  await settle();
  assert.equal(layer.getState().demoRoute.example, true);
  assert.equal(layer.getState().origin, null); // demo does not replace user's selections
  assert.equal(sources.get('coolpaths-routes').data.features.length, 2);
  controller.postMessage({ type: 'thermal_control', action: 'tour_play' });
  await settle();
  await layer.toggle();
  assert.equal(timers.size, 0);
  assert.equal(layers.get('coolpaths-building-volume').visibility, 'none');
  console.log('Routing, inspection, guided playback, hour synchronization and fixed camera checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
