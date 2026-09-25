const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Execute the production drawing loop and inspect its canvas geometry, rather
// than duplicating the heading formula in the test.
const source = fs.readFileSync('animations/street-life.js', 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  return start < 0 ? '' : source.slice(start, source.indexOf('\n}', start) + 2);
}
const functions = ['getPointAlongPath', 'getScreenPathAngle', 'projectToStreetLifeCanvas',
  'drawStreetLife', 'drawFastLight', 'drawGeographicVehicle', 'drawEmergencyVehicle', 'isOnScreen'];
function canvas() {
  let angle = 0;
  const stack = [], beams = [], tails = [], headings = [];
  const vector = x => ({x: Math.cos(angle) * x, y: Math.sin(angle) * x});
  const noop = () => {};
  return {beams, tails, headings, save() { stack.push(angle); }, restore() { angle = stack.pop(); },
    rotate(a) { angle += a; if (stack.length === 1) headings.push(vector(1)); }, translate: noop, clearRect: noop, drawImage: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop, arc: noop,
    createLinearGradient(x0, y0, x1) {
      if (x0 !== 0) (x0 > 0 ? beams : tails).push(vector(x1 - x0));
      return {addColorStop: noop};
    },
    createRadialGradient() { return {addColorStop: noop}; },
    fillRect(x, y, width) {
      if (this.globalAlpha === .22) beams.push(vector(x + width / 2));
    }};
}
let cases = 0;
for (const geographicSymbols of source.includes('function drawGeographicVehicle') ? [false, true] : [false]) {
  for (const bearing of [0, 35, 90, 180, 270, -47]) {
    for (const pitch of [0, 55]) {
      const radians = bearing * Math.PI / 180;
      const project = ([lng, lat]) => {
        const x = (lng - 12) * Math.cos(57.7 * Math.PI / 180) * 1e5;
        const y = -(lat - 57.7) * 1e5;
        return {x: 1000 + x * Math.cos(radians) + y * Math.sin(radians),
          y: 1000 + (-x * Math.sin(radians) + y * Math.cos(radians)) * Math.cos(pitch * Math.PI / 180)};
      };
      for (const [dx, dy] of [[.001, 0], [0, .001], [.001, .001], [-.001, .0005]]) {
        const coords = [[12, 57.7], [12 + dx, 57.7 + dy], [12 + dx - dy, 57.7 + dy + dx]];
        const lengths = coords.slice(1).map((p, i) => Math.hypot((p[0] - coords[i][0]) * Math.cos(coords[i][1] * Math.PI / 180), p[1] - coords[i][1]));
        const path = {coords, totalLength: lengths[0] + lengths[1], cumulativeLengths: [0, lengths[0], lengths[0] + lengths[1]],
          segmentAngles: coords.slice(1).map((p, i) => Math.atan2(p[1] - coords[i][1], (p[0] - coords[i][0]) * Math.cos(coords[i][1] * Math.PI / 180)))};
        for (const direction of [1, -1]) for (const progress of [.2, .8, direction === 1 ? 0 : 1]) {
          for (const type of ['car', 'taxi', 'bus', 'bicycle', 'emergency']) {
            const ctx = canvas();
            const rect = () => ({left: 20, top: 30});
            const context = vm.createContext({streetLifeCtx: ctx, streetLifeCanvas: {width: 2000, height: 2000, getBoundingClientRect: rect},
              streetLifeRects: null, document: {getElementById: () => ({getBoundingClientRect: rect})},
              map: {project, getBearing: () => bearing, getZoom: () => 15, getCenter: () => ({lat: 57.7}), getContainer: () => ({getBoundingClientRect: rect})},
              vehicles: type === 'emergency' ? [] : [{path, progress, direction, type, colors: {body: '#fff', frame: '#fff'}}], pedestrians: [],
              emergencyVehicle: type === 'emergency' ? {path, progress, direction, flashPhase: .5, spinPhase: 1} : null,
              CONFIG: {emergencyLightRadius: 60},
              staticLayerDirty: false, hasMapMoved: () => false, staticLayerCanvas: {}, geographicSymbols, symbolPixelsPerMetre: 1,
              window: {MR_TABLE: {pixelsPerMetre: () => 1, symbol: (length, width) => ({length, width})}}});
            vm.runInContext(functions.map(extract).join('\n'), context);
            context.drawStreetLife();
            const before = context.getPointAlongPath(path, progress);
            const after = context.getPointAlongPath(path, progress + direction * .0001);
            const a = project([before.lng, before.lat]), b = project([after.lng, after.lat]);
            const displacement = {x: b.x - a.x, y: b.y - a.y};
            const alignment = v => (v.x * displacement.x + v.y * displacement.y) / Math.hypot(v.x, v.y) / Math.hypot(displacement.x, displacement.y);
            const label = `${type}, direction ${direction}, bearing ${bearing}, pitch ${pitch}, progress ${progress}, geographic ${geographicSymbols}`;
            assert.ok(alignment(ctx.headings[0]) > .999999, `Vehicle heading follows movement: ${label}`);
            if (type !== 'emergency' || geographicSymbols) {
              assert.equal(ctx.beams.length, 1);
              assert.ok(alignment(ctx.beams[0]) > .999999, `Headlamp must lead actual movement: ${label}`);
            }
            if (!geographicSymbols && type !== 'emergency') assert.ok(alignment(ctx.tails[0]) < -.999999, `Taillight must follow actual movement: ${label}`);
            cases++;
          }
        }
      }
    }
  }
}
console.log(`PASS Street Life: ${cases} headlamp/travel checks across vehicle types, directions, turns, endpoints, map bearings and pitch`);
