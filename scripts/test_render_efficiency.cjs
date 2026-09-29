const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

// Verify retained geometry, sampling and invalidation without GPU timing noise.
const glow = fs.readFileSync('animations/street-glow-animation.js', 'utf8');
let projections = 0, layoutReads = 0, camera = 1;
const mapRect = {left: 10, top: 20, width: 1000, height: 700};
const canvasRect = {left: 30, top: 50};
const events = {};
const context = vm.createContext({
  map: {on: (event, fn) => events[event] = fn,
    getContainer: () => ({getBoundingClientRect: () => {layoutReads++; return mapRect;}}),
    project: ([x, y]) => {projections++; return {x: x * camera, y: y * camera};}},
  streetCanvas: {width: 900, height: 600, getBoundingClientRect: () => {layoutReads++; return canvasRect;}},
  Path2D: class {constructor() {this.ops = [];} moveTo(...p) {this.ops.push(['M', ...p]);} lineTo(...p) {this.ops.push(['L', ...p]);}}
});
const cacheStart = glow.indexOf('let streetGlowPaths');
const cacheEnd = glow.indexOf('// Load default street network', cacheStart);
vm.runInContext(glow.slice(cacheStart, cacheEnd), context);
const segments = Array.from({length: 3001}, (_, i) => ({start: {lng: i, lat: i + 1}, end: {lng: i + 2, lat: i + 3}}));
let offset = context.prepareStreetGlowPaths();
const path = context.getStreetGlowPath('roads', segments, offset);
const expected = [];
for (let i = 0; i < segments.length; i += 3) expected.push(['M', i - 20, i + 1 - 30], ['L', i + 2 - 20, i + 3 - 30]);
assert.deepEqual(path.ops, expected, 'Same sampled endpoints, offsets and drawing order');
const firstProjections = projections;
for (let i = 0; i < 120; i++) {
  offset = context.prepareStreetGlowPaths();
  assert.equal(context.getStreetGlowPath('roads', segments, offset), path);
}
assert.equal(projections, firstProjections, 'Stationary frames perform zero extra map projections');
assert.equal(layoutReads, 242, 'Only two layout reads per frame');
camera = 2; events.move();
assert.notEqual(context.getStreetGlowPath('roads', segments, offset), path);
assert.deepEqual(context.getStreetGlowPath('roads', segments, offset).ops[0], ['M', -20, -28]);
const moved = context.getStreetGlowPath('roads', segments, offset);
canvasRect.left += 5; offset = context.prepareStreetGlowPaths();
assert.notEqual(context.getStreetGlowPath('roads', segments, offset), moved);
assert.deepEqual(context.getStreetGlowPath('roads', segments, offset).ops[0], ['M', -25, -28]);
const resized = context.getStreetGlowPath('roads', segments, offset); events.resize();
assert.notEqual(context.getStreetGlowPath('roads', segments, offset), resized);
vm.runInContext(extract(glow, 'parseStreetGeoJSON'), context);
context.console = {log(){}};
context.parseStreetGeoJSON({features: []});
assert.equal(vm.runInContext('streetGlowPaths.size', context), 0, 'Replacing road data invalidates paths');
console.log(`PASS street glow: ${firstProjections * 120} repeated projections avoided across 120 stationary frames; camera, layout, resize and data invalidation`);

// Both video scheduling APIs must stop immediately on navigation/disable.
const slideshow = fs.readFileSync('animations/slideshow.js', 'utf8');
for (const decoded of [false, true]) {
  const queue = new Map(); let serial = 0, draws = 0;
  const request = fn => {queue.set(++serial, fn); return serial;};
  const cancel = id => queue.delete(id);
  const media = {paused: false, ended: false};
  if (decoded) Object.assign(media, {requestVideoFrameCallback: request, cancelVideoFrameCallback: cancel});
  const c = vm.createContext({requestAnimationFrame: decoded ? () => assert.fail('Decoder must drive rendering') : request,
    cancelAnimationFrame: cancel, drawMediaOnCanvas: () => draws++, currentMediaFitMode: 'contain', currentMediaRotation: 0});
  vm.runInContext(extract(slideshow, 'drawSlideVideo'), c);
  const job = new AbortController(); c.drawSlideVideo(media, job.signal);
  assert.equal(draws, 1); assert.equal(queue.size, 1);
  const next = [...queue.values()][0]; queue.clear(); next();
  assert.equal(draws, 2); assert.equal(queue.size, 1);
  job.abort(); assert.equal(queue.size, 0);
  next(); assert.equal(draws, 2, 'Late callbacks cannot paint an obsolete slide');
  c.drawSlideVideo(media, job.signal); assert.equal(queue.size, 0);
  const job2 = new AbortController(); c.drawSlideVideo(media, job2.signal);
  media.ended = true; const end = [...queue.values()][0]; queue.clear(); end();
  assert.equal(queue.size, 0, 'Ended video releases its loop');
}
console.log('PASS video decoded-frame scheduling, RAF fallback, abort races and playback end');

const background = fs.readFileSync('controller/bg-animation.js', 'utf8');
const queue = new Map(), listeners = {}; let serial = 0, hiddenPanel = false, draws = 0, mutation;
const c = vm.createContext({animationId: null, updateParticles(){}, drawParticles(){draws++;},
  requestAnimationFrame: fn => {queue.set(++serial, fn); return serial;}, cancelAnimationFrame: id => queue.delete(id),
  document: {hidden: false, getElementById: () => ({classList: {contains: () => hiddenPanel}}), addEventListener: (event, fn) => listeners[event] = fn},
  MutationObserver: class {constructor(fn) {mutation = fn;} observe(){}}});
vm.runInContext(extract(background, 'animate') + '\n' + background.slice(background.indexOf('// A hidden welcome panel')), c);
assert.equal(queue.size, 1);
hiddenPanel = true; mutation(); assert.equal(queue.size, 0);
hiddenPanel = false; mutation(); mutation(); assert.equal(queue.size, 1, 'Resume schedules only one loop');
let tick = [...queue.values()][0]; queue.clear(); tick(); assert.equal(draws, 1); assert.equal(queue.size, 1);
c.document.hidden = true; listeners.visibilitychange(); assert.equal(queue.size, 0);
c.document.hidden = false; listeners.visibilitychange(); assert.equal(queue.size, 1);
console.log('PASS controller hidden-panel and hidden-document suspension, single-loop resume');
