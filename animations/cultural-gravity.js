// ===== Cultural Gravity Animation =====
// Visualises cultural points of interest in the Lindholmen area
// as gravity wells that attract particle "crowds" towards them.
// Each POI has a pulsing attraction circle and streams of people
// flowing inward like iron filings drawn to magnets.

(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'cultural-gravity-canvas';
  canvas.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 850;
    pointer-events: none;
    display: none;
  `;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // ── State ─────────────────────────────────────────────────────────────
  let animationFrame = null;
  let isActive = false;
  let frameCount = 0;
  let sequenceStage = 0;      // 0: waiting reveal, 1: revealing, 2: waiting gravity, 3: ramping, 4: full
  let visibleSiteCount = 0;
  let revealFrameCounter = 0;
  let particleIntensity = 0;

  // ── Cultural Points of Interest (from KultVis Lindholmen research) ───
  const CULTURAL_SITES = [
    { name: 'Karlatornet',                   lat: 57.70993, lng: 11.93914, category: 'landmark',   weight: 1.4 },
    { name: 'Backa Teater',                  lat: 57.70591, lng: 11.93595, category: 'theatre',    weight: 1.2 },
    { name: 'Lindholmens Manor',             lat: 57.70822, lng: 11.93213, category: 'heritage',   weight: 1.0 },
    { name: 'Kuggen (Chalmers)',             lat: 57.70671, lng: 11.93882, category: 'education',  weight: 1.1 },
    { name: 'Gothenburg Film Studios',       lat: 57.70952, lng: 11.93289, category: 'studio',     weight: 1.3 },
    { name: 'Skatberget',                    lat: 57.70339, lng: 11.93264, category: 'nature',     weight: 0.8 },
    { name: 'Dry Dock',                      lat: 57.70390, lng: 11.93124, category: 'heritage',   weight: 0.9 },
    { name: 'Aftonstjärnan',                 lat: 57.70702, lng: 11.93274, category: 'community',  weight: 0.9 },
    { name: 'The Dome (temporary)',          lat: 57.70697, lng: 11.93802, category: 'art',        weight: 0.7 },
    { name: 'Propellerområdet',              lat: 57.70988, lng: 11.93328, category: 'heritage',   weight: 0.8 },
    { name: 'Lundby Mekaniska Verkstad',     lat: 57.70918, lng: 11.93659, category: 'heritage',   weight: 0.7 },
    { name: 'Adolfs Hill',                   lat: 57.70875, lng: 11.93169, category: 'nature',     weight: 0.7 },
  ];

  // ── Category colours ──────────────────────────────────────────────────
  const CATEGORY_COLORS = {
    landmark:  { r: 255, g:  69, b:  58 },  // red
    theatre:   { r: 175, g:  82, b: 222 },  // purple
    heritage:  { r: 255, g: 159, b:  10 },  // orange
    education: { r:  48, g: 176, b: 199 },  // teal
    studio:    { r: 255, g:  55, b:  95 },  // magenta
    nature:    { r:  50, g: 215, b:  75 },  // green
    community: { r: 255, g: 214, b:  10 },  // yellow
    art:       { r:  94, g:  92, b: 230 },  // indigo
  };

  // ── Particle system ───────────────────────────────────────────────────
  const MAX_PARTICLES = 600;
  const PARTICLE_LIFETIME = 200;      // frames
  const ATTRACTION_RADIUS_M = 120;    // metres — radius of the gravity well
  const SPAWN_RADIUS_M = 180;         // metres — spawn ring radius
  const BASE_SPEED = 0.4;             // px/frame drift towards centre
  const WOBBLE = 0.6;                 // lateral wander strength
  const REVEAL_INTERVAL_FRAMES = 16;
  const PARTICLE_RAMP_SPEED = 0.012;

  let particles = [];

  // ── Helpers ───────────────────────────────────────────────────────────
  function resizeCanvas() {
    const { w, h } = window.computeOverlayPixelSize();
    canvas.width = w;
    canvas.height = h;
  }

  /** Project [lng, lat] → canvas {x, y} */
  function project(lng, lat) {
    const map = window.map;
    if (!map) return { x: 0, y: 0 };
    const pt = map.project([lng, lat]);
    const container = document.getElementById('map');
    const mr = container.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    return {
      x: pt.x - (cr.left - mr.left),
      y: pt.y - (cr.top - mr.top),
    };
  }

  /** Metres → approximate pixels at current zoom */
  function metresToPx(metres) {
    const map = window.map;
    if (!map) return metres;
    const center = map.getCenter();
    const zoom = map.getZoom();
    // At equator, 1 px ≈ 156543.03 * cos(lat) / 2^zoom  metres
    const mPerPx = (156543.03 * Math.cos(center.lat * Math.PI / 180)) / Math.pow(2, zoom);
    return metres / mPerPx;
  }

  // ── Pre-rendered glow sprite ──────────────────────────────────────────
  let glowSprite = null;
  const GLOW_SIZE = 24;

  function getVisibleSites() {
    if (visibleSiteCount <= 0) return [];
    return CULTURAL_SITES.slice(0, Math.min(visibleSiteCount, CULTURAL_SITES.length));
  }

  function createGlowSprite() {
    const s = document.createElement('canvas');
    s.width = GLOW_SIZE;
    s.height = GLOW_SIZE;
    const c = s.getContext('2d');
    const g = c.createRadialGradient(GLOW_SIZE / 2, GLOW_SIZE / 2, 0, GLOW_SIZE / 2, GLOW_SIZE / 2, GLOW_SIZE / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    glowSprite = s;
  }

  // ── Particle spawning ────────────────────────────────────────────────
  function spawnParticle() {
    const visibleSites = getVisibleSites();
    if (!visibleSites.length) return;

    // Pick a random site, weighted
    const totalWeight = visibleSites.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * totalWeight;
    let site = visibleSites[0];
    for (const s of visibleSites) {
      r -= s.weight;
      if (r <= 0) { site = s; break; }
    }

    const center = project(site.lng, site.lat);
    const spawnR = metresToPx(SPAWN_RADIUS_M);

    // Spawn on a ring around the POI
    const angle = Math.random() * Math.PI * 2;
    // Vary the spawn distance a bit so they don't all start on a perfect ring
    const dist = spawnR * (0.7 + Math.random() * 0.6);

    const col = CATEGORY_COLORS[site.category] || { r: 200, g: 200, b: 200 };

    particles.push({
      x: center.x + Math.cos(angle) * dist,
      y: center.y + Math.sin(angle) * dist,
      targetX: center.x,
      targetY: center.y,
      vx: 0,
      vy: 0,
      age: 0,
      lifetime: PARTICLE_LIFETIME + Math.floor(Math.random() * 80),
      color: col,
      size: 1.5 + Math.random() * 1.5,
      site: site,
    });
  }

  // ── Update & draw ────────────────────────────────────────────────────
  function update() {
    if (sequenceStage === 1) {
      revealFrameCounter++;
      if (revealFrameCounter >= REVEAL_INTERVAL_FRAMES) {
        revealFrameCounter = 0;
        visibleSiteCount = Math.min(visibleSiteCount + 1, CULTURAL_SITES.length);
        if (visibleSiteCount >= CULTURAL_SITES.length) {
          sequenceStage = 2;
          console.log('Cultural Gravity: all locations revealed. Press Right Arrow to start gravity flow.');
        }
      }
    }

    if (sequenceStage >= 3) {
      particleIntensity = Math.min(1, particleIntensity + PARTICLE_RAMP_SPEED);
      if (particleIntensity >= 1 && sequenceStage === 3) {
        sequenceStage = 4;
      }
    }

    // Spawn new particles
    const maxParticlesNow = Math.max(0, Math.floor(MAX_PARTICLES * particleIntensity));
    const spawnRate = Math.max(0, Math.ceil(12 * particleIntensity));
    for (let i = 0; i < spawnRate && particles.length < maxParticlesNow; i++) {
      spawnParticle();
    }

    const deadIndices = [];

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.age++;

      // Vector towards target
      let dx = p.targetX - p.x;
      let dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 1) {
        dx /= dist;
        dy /= dist;
      }

      // Gravity: acceleration increases as particle gets closer (inverse-linear, capped)
      const attractionPx = metresToPx(ATTRACTION_RADIUS_M);
      const gravity = BASE_SPEED * (1 + Math.max(0, (attractionPx - dist) / attractionPx) * 2);

      // Lateral wobble (perpendicular to direction)
      const wobbleAngle = Math.sin(p.age * 0.15 + i) * WOBBLE;

      p.vx = p.vx * 0.85 + (dx * gravity + (-dy) * wobbleAngle) * 0.15;
      p.vy = p.vy * 0.85 + (dy * gravity + dx * wobbleAngle) * 0.15;

      p.x += p.vx;
      p.y += p.vy;

      // Kill if arrived at centre or expired
      if (dist < 4 || p.age > p.lifetime) {
        deadIndices.push(i);
      }
    }

    // Remove dead particles in reverse order
    for (let i = deadIndices.length - 1; i >= 0; i--) {
      particles.splice(deadIndices[i], 1);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const attractionPx = metresToPx(ATTRACTION_RADIUS_M);

    // ── Draw attraction circles ─────────────────────────────────────────
    for (const site of getVisibleSites()) {
      const center = project(site.lng, site.lat);
      const col = CATEGORY_COLORS[site.category] || { r: 200, g: 200, b: 200 };

      // Pulsing radius
      const pulse = 1 + 0.08 * Math.sin(frameCount * 0.03 + site.lat * 1000);
      const r = attractionPx * site.weight * pulse;

      // Faded gradient circle
      const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
      grad.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.34)`);
      grad.addColorStop(0.6, `rgba(${col.r},${col.g},${col.b},0.13)`);
      grad.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Thin ring at edge
      ctx.strokeStyle = `rgba(${col.r},${col.g},${col.b},0.46)`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Soft central glow
      const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 26 * site.weight);
      glow.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.75)`);
      glow.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 26 * site.weight, 0, Math.PI * 2);
      ctx.fill();

      // Centre dot
      ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},1)`;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 6.5 * site.weight, 0, Math.PI * 2);
      ctx.fill();

      // Bright white inner core
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(center.x, center.y, 2.2 * site.weight, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},0.98)`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.fillText(site.name, center.x, center.y - 10 * site.weight - 8);
      ctx.shadowBlur = 0;
    }

    // ── Draw particles (crowd) ──────────────────────────────────────────
    if (!glowSprite) createGlowSprite();

    for (const p of particles) {
      const alpha = Math.min(1, (1 - p.age / p.lifetime)) * 0.95;
      const sz = p.size * GLOW_SIZE / 5.2;

      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'lighter';

      // Tint the glow sprite with particle colour
      ctx.fillStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();

      // Tiny bright core
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz * 0.42, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ── Animation loop ────────────────────────────────────────────────────
  function animate() {
    if (!isActive) return;
    frameCount++;
    update();
    draw();
    animationFrame = requestAnimationFrame(animate);
  }

  // ── Public API ────────────────────────────────────────────────────────
  function start() {
    if (isActive) return;
    isActive = true;
    canvas.style.display = 'block';
    resizeCanvas();
    particles = [];
    frameCount = 0;
    sequenceStage = 0;
    visibleSiteCount = 0;
    revealFrameCounter = 0;
    particleIntensity = 0;
    animate();
    console.log('Cultural Gravity animation started. Press Right Arrow once to reveal locations, then again to start gravity flow.');
  }

  function stop() {
    isActive = false;
    canvas.style.display = 'none';
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = [];
    sequenceStage = 0;
    visibleSiteCount = 0;
    revealFrameCounter = 0;
    particleIntensity = 0;
    console.log('Cultural Gravity animation stopped');
  }

  function toggle() {
    if (isActive) stop(); else start();
  }

  function advanceSequence() {
    if (!isActive) return;

    if (sequenceStage === 0) {
      sequenceStage = 1;
      visibleSiteCount = 0;
      revealFrameCounter = 0;
      console.log('Cultural Gravity: revealing locations one by one...');
    } else if (sequenceStage === 2) {
      sequenceStage = 3;
      console.log('Cultural Gravity: ramping up gravity animation...');
    }
  }

  // ── Resize handling ───────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (isActive) resizeCanvas();
  });

  function onArrowAdvance(event) {
    if (!isActive) return;
    if (event.key !== 'ArrowRight' || event.repeat) return;

    const t = event.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;

    const before = sequenceStage;
    advanceSequence();
    if (sequenceStage !== before) event.preventDefault();
  }

  // ── Init: wire up button ──────────────────────────────────────────────
  function init() {
    const checkMap = setInterval(() => {
      if (window.map) {
        clearInterval(checkMap);

        const btn = document.getElementById('cultural-gravity-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            toggle();
            btn.classList.toggle('active');
          });
        }

        window.addEventListener('keydown', onArrowAdvance);

        console.log('Cultural Gravity animation module loaded');
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Expose for external control ───────────────────────────────────────
  window.culturalGravityAnimation = {
    start: start,
    stop: stop,
    toggle: toggle,
    advanceSequence: advanceSequence,
    isActive: () => isActive,
  };
})();
