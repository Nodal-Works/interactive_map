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
  getCanvas: () => ({ style: {} })
};

const route = {
  snapped_origin: [11.9, 57.7], snapped_destination: [11.91, 57.71],
  shortest: { type: 'Feature', properties: { kind: 'shortest' } },
  coolest: { type: 'Feature', properties: { kind: 'coolest' } },
  comparison: { heat_reduction_pct: 12 }
};
let routeCalls = 0;
const fetch = async (url, options = {}) => {
  let body;
  if (url.endsWith('/status')) body = {
    ready: true, study_date: '2026-07-15', image_bounds: [11.8, 57.6, 12, 57.8],
    hours: { '14': { air_temperature_c: 26 }, '17': { air_temperature_c: 24 } }
  };
  else if (url.includes('/streets/')) body = {
    type: 'FeatureCollection', features: [], properties: { mean_pet_c: 32 }
  };
  else if (url.endsWith('/snap')) body = { coordinate: JSON.parse(options.body).point };
  else if (url.endsWith('/route')) { routeCalls++; body = route; }
  else throw new Error(`Unexpected request: ${url}`);
  return { ok: true, json: async () => body };
};

const elements = new Map();
for (const id of ['thermal-comfort-hud', 'thermal-hud-pet', 'thermal-hud-caption', 'thermal-comfort-btn']) {
  elements.set(id, { textContent: '', addEventListener() {} });
}
const context = { map, BroadcastChannel, fetch, console,
  location: { protocol: 'http:', hostname: '127.0.0.1' },
  document: { getElementById: id => elements.get(id) },
  window: {} };
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
  console.log('Map three-click cycle, hour change, visibility, and BroadcastChannel passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
