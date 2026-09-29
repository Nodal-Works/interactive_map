// Compare against a saved, unmodified cfd-core.js (copy it to a .cjs file).
// node scripts/compare_cfd_core.cjs .runtime/cfd-core-before.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.argv[2]) {
  console.error('Usage: node scripts/compare_cfd_core.cjs <saved-reference-core.cjs>');
  process.exit(1);
}
const before = require(path.resolve(process.argv[2]));
const after = require('../animations/cfd-core.js');
for (const boundary of ['open', 'closed', 'periodic', 'channel']) {
  for (const angle of [0, 45, 90, 225]) {
    const nx = 24, ny = 18, solid = new Uint8Array(nx * ny), canopy = new Float32Array(nx * ny);
    for (let y = 6; y < 10; y++) for (let x = 10; x < 13; x++) solid[y * nx + x] = 1;
    for (let n = 0; n < canopy.length; n++) canopy[n] = n % 5 ? 0 : .7;
    const options = { nx, ny, x0: 9, y0: 9, vw: 6, vh: 4, solid, canopy, boundary, angle,
      force: boundary === 'channel' ? [1e-5, 0] : [0, 0] };
    const a = new before.Solver(options), b = new after.Solver(options);
    for (let i = 0; i < 450; i++) {
      a.step(); b.step();
      if (i % 50 === 0 || i === 449) {
        assert.deepEqual(b.f, a.f, `${boundary}/${angle}: populations at ${i}`);
        assert.deepEqual(b.ux, a.ux); assert.deepEqual(b.uy, a.uy);
        assert.deepEqual(b.diagnostics, a.diagnostics);
      }
    }
  }
}
console.log('PASS bit-identical populations, velocity and diagnostics: four boundaries, four angles, obstacles, canopy, forcing and inlet ramp');
const med = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
for (const angle of [0,45]) {
  const grid = after.domain(2283,1368,150,angle);
  const solvers = [new before.Solver({...grid,angle}),new after.Solver({...grid,angle})];
  for (const solver of solvers) for(let i=0;i<100;i++) solver.step();
  const times=[[],[]];
  for(let round=0;round<5;round++) for(const index of round%2?[1,0]:[0,1]) {
    const start=performance.now();for(let i=0;i<150;i++) solvers[index].step();
    times[index].push((performance.now()-start)/150);
  }
  console.log(JSON.stringify({angle,grid:[grid.nx,grid.ny],beforeMs:med(times[0]),afterMs:med(times[1]),speedup:med(times[0])/med(times[1]),extraBytes:solvers[1].pull.byteLength,times}));
}
