const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('controller.js', 'utf8');
const opened = [];
const context = vm.createContext({
    URLSearchParams, location: {search: ''},
    document: {querySelector: () => null, getElementById: () => null},
    openHostLayer: id => opened.push(id),
    setSunStudyLayout() {}, resetCampusDemoLegend() {},
    epcState: {}, renderEpcBuildingDashboard() {}
});
vm.runInContext(
    source.slice(source.indexOf('const ANIMATION_BUTTONS ='), source.indexOf('// Function buttons')) +
    source.slice(source.indexOf('let activeAnimations ='), source.indexOf('function syncAnimationButtonStates()')) +
    '\nfunction syncAnimationButtonStates() {}\nthis.active = () => [...activeAnimations];', context);
context.setAnimationState('trafik-btn', true);
context.setAnimationState('unknown-background', true);
context.setAnimationState('trafik-btn', false);
assert.equal(opened.length, 0, 'Background startup must not navigate away from Home');
assert.equal(context.active().length, 0, 'Background animations must not enter controller layer ordering');
context.setAnimationState('ecom-energy-btn', true, false);
assert.equal(opened.length, 0, 'Initial state sync must not navigate');
context.setAnimationState('stormwater-btn', true);
context.setAnimationState('stormwater-btn', true);
assert.deepEqual(opened, ['stormwater-btn'], 'A real layer activation opens its dashboard once');
context.setAnimationState('stormwater-btn', false);
assert.deepEqual(opened, ['stormwater-btn'], 'Deactivation does not navigate');
context.location.search = '?sessionController=1';
context.setAnimationState('slideshow-btn', true);
assert.equal(opened.length, 1, 'Embedded controllers retain their selected dashboard');
console.log('PASS: background startup preserves Home; recognised layers still navigate and synchronise');
