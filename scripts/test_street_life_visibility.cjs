const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('animations/street-life.js', 'utf8');
const start = source.indexOf('function isAnyVisualizationActive()');
const end = source.indexOf('// Listen for button clicks', start);
assert.ok(start >= 0 && end > start);
const states = new Map();
const sandbox = {
  window: {MR_ADAPTER: {active: {}}},
  document: {getElementById: id => ({classList: {contains: value => states.get(id)?.has(value) || false}})},
  isStreetLifeAnimating: true,
  startStreetLifeAnimation() { sandbox.isStreetLifeAnimating = true; },
  stopStreetLifeAnimation() { sandbox.isStreetLifeAnimating = false; }
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);
for (const layer of ['cultural-gravity-btn', 'street-view-btn', 'artwork-btn', 'cfd-simulation-btn',
  'thermal-comfort-btn', 'stormwater-btn', 'sun-study-btn', 'slideshow-btn', 'grid-animation-btn',
  'isovist-btn', 'bird-sounds-btn', 'epc-btn']) {
  states.set(layer, new Set(['active']));
  sandbox.updateStreetLifeVisibility();
  assert.equal(sandbox.isStreetLifeAnimating, false, `${layer} must hide street life`);
  states.delete(layer);
  sandbox.updateStreetLifeVisibility();
  assert.equal(sandbox.isStreetLifeAnimating, true, `${layer} stopping must restore street life`);
}
states.set('cultural-gravity-btn', new Set(['active']));
states.set('cfd-simulation-btn', new Set(['active']));
sandbox.updateStreetLifeVisibility();
states.delete('cultural-gravity-btn');
sandbox.updateStreetLifeVisibility();
assert.equal(sandbox.isStreetLifeAnimating, false, 'Another active layer keeps street life hidden');
console.log('PASS street-life suppression/restoration for 12 layers and overlapping layers');
