// Shared, DOM-free D2Q9/TRT solver and flow geometry. Also loaded by the worker/tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CFD = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
  const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
  const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
  const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
  const DEFAULTS = Object.freeze({ windSpeed: 5, angle: 0, viscosity: 0.03,
    resolution: 150, particles: 500, playback: 20, trees: true,
    visualStyle: 'ribbons', palette: 'classic', colorMaxMps: 20, facadeGlow: true });
  // Shared by the heatmap, flow marks and dashboard. Stops use normalized speed.
  const PALETTES = Object.freeze({
    classic: [[59,130,246], [45,212,191], [163,230,53], [251,191,36], [239,68,68]],
    ocean: [[37,99,235], [34,211,238], [255,255,255]],
    ember: [[126,34,206], [249,115,22], [254,249,195]],
    monochrome: [[112,112,112], [255,255,255]]
  });
  const COLOR_RANGES = Object.freeze([5, 10, 20, 40]);
  function speedColor(speed, palette = 'classic', maximum = 20) {
    const stops = PALETTES[palette] || PALETTES.classic;
    const fraction = Math.max(0, Math.min(1, (Number.isFinite(speed) ? speed : 0) / maximum));
    const position = fraction * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(position));
    return stops[k].map((v, c) => Math.round(v + (position - k) * (stops[k + 1][c] - v)));
  }
  function colorLegend(palette = 'classic', maximum = 20) {
    const stops = PALETTES[palette] || PALETTES.classic;
    return { gradient: `linear-gradient(to right, ${stops.map((_, i) =>
      `rgb(${speedColor(i * maximum / (stops.length - 1), palette, maximum).join(',')}) ${i * 100 / (stops.length - 1)}%`).join(', ')})`,
      labels: ['0 m/s', `${maximum / 2} m/s`, `${maximum}+ m/s`] };
  }
  const colorGradient = (palette, maximum) => colorLegend(palette, maximum).gradient;
  function windVector(angle) {
    const a = angle * Math.PI / 180;
    return { x: Math.abs(Math.cos(a)) < 1e-10 ? 0 : Math.cos(a),
      y: Math.abs(Math.sin(a)) < 1e-10 ? 0 : Math.sin(a) };
  }
  function domain(width, height, resolution, angle) {
    const cellSize = Math.max(width, height) / resolution;
    const vw = Math.max(2, Math.ceil(width / cellSize));
    const vh = Math.max(2, Math.ceil(height / cellSize));
    const v = windVector(angle), ax = Math.abs(v.x), ay = Math.abs(v.y);
    const along = ax * vw + ay * vh, cross = ay * vw + ax * vh;
    const left = Math.ceil((v.x >= 0 ? .5 : .75) * along * ax + .3 * cross * ay);
    const right = Math.ceil((v.x >= 0 ? .75 : .5) * along * ax + .3 * cross * ay);
    const top = Math.ceil((v.y >= 0 ? .5 : .75) * along * ay + .3 * cross * ax);
    const bottom = Math.ceil((v.y >= 0 ? .75 : .5) * along * ay + .3 * cross * ax);
    return { nx: vw + left + right, ny: vh + top + bottom, x0: left, y0: top,
      vw, vh, cellSize, along, farFieldCollar: 8 };
  }
  function equilibrium(k, r, u, v) {
    const cu = EX[k] * u + EY[k] * v;
    return W[k] * r * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * (u * u + v * v));
  }
  class Solver {
    constructor(options) {
      Object.assign(this, options);
      this.size = this.nx * this.ny;
      this.windSpeed = options.windSpeed ?? 5;
      this.latticeSpeed = Math.min(this.windSpeed * .005, .05);
      this.viscosity = options.viscosity ?? .03;
      if (!(this.nx >= 3 && this.ny >= 3 && this.viscosity >= .02 && this.viscosity <= .15 &&
          this.windSpeed > 0 && this.windSpeed <= 20)) throw new Error('Invalid CFD configuration');
      this.wind = windVector(options.angle || 0);
      this.solid = options.solid || new Uint8Array(this.size);
      // Leave headroom for the 2–3x corner/gap acceleration in coarse urban
      // masks. This changes lattice units, not the requested inlet m/s.
      if (this.solid.some(Boolean)) this.latticeSpeed = Math.min(this.latticeSpeed, .025);
      this.canopy = options.canopy || new Float32Array(this.size);
      this.trees = options.trees !== false;
      this.boundary = options.boundary || 'open';
      this.force = options.force || [0, 0]; // Constant acceleration, used for channel verification.
      this.f = new Float32Array(this.size * 9);
      this.post = new Float32Array(this.f.length);
      this.next = new Float32Array(this.f.length);
      this.ux = new Float32Array(this.size);
      this.uy = new Float32Array(this.size);
      this.rho = new Float32Array(this.size);
      this.sponge = new Float32Array(this.size);
      if (this.boundary === 'open' && options.vw && options.vh) {
        for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) {
          // Absorb outgoing acoustic disturbances only in off-screen padding.
          // The visible model and an eight-cell margin retain the unforced TRT equations.
          const left = (this.x0 - 8 - x) / Math.max(1, this.x0 - 8);
          const right = (x - this.x0 - this.vw - 8) / Math.max(1, this.nx - this.x0 - this.vw - 9);
          const top = (this.y0 - 8 - y) / Math.max(1, this.y0 - 8);
          const bottom = (y - this.y0 - this.vh - 8) / Math.max(1, this.ny - this.y0 - this.vh - 9);
          const distance = Math.max(0, Math.min(1, Math.max(left, right, top, bottom)));
          this.sponge[y * this.nx + x] = .2 * distance * distance;
        }
      }
      // Starting uniform wind inside a dense, concave street network creates
      // a nonphysical pressure impulse. Ramp obstacle cases from rest instead.
      this.rampSteps = this.boundary === 'open' && this.solid.some(Boolean) ? 400 : 0;
      this.steps = 0;
      this.convergedChecks = 0;
      this.reference = null;
      this.minWarmup = this.rampSteps + Math.ceil((options.along || this.nx) / this.latticeSpeed);
      for (let n = 0; n < this.size; n++) {
        const u = this.solid[n] || this.boundary === 'channel' || this.rampSteps ? 0 : this.wind.x * this.latticeSpeed;
        const v = this.solid[n] || this.boundary === 'channel' || this.rampSteps ? 0 : this.wind.y * this.latticeSpeed;
        for (let k = 0; k < 9; k++) this.f[n * 9 + k] = equilibrium(k, 1, u, v);
      }
      this.measure();
    }
    realSpeed(speed) { return speed * this.windSpeed / this.latticeSpeed; }
    boundaryType(x, y) {
      const v = this.wind;
      if ((x === 0 && v.x > 0) || (x === this.nx - 1 && v.x < 0) ||
          (y === 0 && v.y > 0) || (y === this.ny - 1 && v.y < 0)) return 'inlet';
      if ((x === 0 && v.x < 0) || (x === this.nx - 1 && v.x > 0) ||
          (y === 0 && v.y < 0) || (y === this.ny - 1 && v.y > 0)) return 'outlet';
      return 'side';
    }
    step() {
      const { nx, ny, size, f, post, next, solid, ux, uy, rho } = this;
      const plus = 1 / (.5 + 3 * this.viscosity);
      const minus = 1 / (.5 + .25 / (1 / plus - .5));
      const inletSpeed = this.latticeSpeed * (this.rampSteps ? .5 - .5 * Math.cos(Math.PI * Math.min(1, (this.steps + 1) / this.rampSteps)) : 1);
      // Collision reads only a complete macroscopic snapshot. Exact-difference
      // forcing changes population momentum by rho * du (no velocity-only drag).
      for (let n = 0; n < size; n++) {
        if (solid[n]) continue;
        const u = ux[n], v = uy[n], r = rho[n], base = n * 9;
        const coverage = this.trees ? this.canopy[n] : 0;
        const retention = coverage > 0 ? Math.exp(-.5108256238 * coverage *
          Math.sqrt(u * u + v * v) * (this.cellSize || 1) / (this.dragReferenceCellSize || this.cellSize || 1)) : 1;
        const du = u * (retention - 1) + this.force[0];
        const dv = v * (retention - 1) + this.force[1];
        const u2 = u * u + v * v, newU2 = (u + du) ** 2 + (v + dv) ** 2;
        for (let k = 0; k < 9; k++) {
          const cu = EX[k] * u + EY[k] * v, wr = W[k] * r;
          const eqPlus = wr * (1 + 4.5 * cu * cu - 1.5 * u2), eqMinus = wr * 3 * cu;
          const fk = f[base + k], fo = f[base + OPP[k]];
          let value = fk - plus * (.5 * (fk + fo) - eqPlus) - minus * (.5 * (fk - fo) - eqMinus);
          if (du || dv) {
            const newCu = cu + EX[k] * du + EY[k] * dv;
            value += wr * (3 * (newCu - cu) + 4.5 * (newCu * newCu - cu * cu) - 1.5 * (newU2 - u2));
          }
          const absorb = this.sponge[n];
          post[base + k] = absorb ? value * (1 - absorb) + absorb * equilibrium(k, 1, this.wind.x * inletSpeed, this.wind.y * inletSpeed) : value;
        }
      }
      // Pull streaming, reflecting links at the halfway fluid/solid boundary.
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const n = y * nx + x, base = n * 9;
        if (solid[n]) continue;
        for (let k = 0; k < 9; k++) {
          let sx = x - EX[k], sy = y - EY[k];
          if (this.boundary === 'periodic' || this.boundary === 'channel') sx = (sx + nx) % nx;
          if (this.boundary === 'periodic') sy = (sy + ny) % ny;
          const outside = sx < 0 || sx >= nx || sy < 0 || sy >= ny;
          if (outside) next[base + k] = this.boundary === 'open' ? 0 : post[base + OPP[k]];
          else next[base + k] = solid[sy * nx + sx] ? post[base + OPP[k]] : post[(sy * nx + sx) * 9 + k];
        }
      }
      if (this.boundary === 'open') {
        // All source cells are interior cells from this step, never partially
        // updated boundary macros. Corners move inward on both axes.
        for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
          if (x && y && x < nx - 1 && y < ny - 1) continue;
          const n = y * nx + x;
          if (solid[n]) continue;
          const sx = Math.max(1, Math.min(nx - 2, x)), sy = Math.max(1, Math.min(ny - 2, y));
          const source = sy * nx + sx;
          if (this.boundaryType(x, y) === 'side' && !solid[source]) {
            // Open parallel boundaries allow lateral deflection to leave the
            // padded domain; they are not reflecting channel walls.
            for (let k = 0; k < 9; k++) next[n * 9 + k] = next[source * 9 + k];
            continue;
          }
          let r = 0, u = 0, v = 0;
          for (let k = 0; k < 9; k++) {
            const value = next[source * 9 + k]; r += value; u += EX[k] * value; v += EY[k] * value;
          }
          if (solid[source]) { r = 1; u = this.wind.x * inletSpeed; v = this.wind.y * inletSpeed; }
          else { u /= r; v /= r; }
          const type = this.boundaryType(x, y);
          const targetR = type === 'outlet' ? 1 : r;
          const targetU = type === 'inlet' ? this.wind.x * inletSpeed : u;
          const targetV = type === 'inlet' ? this.wind.y * inletSpeed : v;
          // Non-equilibrium extrapolation: prescribed inlet velocity, fixed
          // outlet density, with open parallel far-field sides. Fixing both
          // inlet density and velocity while copying the outlet caused drift.
          for (let k = 0; k < 9; k++) next[n * 9 + k] = equilibrium(k, targetR, targetU, targetV)
            + (solid[source] ? 0 : next[source * 9 + k] - equilibrium(k, r, u, v));
        }
      }
      this.f = next; this.next = f;
      this.steps++;
      this.measure();
    }
    measure() {
      let mass = 0, minDensity = Infinity, maxDensity = 0, peakSpeed = 0, invalidPopulations = 0;
      for (let n = 0; n < this.size; n++) {
        if (this.solid[n]) { this.ux[n] = this.uy[n] = 0; this.rho[n] = 1; continue; }
        let r = 0, mx = 0, my = 0;
        for (let k = 0; k < 9; k++) {
          const val = this.f[n * 9 + k];
          if (!Number.isFinite(val) || val < 0) invalidPopulations++;
          r += val; mx += EX[k] * val; my += EY[k] * val;
        }
        this.rho[n] = r; this.ux[n] = mx / r; this.uy[n] = my / r;
        mass += r; minDensity = Math.min(minDensity, r); maxDensity = Math.max(maxDensity, r);
        peakSpeed = Math.max(peakSpeed, Math.sqrt(mx * mx + my * my) / r);
      }
      this.diagnostics = { mass, minDensity, maxDensity, peakSpeed, invalidPopulations };
      if (invalidPopulations || !Number.isFinite(mass + peakSpeed) || minDensity < .8 || maxDensity > 1.2 || peakSpeed > .15) {
        throw new Error(`CFD numerical limit at step ${this.steps}: density ${minDensity.toFixed(3)}–${maxDensity.toFixed(3)}, peak ${peakSpeed.toFixed(3)}, invalid populations ${invalidPopulations}`);
      }
    }
    snapshot() {
      let change = Infinity;
      if (!this.reference || this.steps - this.reference.step >= 100) {
        if (this.reference) {
          let sum = 0, count = 0;
          for (let n = 0; n < this.size; n++) if (!this.solid[n]) {
            sum += (this.ux[n] - this.reference.x[n]) ** 2 + (this.uy[n] - this.reference.y[n]) ** 2; count++;
          }
          change = Math.sqrt(sum / Math.max(1, count)) / this.latticeSpeed;
          this.convergedChecks = change < .001 ? this.convergedChecks + 1 : 0;
        }
        this.reference = { step: this.steps, x: this.ux.slice(), y: this.uy.slice(), change };
      }
      return { ux: this.ux.slice(), uy: this.uy.slice(), steps: this.steps,
        developing: this.steps < this.minWarmup || this.convergedChecks < 5,
        progress: Math.min(1, this.steps / this.minWarmup), change: this.reference.change,
        diagnostics: this.diagnostics, latticeSpeed: this.latticeSpeed, timestamp: Date.now() };
    }
  }
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const p = ring[a], q = ring[b];
      if ((p[1] > y) !== (q[1] > y) && x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + p[0]) inside = !inside;
    }
    return inside;
  }
  function rasterizeBuildings(features, project, grid) {
    const mask = new Uint8Array(grid.nx * grid.ny);
    for (const feature of features) {
      const g = feature.geometry;
      const polygons = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
      for (const polygon of polygons) {
        const rings = polygon.map(r => r.map(c => {
          const p = project(c); return [p.x / grid.cellSize + grid.x0, p.y / grid.cellSize + grid.y0];
        }));
        if (!rings[0]?.length) continue;
        const xs = rings[0].map(p => p[0]), ys = rings[0].map(p => p[1]);
        // Simulate the displayed model and the complete footprints that
        // intersect it. Off-table city blocks must not turn the wind buffers
        // into narrow artificial channels. Preserve every visible part/hole.
        const collar = grid.farFieldCollar || 0;
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const visible = grid.vw === undefined || (maxX > grid.x0 && minX < grid.x0 + grid.vw && maxY > grid.y0 && minY < grid.y0 + grid.vh);
        if (!visible) continue;
        const x0 = Math.max(collar, Math.floor(minX)), x1 = Math.min(grid.nx - collar, Math.ceil(maxX));
        const y0 = Math.max(collar, Math.floor(minY)), y1 = Math.min(grid.ny - collar, Math.ceil(maxY));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          if (pointInRing(x + .5, y + .5, rings[0]) && !rings.slice(1).some(r => pointInRing(x + .5, y + .5, r))) mask[y * grid.nx + x] = 1;
        }
      }
    }
    return mask;
  }
  function rasterizeTrees(features, project, radiusPixels, grid) {
    const canopy = new Float32Array(grid.nx * grid.ny);
    features.forEach((f, index) => {
      if (f.geometry?.type !== 'Point') return;
      const seed = Math.sin(index) * 10000;
      const radius = Math.max(1, 2 + .3 * (Number(f.properties?.height) || 10) + ((seed - Math.floor(seed)) * 2 - 1) * 1.5);
      const p = project(f.geometry.coordinates), cx = p.x / grid.cellSize + grid.x0, cy = p.y / grid.cellSize + grid.y0;
      const r = radiusPixels(f.geometry.coordinates, radius) / grid.cellSize;
      if (grid.vw !== undefined && (cx + r <= grid.x0 || cx - r >= grid.x0 + grid.vw ||
          cy + r <= grid.y0 || cy - r >= grid.y0 + grid.vh)) return;
      for (let y = Math.max(0, Math.floor(cy - r - .5)); y < Math.min(grid.ny, Math.ceil(cy + r + .5)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r - .5)); x < Math.min(grid.nx, Math.ceil(cx + r + .5)); x++) {
          // Supersampled area fraction preserves subcell trees and fractional centers.
          let hits = 0;
          for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
            if (Math.hypot(x + (a + .5) / 4 - cx, y + (b + .5) / 4 - cy) < r) hits++;
          }
          const n = y * grid.nx + x;
          canopy[n] = 1 - (1 - canopy[n]) * (1 - hits / 16);
        }
      }
    });
    const collar = grid.farFieldCollar || 0;
    for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
      if (x < collar || y < collar || x >= grid.nx - collar || y >= grid.ny - collar) canopy[y * grid.nx + x] = 0;
    }
    return canopy;
  }
  function sample(field, x, y) {
    const { nx, ny, ux, uy, solid } = field;
    if (x < 0 || y < 0 || x >= nx || y >= ny || solid[Math.floor(y) * nx + Math.floor(x)]) return { x: 0, y: 0 };
    const gx = x - .5, gy = y - .5, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    let u = 0, v = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const i = Math.max(0, Math.min(nx - 1, ix + dx)), j = Math.max(0, Math.min(ny - 1, iy + dy)), n = j * nx + i;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      if (!solid[n]) { u += weight * ux[n]; v += weight * uy[n]; }
    }
    return { x: u, y: v };
  }
  function smoothField(field, target, dt) {
    // Exponential interpolation is independent of display refresh rate. Never
    // clamp the sign: sustained recirculation must remain visible.
    const blend = 1 - Math.exp(-dt / .25);
    for (let n = 0; n < field.ux.length; n++) {
      field.ux[n] += (target.ux[n] - field.ux[n]) * blend;
      field.uy[n] += (target.uy[n] - field.uy[n]) * blend;
    }
  }
  // Grid traversal checks every crossed cell, including corner-touching cells.
  function crossesSolid(field, x0, y0, x1, y1) {
    const { nx, ny, solid } = field;
    const blocked = (x, y) => x < 0 || y < 0 || x >= nx || y >= ny || !!solid[y * nx + x];
    let x = Math.floor(x0), y = Math.floor(y0);
    const endX = Math.floor(x1), endY = Math.floor(y1);
    if (blocked(x, y)) return true;
    const dx = x1 - x0, dy = y1 - y0, sx = Math.sign(dx), sy = Math.sign(dy);
    const stepX = dx ? Math.abs(1 / dx) : Infinity, stepY = dy ? Math.abs(1 / dy) : Infinity;
    let tx = dx ? (sx > 0 ? x + 1 - x0 : x0 - x) * stepX : Infinity;
    let ty = dy ? (sy > 0 ? y + 1 - y0 : y0 - y) * stepY : Infinity;
    while (x !== endX || y !== endY) {
      if (Math.abs(tx - ty) < 1e-12) {
        if (blocked(x + sx, y) || blocked(x, y + sy)) return true;
        x += sx; y += sy; tx += stepX; ty += stepY;
      } else if (tx < ty) { x += sx; tx += stepX; }
      else { y += sy; ty += stepY; }
      if (blocked(x, y)) return true;
    }
    return false;
  }
  function advect(field, p, dt, rate) {
    let remaining = dt;
    while (remaining > 1e-9) {
      const a = sample(field, p.x, p.y);
      const h = Math.min(remaining, 1 / 120, .35 / Math.max(1e-9, Math.hypot(a.x, a.y) * rate));
      const mx = p.x + a.x * rate * h / 2, my = p.y + a.y * rate * h / 2;
      if (crossesSolid(field, p.x, p.y, mx, my)) return false;
      const b = sample(field, mx, my);
      const x = p.x + b.x * rate * h, y = p.y + b.y * rate * h;
      if (crossesSolid(field, p.x, p.y, x, y)) return false;
      p.x = x; p.y = y; remaining -= h;
    }
    return true;
  }
  class Tracers {
    constructor(field, count, random = Math.random) {
      this.field = field; this.random = random; this.time = 0;
      this.particles = Array.from({ length: count }, () => ({ trail: [] }));
      this.particles.forEach(p => this.spawn(p, true));
    }
    spawn(p, initial = false) {
      const g = this.field, v = windVector(g.angle), r = this.random;
      p.trail = []; p.age = 0; p.stalled = 0; p.active = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (initial) { p.x = g.x0 + r() * g.vw; p.y = g.y0 + r() * g.vh; }
        else if (r() * (Math.abs(v.x) * g.vh + Math.abs(v.y) * g.vw) < Math.abs(v.x) * g.vh) {
          p.x = v.x >= 0 ? g.x0 + .05 : g.x0 + g.vw - .05; p.y = g.y0 + r() * g.vh;
        } else {
          p.x = g.x0 + r() * g.vw; p.y = v.y >= 0 ? g.y0 + .05 : g.y0 + g.vh - .05;
        }
        if (!crossesSolid(g, p.x, p.y, p.x, p.y)) { p.active = true; break; }
      }
    }
    update(dt, playback) {
      this.time += dt;
      const g = this.field;
      // Playback is visual only; scaling by m/s keeps 10–20 m/s distinct despite the lattice cap.
      const rate = playback * 60 * (g.windSpeed * .005 / g.latticeSpeed) * ((g.resolution || 150) / 150);
      for (const p of this.particles) {
        if (!p.active) { this.spawn(p, true); continue; }
        const oldX = p.x, oldY = p.y;
        if (!advect(g, p, dt, rate) || p.x < g.x0 || p.x >= g.x0 + g.vw || p.y < g.y0 || p.y >= g.y0 + g.vh) {
          this.spawn(p); continue;
        }
        p.age += dt;
        p.stalled = Math.hypot(p.x - oldX, p.y - oldY) < g.latticeSpeed * rate * dt * .05 ? p.stalled + dt : 0;
        if (p.stalled > 2 || p.age > 30) { this.spawn(p); continue; }
        // A curved integration path may be safe while its rendered endpoint
        // chord clips a corner. Never draw that chord across a building.
        if (crossesSolid(g, oldX, oldY, p.x, p.y)) p.trail = [];
        p.trail.push({ x: p.x, y: p.y, t: this.time });
        while (p.trail.length && p.trail[0].t < this.time - .8) p.trail.shift();
      }
    }
  }
  return { DEFAULTS, PALETTES, COLOR_RANGES, colorLegend, Solver, Tracers, domain, windVector, equilibrium, rasterizeBuildings,
    rasterizeTrees, sample, smoothField, crossesSolid, advect, speedColor, colorGradient };
});
