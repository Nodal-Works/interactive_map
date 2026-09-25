// Presentation only: all directions and speeds come from the shared smoothed field.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cfd-core.js'));
  else root.CFDVisuals = factory(root.CFD);
})(typeof self !== 'undefined' ? self : globalThis, function (C) {
  'use strict';
  const STYLES = Object.freeze({
    ribbons: 'Long flow lines with moving highlights reveal routes around buildings.',
    particles: 'Fine drifting specks with soft, short tails follow the wind. Sheltered areas move more slowly.'
  });
  const ease = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
  const bell = t => Math.abs(t) >= 1 ? 0 : (1 - t * t) ** 2;
  const mod = (n, d) => ((n % d) + d) % d;
  const speedMps = (g, v) => Math.hypot(v.x, v.y) * g.windSpeed / g.latticeSpeed;
  // Matches the existing playback control; lattice resolution cannot change screen speed.
  const motionRate = g => 20 * 60 * (g.windSpeed * .005 / g.latticeSpeed) * ((g.resolution || 150) / 150);
  const inside = (g, p) => p.x >= g.x0 + .01 && p.x < g.x0 + g.vw - .01 &&
    p.y >= g.y0 + .01 && p.y < g.y0 + g.vh - .01;
  function clearSegment(g, a, b) { return inside(g, a) && inside(g, b) && !C.crossesSolid(g, a.x, a.y, b.x, b.y); }
  function anchors(g, budget) {
    const columns = Math.max(1, Math.round(Math.sqrt(budget * g.vw / g.vh)));
    const rows = Math.max(1, Math.floor(budget / columns)), result = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const id = y * columns + x;
      const p = { x: g.x0 + (x + .5) * g.vw / columns,
        y: g.y0 + (y + .5 + .22 * Math.sin(id * 2.39996)) * g.vh / rows, id };
      if (clearSegment(g, p, p)) result.push(p);
    }
    return result;
  }
  function trace(g, seed, sign) {
    const points = [{ ...seed, travel: 0, station: 0 }], rate = motionRate(g), step = .5;
    const limit = Math.min(600, Math.ceil(Math.max(g.vw, g.vh) / step * .6));
    for (let i = 0; i < limit; i++) {
      const a = points.at(-1), v = C.sample(g, a.x, a.y), magnitude = Math.hypot(v.x, v.y);
      if (speedMps(g, v) < .08) break;
      const mid = { x: a.x + sign * step * .5 * v.x / magnitude, y: a.y + sign * step * .5 * v.y / magnitude };
      if (!clearSegment(g, a, mid)) break;
      const mv = C.sample(g, mid.x, mid.y), mm = Math.hypot(mv.x, mv.y);
      if (speedMps(g, mv) < .08) break;
      const b = { x: a.x + sign * step * mv.x / mm, y: a.y + sign * step * mv.y / mm,
        travel: a.travel + sign * step / (mm * rate), station: sign * (i + 1) };
      if (!clearSegment(g, a, b)) break;
      // Bound loops without suppressing genuine local reverse flow.
      if (i > 20 && Math.hypot(b.x - seed.x, b.y - seed.y) < step) break;
      points.push(b);
    }
    return points;
  }
  class Ribbons {
    constructor(g, budget) {
      this.field = g; this.seeds = anchors(g, Math.round(budget / 8));
      this.paths = []; this.displayPaths = []; this.lastRefresh = -Infinity; this.lastTime = null;
    }
    update(wallTime) {
      const dt = this.lastTime === null ? 0 : Math.max(0, wallTime - this.lastTime);
      this.lastTime = wallTime;
      // Trace at 5 Hz, but move the displayed geometry every animation frame.
      // Signed stations are measured from a stable seed, so varying path lengths
      // cannot shift the correspondence or restart a traveling highlight.
      if (wallTime - this.lastRefresh >= .2 - 1e-9) {
        this.lastRefresh = wallTime;
        const old = new Map(this.displayPaths.map(p => [p.id, p]));
        this.paths = this.seeds.map(seed => ({ id: seed.id,
          points: trace(this.field, seed, -1).reverse().slice(0, -1).concat(trace(this.field, seed, 1)) }));
        this.displayPaths = this.paths.map(path => {
          const previous = old.get(path.id), byStation = new Map(previous?.points.map(p => [p.station, p]) || []);
          const points = path.points.map(target => {
            const point = byStation.get(target.station);
            byStation.delete(target.station);
            return point ? { ...point, target, targetAlpha: 1 } :
              { ...target, target, alpha: previous ? 0 : 1, targetAlpha: 1 };
          });
          // Retracting ends fade instead of abruptly dropping entire segments.
          for (const point of byStation.values()) if (point.alpha > .005) points.push({ ...point, targetAlpha: 0 });
          points.sort((a, b) => a.station - b.station);
          return { id: path.id, points };
        });
      }
      const blend = 1 - Math.exp(-dt / .18);
      for (const path of this.displayPaths) for (const p of path.points) {
        p.x += (p.target.x - p.x) * blend; p.y += (p.target.y - p.y) * blend;
        p.travel += (p.target.travel - p.travel) * blend;
        p.alpha += (p.targetAlpha - p.alpha) * blend;
      }
    }
    segments(time, emit) {
      const g = this.field;
      for (const path of this.displayPaths) for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i];
        if (!clearSegment(g, a, b)) continue; // Morphs must also respect walls.
        const speed = speedMps(g, C.sample(g, b.x, b.y));
        const endFade = ease(Math.min(i, path.points.length - i) / 10);
        const alpha = Math.min(a.alpha, b.alpha) * endFade;
        emit(a, b, speed, false, alpha);
        // Broad, soft light replaces the binary on/off selection of whole cells.
        const phase = mod((a.travel + b.travel) / 2 - time + path.id * .618 + .3, 1.7) - .3;
        const light = bell(phase / .3);
        if (light > 0) emit(a, b, speed, true, alpha * light);
      }
    }
  }
  class Particles extends C.Tracers {
    constructor(g, count, random = Math.random) {
      super(g, count, random);
      // Stable variation in brightness/length adds lightness without inventing
      // turbulence, changing velocities, or making particles flash at random.
      this.particles.forEach((p, i) => {
        const variation = mod(i * .61803398875, 1);
        p.brightness = .75 + .25 * variation;
        p.tailLength = 18 + 16 * variation;
      });
    }
    update(dt) {
      super.update(dt, 20);
      // Retain only the short visible tail and one interpolation endpoint.
      for (const p of this.particles) while (p.trail.length > 2 && p.trail[1].t < this.time - .24) p.trail.shift();
    }
    segments(time, emit) {
      const g = this.field, history = .24;
      for (const p of this.particles) {
        if (!p.active || p.trail.length < 2) continue;
        const speed = speedMps(g, C.sample(g, p.x, p.y));
        if (speed < .08) continue;
        const edge = Math.min(p.x - g.x0, g.x0 + g.vw - p.x, p.y - g.y0, g.y0 + g.vh - p.y) * g.cellSize;
        const visibility = p.brightness * ease(p.age / .22) * ease(edge / 10) * ease(speed / .3);
        let distance = 0;
        for (let i = p.trail.length - 1; i > 0; i--) {
          const start = p.trail[i - 1], b = p.trail[i];
          const length = Math.hypot(b.x - start.x, b.y - start.y) * g.cellSize;
          if (this.time - b.t >= history || distance >= p.tailLength) break;
          if (length < 1e-8) continue;
          // Interpolate the tail cutoff and tip in screen space so neither
          // jumps by a whole frame's displacement, even at high wind speeds.
          const fraction = Math.max(0, Math.min(1, (p.tailLength - distance) / length,
            (b.t - (this.time - history)) / Math.max(1e-9, b.t - start.t)));
          const a = { x: b.x + (start.x - b.x) * fraction, y: b.y + (start.y - b.y) * fraction };
          if (!clearSegment(g, a, b)) break;
          const midpoint = distance + length * fraction / 2;
          const freshness = 1 - (this.time - (b.t + (start.t - b.t) * fraction / 2)) / history;
          const alpha = visibility * Math.max(0, freshness) * (1 - midpoint / p.tailLength) ** 1.5;
          emit(a, b, speed, false, alpha);
          // A small, soft white tip rather than a glowing blob or long dash.
          if (distance < 2) {
            const tipFraction = Math.min(fraction, (2 - distance) / length);
            const tip = { x: b.x + (start.x - b.x) * tipFraction, y: b.y + (start.y - b.y) * tipFraction };
            emit(tip, b, speed, true, visibility * (1 - distance / 2));
          }
          distance += length;
        }
      }
    }
  }
  // Original vector edges keep the glow aligned with the displayed footprints,
  // rather than exposing the stair steps of the solver mask.
  function facadeEdges(features, project, g) {
    const edges = [], width = g.vw * g.cellSize, height = g.vh * g.cellSize;
    for (const feature of features) {
      const geometry = feature.geometry;
      const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
      for (const polygon of polygons) for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
        const ring = polygon[ringIndex].map(project);
        let area = 0;
        for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a.x * b.y - b.x * a.y; }
        if (Math.abs(area) < 1e-8) continue;
        const orientation = Math.sign(area) * (ringIndex === 0 ? 1 : -1);
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
          if (length < 1e-6) continue;
          let lo = 0, hi = 1;
          for (const [start, delta, maximum] of [[a.x, dx, width], [a.y, dy, height]]) {
            if (Math.abs(delta) < 1e-10) { if (start < 0 || start > maximum) hi = -1; }
            else { const t0 = -start / delta, t1 = (maximum - start) / delta; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
          }
          if (hi <= lo) continue;
          const count = Math.ceil(length * (hi - lo) / 8), nx = orientation * dy / length, ny = -orientation * dx / length;
          const point = t => ({ x: g.x0 + (a.x + dx * t) / g.cellSize, y: g.y0 + (a.y + dy * t) / g.cellSize });
          for (let j = 0; j < count; j++) edges.push({
            a: point(lo + (hi - lo) * j / count), b: point(lo + (hi - lo) * (j + 1) / count), nx, ny
          });
        }
      }
    }
    return edges;
  }
  class FacadeGlow {
    constructor(g, edges = []) {
      this.field = g; this.buckets = Array.from({ length: 16 }, () => []);
      const solidAt = (x, y) => x >= 0 && y >= 0 && x < g.nx && y < g.ny && !!g.solid[Math.floor(y) * g.nx + Math.floor(x)];
      // Fixed screen-space standoff gives comparable exposure at every grid
      // resolution. Probe only the connected fluid on this face's outside.
      const reach = Math.max(12, Math.min(32, Math.max(g.vw, g.vh) * g.cellSize * .02)) / g.cellSize;
      this.edges = edges.map(edge => {
        const x = (edge.a.x + edge.b.x) / 2, y = (edge.a.y + edge.b.y) / 2;
        const probes = [];
        if ([.25, .75, 1.25].some(d => solidAt(x - edge.nx * d, y - edge.ny * d))) {
          let fluid = false, last = null;
          for (let d = .5; d <= Math.max(1.5, reach * 1.5); d += .5) {
            const p = { x: x + edge.nx * d, y: y + edge.ny * d };
            if (p.x < 0 || p.y < 0 || p.x >= g.nx || p.y >= g.ny) break;
            if (solidAt(p.x, p.y)) { if (fluid || d >= 1) break; continue; }
            // Don't sample through another building across a narrow opening.
            if (last && C.crossesSolid(g, last.x, last.y, p.x, p.y)) break;
            fluid = true; last = p; probes.push(p);
          }
        }
        return { ...edge, probes, impact: 0, intensity: 0 };
      }).filter(edge => edge.probes.length);
    }
    update(dt) {
      const g = this.field;
      for (const edge of this.edges) {
        let incoming = 0;
        for (const point of edge.probes) {
          const v = C.sample(g, point.x, point.y);
          incoming = Math.max(incoming, -(v.x * edge.nx + v.y * edge.ny) * g.windSpeed / g.latticeSpeed);
        }
        // Qualitative normal-incidence energy proxy, NOT surface pressure/Cp.
        // Fixed exposure preserves increased impact when inlet speed increases.
        edge.impact = incoming * incoming;
        const target = 1 - Math.exp(-edge.impact / 9);
        // Build gradually (~3.5s to 95% displayed brightness). Keep the faster
        // release so a face stops glowing when the wind no longer hits it.
        const blend = 1 - Math.exp(-dt / (target > edge.intensity ? 1.5 : .3));
        edge.intensity += (target - edge.intensity) * blend;
      }
    }
    draw(ctx, palette) {
      const g = this.field;
      for (const bucket of this.buckets) bucket.length = 0;
      for (const edge of this.edges) {
        if (edge.intensity < .01) continue;
        // Lift weaker visible impact without lighting zero-impact faces.
        const brightness = Math.sqrt(edge.intensity);
        const bucket = this.buckets[Math.min(15, Math.floor(brightness * 16))];
        bucket.push((edge.a.x - g.x0) * g.cellSize, (edge.a.y - g.y0) * g.cellSize,
          (edge.b.x - g.x0) * g.cellSize, (edge.b.y - g.y0) * g.cellSize);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Three nested strokes give a soft halo without per-edge blur filters.
      const layers = palette === 'monochrome' ? [[16,.28,'230,230,230'],[7,.6,'245,245,245'],[2,1,'255,255,255']] :
        [[16,.28,'255,159,67'],[7,.6,'255,194,105'],[2,1,'255,245,219']];
      // Reuse identical geometry for all three halo strokes; colours and widths stay unchanged.
      const paths=typeof Path2D==='undefined'?null:this.buckets.map(bucket=>{
        if(!bucket.length)return null;const path=new Path2D();let lastX,lastY;
        for(let j=0;j<bucket.length;j+=4){if(bucket[j]!==lastX || bucket[j+1]!==lastY)path.moveTo(bucket[j],bucket[j+1]);path.lineTo(bucket[j+2],bucket[j+3]);lastX=bucket[j+2];lastY=bucket[j+3];}return path;
      });
      for (const [width, opacity, color] of layers) for (let i = 0; i < this.buckets.length; i++) {
        const bucket = this.buckets[i]; if (!bucket.length) continue;
        ctx.lineWidth = width * (globalThis.mrTableScale?.() ?? 1); ctx.strokeStyle = `rgba(${color},${opacity * (i + .5) / 16})`;
        if(paths){ctx.stroke(paths[i]);continue;}
        ctx.beginPath();
        let lastX, lastY;
        for (let j = 0; j < bucket.length; j += 4) {
          if (bucket[j] !== lastX || bucket[j + 1] !== lastY) ctx.moveTo(bucket[j], bucket[j + 1]);
          ctx.lineTo(bucket[j + 2], bucket[j + 3]); lastX = bucket[j + 2]; lastY = bucket[j + 3];
        }
        ctx.stroke();
      }
    }
  }
  class Renderer {
    constructor(field, settings) {
      this.field = field; this.settings = { ...C.DEFAULTS, ...settings }; this.time = 0; this.wallTime = 0;
      this.models = new Map();
      this.facades = new FacadeGlow(field, field.facadeEdges);
      this.buckets = Array.from({ length: 288 }, () => []); this.colors = [];
      this.configure(this.settings);
    }
    configure(settings) {
      const densityChanged = settings.particles !== undefined && settings.particles !== this.settings.particles;
      if (densityChanged) this.models.clear();
      Object.assign(this.settings, settings);
      if (!Object.hasOwn(STYLES, this.settings.visualStyle)) this.settings.visualStyle = 'ribbons';
      this.colors = Array.from({ length: 32 }, (_, i) => C.speedColor(i * this.settings.colorMaxMps / 31, this.settings.palette, this.settings.colorMaxMps));
      const style = this.settings.visualStyle;
      if (!this.models.has(style)) this.models.set(style, style === 'particles' ?
        new Particles(this.field, this.settings.particles) : new Ribbons(this.field, this.settings.particles));
      this.model = this.models.get(style);
    }
    update(dt) {
      this.facades.update(dt);
      this.wallTime += dt; const elapsed = dt * this.settings.playback / 20; this.time += elapsed;
      if (this.settings.visualStyle === 'particles') this.model.update(elapsed);
      else this.model.update(this.wallTime);
    }
    drawFacades(ctx) {
      if (this.settings.facadeGlow) this.facades.draw(ctx, this.settings.palette);
    }
    draw(ctx) {
      const g = this.field;
      const particles = this.settings.visualStyle === 'particles';
      for (const bucket of this.buckets) bucket.length = 0;
      this.model.segments(this.time, (a, b, speed, highlight, alpha = 1) => {
        if (alpha <= .015) return;
        const color = Math.max(0, Math.min(31, Math.round(speed / this.settings.colorMaxMps * 31)));
        const bin = highlight ? 256 + Math.min(31, Math.floor(alpha * 32)) :
          Math.min(7, Math.floor(alpha * 8)) * 32 + color;
        this.buckets[bin].push((a.x - g.x0) * g.cellSize, (a.y - g.y0) * g.cellSize,
          (b.x - g.x0) * g.cellSize, (b.y - g.y0) * g.cellSize);
      });
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < this.buckets.length; i++) {
        const bucket = this.buckets[i]; if (!bucket.length) continue;
        const white = i >= 256, alpha = white ? (i - 256 + .5) / 32 : (Math.floor(i / 32) + .5) / 8;
        ctx.strokeStyle = white ? `rgba(255,255,255,${alpha * (particles ? 1 : .88)})` :
          `rgba(${this.colors[i % 32].join(',')},${alpha * (particles ? .9 : .48)})`;
        ctx.lineWidth = (particles ? (white ? .75 + alpha * .8 : .85) :
          (white ? .8 + alpha * 1.25 : 1.1)) * (globalThis.mrTableScale?.() ?? 1);
        ctx.beginPath();
        let lastX, lastY;
        for (let j = 0; j < bucket.length; j += 4) {
          // Join adjacent segments instead of putting a round cap on every cell.
          if (bucket[j] !== lastX || bucket[j + 1] !== lastY) ctx.moveTo(bucket[j], bucket[j + 1]);
          ctx.lineTo(bucket[j + 2], bucket[j + 3]); lastX = bucket[j + 2]; lastY = bucket[j + 3];
        }
        ctx.stroke();
      }
    }
  }
  return { facadeEdges, FacadeGlow, STYLES, Renderer, Ribbons, Particles, anchors, trace, clearSegment, motionRate, speedMps };
});
