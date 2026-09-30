const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('animations/bottom-ribbon-state.js', 'utf8'), context);
const create = context.window.MR_BOTTOM_RIBBON_STATE;
const state = create();

state.setActive('isovist', true);
state.setAvailable('isovist', true);
assert.equal(state.snapshot().visible, 'isovist');
state.setActive('ecom', true);
state.setAvailable('ecom', true);
assert.equal(state.snapshot().visible, 'ecom', 'Auto shows the most recently activated available ribbon');

state.select('isovist');
state.setActive('ecom', true);
assert.equal(state.snapshot().visible, 'isovist', 'Manual selection persists while the other ribbon changes');
state.setActive('isovist', false);
assert.equal(state.snapshot().selection, 'auto', 'Turning the chosen layer off resets selection');
assert.equal(state.snapshot().visible, 'ecom', 'Auto falls back to the remaining available ribbon');

state.setActive('ecom', false);
assert.equal(state.snapshot().visible, null, 'No active ribbons means no visible ribbon');
assert.equal(create.heightFor(180, 1920, 120, 9), 144);
assert.equal(create.heightFor(40, 1280, 120, 9), 40, 'Ribbon height is capped by available map space');
console.log('PASS: bottom ribbon activation order, manual choice, fallback, and calibrated sizing');
