// ===== Street Life Animation =====
// Animated pedestrians, cars, and buses following the street network
// Active by default when no other visualization is running

(function() {
  'use strict';

const streetLifeCanvas = document.createElement('canvas');
streetLifeCanvas.id = 'street-life-canvas';
streetLifeCanvas.style.cssText = `
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 845;
  pointer-events: none;
  display: none;
`;
document.body.appendChild(streetLifeCanvas);

const streetLifeCtx = streetLifeCanvas.getContext('2d');

// Animation state
let streetLifeAnimationFrame = null;
let isStreetLifeAnimating = false;
let streetLifeData = null;
let streetLifeDataLoaded = false;

// Entity collections
let vehicles = [];
let pedestrians = [];
let streetlights = []; // Static infrastructure lights
let streetPaths = []; // Full paths for navigation

// Configuration
const CONFIG = {
  maxCars: 50,
  maxBuses: 12,
  maxBicycles: 30,
  maxTaxis: 15,
  maxPedestrians: 1500,   // High density crowds
  carSpeed: 0.002,       // Progress per frame along path
  busSpeed: 0.0012,      // Buses are slower
  bicycleSpeed: 0.0015,  // Cyclists between cars and pedestrians
  pedestrianSpeed: 0.0003, // Realistic walking speed (~5km/h vs car 50km/h)
  spawnInterval: 200,    // Faster spawning for density
  
  // Streetlight Configuration (Warm Sodium Vapor look)
  streetlightColor: 'rgba(255, 210, 150, 0.12)', // Visible warm glow
  streetlightRadius: 50,   // Size of the light pool in pixels
  streetlightSpacing: 0.0008, // Moderate spacing between lights
  
  // Trail effect control
  trailFade: 0.96,       // High = long trails, Low = short trails
  
  // Visual sizes (in pixels)
  carLength: 12,
  carWidth: 6,
  busLength: 22,
  busWidth: 7,
  bicycleLength: 6,
  bicycleWidth: 3,
  pedestrianSize: 4,
  
  // Dark Mode "Data Visualization" Palette - Professional Urban Informatics
  carColors: [
    // Cyan (Data Stream) - primary accent
    { body: '#00f2ff', headlight: '#ffffff', taillight: '#ff0055' },
    // White (Clean)
    { body: '#e0e0e0', headlight: '#ffffff', taillight: '#ff0055' },
    // Deep Blue (Stealth)
    { body: '#1a2b45', headlight: '#aaddff', taillight: '#ff0055' },
    // Soft Teal
    { body: '#2d6a6a', headlight: '#aaffff', taillight: '#ff0055' },
    // Muted Purple (accent)
    { body: '#4a3a6a', headlight: '#ddccff', taillight: '#ff0055' },
  ],
  taxiColors: [
    // Gold (Public Transit Highlighting) - stands out on dark map
    { body: '#ffcc00', headlight: '#ffffff', taillight: '#ff0055', sign: '#00ff88' },
    // Electric Yellow
    { body: '#e6e600', headlight: '#ffffff', taillight: '#ff0055', sign: '#00ff88' },
  ],
  busColors: [
    // Gold (Public Transit Highlighting) - clear visibility
    { body: '#ffcc00', windows: '#1a1a2e', lights: '#ffffff' },
    // Transit Blue
    { body: '#0088cc', windows: '#1a1a2e', lights: '#ffffff' },
  ],
  bicycleColors: [
    // Subtle accent colors that pop on dark background
    { frame: '#00f2ff', rider: '#445566' },
    { frame: '#00cc88', rider: '#445566' },
    { frame: '#ff6688', rider: '#445566' },
  ],
  // Ghostly pedestrians - subtle but visible
  pedestrianColors: [
    '#334455', '#445566', '#556677', '#3a4a5a', '#4a5a6a',
    '#00aaaa', '#00aa88' // occasional cyan accent
  ]
};

// Road types suitable for vehicles vs pedestrians
const vehicleRoads = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service'];
const pedestrianPaths = ['footway', 'path', 'pedestrian', 'cycleway', 'residential', 'living_street', 'service', 'tertiary', 'secondary'];
const busRoutes = ['primary', 'secondary', 'tertiary', 'trunk'];
const cycleRoutes = ['cycleway', 'path', 'residential', 'tertiary', 'secondary', 'living_street'];

// Load street network data
function loadStreetLifeData() {
  if (streetLifeDataLoaded) return Promise.resolve();
  
  return fetch('media/street-network.geojson')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(geojson => {
      streetLifeData = geojson;
      parseStreetPaths(geojson);
      
      // Generate static streetlights along paths
      generateStreetlights();
      
      streetLifeDataLoaded = true;
      console.log(`✓ Street Life: Loaded ${streetPaths.length} paths for animation`);
    })
    .catch(err => {
      console.warn('Street Life: Could not load street network:', err);
    });
}

// Parse GeoJSON into usable paths with PRE-CALCULATED cumulative distances
// This is critical for performance - avoids Math.sqrt() every frame
function parseStreetPaths(geojson) {
  streetPaths = [];
  
  if (!geojson || !geojson.features) return;
  
  geojson.features.forEach(feature => {
    const highway = feature.properties?.highway || 'default';
    
    let coordinates = [];
    
    if (feature.geometry.type === 'LineString') {
      coordinates = feature.geometry.coordinates;
    } else if (feature.geometry.type === 'MultiLineString') {
      // Flatten multi-line strings
      feature.geometry.coordinates.forEach(line => {
        if (coordinates.length > 0) {
          coordinates.push(null);
        }
        coordinates = coordinates.concat(line);
      });
    }
    
    // Filter out null markers
    coordinates = coordinates.filter(c => c !== null);
    
    if (coordinates.length >= 2) {
      // Pre-calculate cumulative lengths (OPTIMIZATION)
      let totalLength = 0;
      const cumulativeLengths = [0];
      const segmentAngles = []; // Pre-calculate angles too!
      
      for (let i = 0; i < coordinates.length - 1; i++) {
        const dx = coordinates[i + 1][0] - coordinates[i][0];
        const dy = coordinates[i + 1][1] - coordinates[i][1];
        const segLen = Math.sqrt(dx * dx + dy * dy);
        totalLength += segLen;
        cumulativeLengths.push(totalLength);
        // Pre-calculate segment angle
        segmentAngles.push(Math.atan2(dy, dx));
      }
      
      streetPaths.push({
        coords: coordinates,
        cumulativeLengths: cumulativeLengths, // O(1) lookup!
        segmentAngles: segmentAngles,          // Pre-calculated angles!
        totalLength: totalLength,
        type: highway,
        isVehicleRoad: vehicleRoads.includes(highway),
        isPedestrianPath: pedestrianPaths.includes(highway),
        isBusRoute: busRoutes.includes(highway),
        isCycleRoute: cycleRoutes.includes(highway)
      });
    }
  });
  
  // Sort by length for better distribution
  streetPaths.sort((a, b) => b.totalLength - a.totalLength);
  
  console.log(`✓ Street Life: Pre-calculated distances for ${streetPaths.length} paths`);
}

// Project coordinates to canvas
function projectToStreetLifeCanvas(lng, lat) {
  const point = map.project([lng, lat]);
  const mapContainer = document.getElementById('map');
  const mapRect = mapContainer.getBoundingClientRect();
  const canvasRect = streetLifeCanvas.getBoundingClientRect();
  
  return {
    x: point.x - (canvasRect.left - mapRect.left),
    y: point.y - (canvasRect.top - mapRect.top)
  };
}

// Get point along a path at given progress (0-1)
// OPTIMIZED: Uses pre-calculated cumulative lengths - no Math.sqrt() per frame!
function getPointAlongPath(path, progress) {
  if (path.coords.length < 2) return null;
  
  const targetDist = progress * path.totalLength;
  
  // Find segment using simple search (arrays are typically short)
  // For very long paths, could upgrade to binary search
  let i = 0;
  while (i < path.cumulativeLengths.length - 1 && path.cumulativeLengths[i + 1] < targetDist) {
    i++;
  }
  
  // Handle edge case at path end
  if (i >= path.coords.length - 1) {
    i = path.coords.length - 2;
  }
  
  // Interpolate position within segment
  const segmentStartDist = path.cumulativeLengths[i];
  const segmentLen = path.cumulativeLengths[i + 1] - segmentStartDist;
  const segmentProgress = segmentLen > 0 ? (targetDist - segmentStartDist) / segmentLen : 0;
  
  const p1 = path.coords[i];
  const p2 = path.coords[i + 1];
  
  return {
    lng: p1[0] + (p2[0] - p1[0]) * segmentProgress,
    lat: p1[1] + (p2[1] - p1[1]) * segmentProgress,
    angle: path.segmentAngles[i] // Pre-calculated angle - zero computation!
  };
}

// Spawn a new car - with smart spawning based on road hierarchy
function spawnCar() {
  if (vehicles.filter(v => v.type === 'car').length >= CONFIG.maxCars) return;
  
  const eligiblePaths = streetPaths.filter(p => p.isVehicleRoad && p.totalLength > 0.001);
  if (eligiblePaths.length === 0) return;
  
  // SMART SPAWNING: Filter for major roads first
  const majorRoads = streetPaths.filter(p => 
    (p.type === 'motorway' || p.type === 'primary' || p.type === 'trunk' || p.type === 'secondary') && 
    p.totalLength > 0.001
  );
  
  // 70% chance to pick a major road, 30% chance for random street
  let pool = (Math.random() < 0.7 && majorRoads.length > 0) ? majorRoads : eligiblePaths;
  
  const path = pool[Math.floor(Math.random() * pool.length)];
  const colorScheme = CONFIG.carColors[Math.floor(Math.random() * CONFIG.carColors.length)];
  const reverse = Math.random() > 0.5;
  
  vehicles.push({
    type: 'car',
    path: path,
    progress: reverse ? 1 : 0,
    speed: CONFIG.carSpeed * (0.8 + Math.random() * 0.4),
    speedVar: 0.9 + Math.random() * 0.2, // Natural speed variance
    direction: reverse ? -1 : 1,
    colors: colorScheme,
    headlightsOn: true,
    wobble: Math.random() * Math.PI * 2
  });
}

// Spawn a new bus
function spawnBus() {
  if (vehicles.filter(v => v.type === 'bus').length >= CONFIG.maxBuses) return;
  
  const eligiblePaths = streetPaths.filter(p => p.isBusRoute && p.totalLength > 0.002);
  if (eligiblePaths.length === 0) return;
  
  const path = eligiblePaths[Math.floor(Math.random() * eligiblePaths.length)];
  const colorScheme = CONFIG.busColors[Math.floor(Math.random() * CONFIG.busColors.length)];
  const reverse = Math.random() > 0.5;
  
  vehicles.push({
    type: 'bus',
    path: path,
    progress: reverse ? 1 : 0,
    speed: CONFIG.busSpeed * (0.9 + Math.random() * 0.2),
    speedVar: 0.9 + Math.random() * 0.2, // Natural speed variance
    direction: reverse ? -1 : 1,
    colors: colorScheme,
    stopTimer: 0,
    isAtStop: false
  });
}

// Spawn a taxi - prefers major roads where fares are
function spawnTaxi() {
  if (vehicles.filter(v => v.type === 'taxi').length >= CONFIG.maxTaxis) return;
  
  const eligiblePaths = streetPaths.filter(p => p.isVehicleRoad && p.totalLength > 0.001);
  if (eligiblePaths.length === 0) return;
  
  // Taxis prefer commercial/major roads
  const majorRoads = streetPaths.filter(p => 
    (p.type === 'primary' || p.type === 'secondary' || p.type === 'tertiary') && 
    p.totalLength > 0.001
  );
  
  let pool = (Math.random() < 0.8 && majorRoads.length > 0) ? majorRoads : eligiblePaths;
  
  const path = pool[Math.floor(Math.random() * pool.length)];
  const colorScheme = CONFIG.taxiColors[Math.floor(Math.random() * CONFIG.taxiColors.length)];
  const reverse = Math.random() > 0.5;
  
  vehicles.push({
    type: 'taxi',
    path: path,
    progress: reverse ? 1 : 0,
    speed: CONFIG.carSpeed * (0.7 + Math.random() * 0.3),
    speedVar: 0.9 + Math.random() * 0.2, // Natural speed variance
    direction: reverse ? -1 : 1,
    colors: colorScheme,
    headlightsOn: true,
    isAvailable: Math.random() > 0.3
  });
}

// Spawn a bicycle
function spawnBicycle() {
  if (vehicles.filter(v => v.type === 'bicycle').length >= CONFIG.maxBicycles) return;
  
  const eligiblePaths = streetPaths.filter(p => p.isCycleRoute && p.totalLength > 0.0008);
  if (eligiblePaths.length === 0) return;
  
  const path = eligiblePaths[Math.floor(Math.random() * eligiblePaths.length)];
  const colorScheme = CONFIG.bicycleColors[Math.floor(Math.random() * CONFIG.bicycleColors.length)];
  const reverse = Math.random() > 0.5;
  
  vehicles.push({
    type: 'bicycle',
    path: path,
    progress: reverse ? 1 : 0,
    speed: CONFIG.bicycleSpeed * (0.7 + Math.random() * 0.6),
    speedVar: 0.9 + Math.random() * 0.2, // Natural speed variance
    direction: reverse ? -1 : 1,
    colors: colorScheme,
    pedalPhase: Math.random() * Math.PI * 2
  });
}

// Spawn a pedestrian
function spawnPedestrian() {
  if (pedestrians.length >= CONFIG.maxPedestrians) return;
  
  const eligiblePaths = streetPaths.filter(p => p.isPedestrianPath && p.totalLength > 0.0005);
  if (eligiblePaths.length === 0) return;
  
  const path = eligiblePaths[Math.floor(Math.random() * eligiblePaths.length)];
  const color = CONFIG.pedestrianColors[Math.floor(Math.random() * CONFIG.pedestrianColors.length)];
  const reverse = Math.random() > 0.5;
  
  pedestrians.push({
    path: path,
    progress: reverse ? 1 : 0,
    speed: CONFIG.pedestrianSpeed * (0.6 + Math.random() * 0.8),
    direction: reverse ? -1 : 1,
    color: color,
    wobblePhase: Math.random() * Math.PI * 2,
    size: CONFIG.pedestrianSize * (0.8 + Math.random() * 0.4)
  });
}

// Update all entities with smooth organic movement
function updateStreetLifeEntities() {
  // Update vehicles - smooth movement using speedVar
  vehicles = vehicles.filter(v => {
    // Bus stop logic
    if (v.type === 'bus' && v.isAtStop) {
      v.stopTimer--;
      if (v.stopTimer <= 0) v.isAtStop = false;
      return true;
    }
    
    // Random bus stop
    if (v.type === 'bus' && !v.isAtStop && Math.random() < 0.001) {
      v.isAtStop = true;
      v.stopTimer = 60 + Math.floor(Math.random() * 120);
      return true;
    }
    
    // Bicycle pedal animation
    if (v.type === 'bicycle') v.pedalPhase += 0.2;
    
    // SMOOTH MOVEMENT: Multiply by unique speedVar so vehicles don't move in lockstep
    const variance = v.speedVar || 1.0;
    v.progress += v.speed * variance * v.direction;
    
    return v.progress >= 0 && v.progress <= 1;
  });
  
  // Update pedestrians with "Organic Wobble"
  pedestrians = pedestrians.filter(p => {
    p.progress += p.speed * p.direction;
    // Organic movement: changes wobble over time for natural flow
    p.wobblePhase += 0.05;
    return p.progress >= 0 && p.progress <= 1;
  });
  
  // Auto-replenish to keep the city busy
  while (vehicles.filter(v => v.type === 'car').length < CONFIG.maxCars) spawnCar();
  while (vehicles.filter(v => v.type === 'taxi').length < CONFIG.maxTaxis) spawnTaxi();
  while (vehicles.filter(v => v.type === 'bus').length < CONFIG.maxBuses) spawnBus();
  while (vehicles.filter(v => v.type === 'bicycle').length < CONFIG.maxBicycles) spawnBicycle();
  while (pedestrians.length < CONFIG.maxPedestrians) spawnPedestrian();
  
  // Connect to Calibration Grid - trigger pulses when vehicles pass near nodes
  if (window.triggerGridNodePulse && window.calibrationNodes) {
    vehicles.forEach(v => {
      if (Math.random() > 0.1) return; // Only check 10% of frames
      const point = getPointAlongPath(v.path, v.progress);
      if (!point) return;
      const pos = projectToStreetLifeCanvas(point.lng, point.lat);
      
      window.calibrationNodes.forEach(node => {
        const dx = pos.x - node.screenX;
        const dy = pos.y - node.screenY;
        if (dx*dx + dy*dy < 1600) {
          window.triggerGridNodePulse(node.id);
        }
      });
    });
  }
}

// Draw a car - High-Tech with Volumetric Beams
function drawCar(ctx, pos, angle, colors, headlightsOn, direction = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  
  const rotationOffset = direction < 0 ? Math.PI : 0;
  ctx.rotate(-angle + Math.PI + rotationOffset);
  
  const len = CONFIG.carLength;
  const width = CONFIG.carWidth;
  
  // 1. VOLUMETRIC HEADLIGHTS (Gradient Cones)
  if (headlightsOn) {
    const beamLen = 50; // Longer beam
    // Create gradient: Bright -> Invisible
    const grad = ctx.createLinearGradient(0, -len/2, 0, -len/2 - beamLen);
    grad.addColorStop(0, 'rgba(255, 255, 220, 0.4)'); // Source
    grad.addColorStop(1, 'rgba(255, 255, 220, 0)');   // Fade out
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-width/2 + 1, -len/2);
    ctx.lineTo(-width - 2, -len/2 - beamLen); // Flare out left
    ctx.lineTo(width + 2, -len/2 - beamLen);  // Flare out right
    ctx.lineTo(width/2 - 1, -len/2);
    ctx.fill();
  }
  
  // 2. BODY GLOW (The "Neon" look)
  ctx.shadowColor = colors.body;
  ctx.shadowBlur = 10; // This makes the car look like a light source
  ctx.fillStyle = colors.body;
  
  ctx.beginPath();
  ctx.roundRect(-width / 2, -len / 2, width, len, 3);
  ctx.fill();
  
  // 3. TAILLIGHTS (Intense Red Trails)
  // We draw these slightly offset so they leave red streaks
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ff2222';
  ctx.fillRect(-width/2 + 1, len/2 - 1, 2, 2);
  ctx.fillRect(width/2 - 3, len/2 - 1, 2, 2);
  
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Draw a bus - with volumetric headlights
function drawBus(ctx, pos, angle, colors, isAtStop, direction = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  // Flip 180° when traveling in reverse so headlights face forward
  const rotationOffset = direction < 0 ? Math.PI : 0;
  ctx.rotate(-angle + Math.PI + rotationOffset);
  
  const len = CONFIG.busLength;
  const width = CONFIG.busWidth;
  
  // Volumetric headlight beams (Gradient Cones)
  const beamLen = 60;
  const grad = ctx.createLinearGradient(0, -len/2, 0, -len/2 - beamLen);
  grad.addColorStop(0, 'rgba(255, 255, 200, 0.35)');
  grad.addColorStop(1, 'rgba(255, 255, 200, 0)');
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-width/2 + 1, -len/2);
  ctx.lineTo(-width - 5, -len/2 - beamLen);
  ctx.lineTo(width + 5, -len/2 - beamLen);
  ctx.lineTo(width/2 - 1, -len/2);
  ctx.fill();
  
  // Bus body with glow
  ctx.shadowColor = colors.body;
  ctx.shadowBlur = 12;
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(-width / 2, -len / 2, width, len, 3);
  ctx.fill();
  
  // Windows (multiple along the side) - illuminated from inside
  ctx.shadowColor = colors.windows;
  ctx.shadowBlur = 4;
  ctx.fillStyle = colors.windows;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(-width / 2 + 1, -len / 2 + 4 + i * 5, width - 2, 3);
  }
  
  // Front window
  ctx.fillRect(-width / 2 + 1, -len / 2 + 1, width - 2, 2);
  
  // Taillights (Intense Red Trails)
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ff2222';
  ctx.fillRect(-width/2 + 1, len/2 - 2, 2, 3);
  ctx.fillRect(width/2 - 3, len/2 - 2, 2, 3);
  
  // If at stop, show indicator
  if (isAtStop) {
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(0, -len / 2 - 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Draw a pedestrian
function drawPedestrian(ctx, pos, wobblePhase, color, size) {
  ctx.save();
  
  // Walking wobble animation
  const wobbleX = Math.sin(wobblePhase) * 1.5;
  const wobbleY = Math.abs(Math.sin(wobblePhase * 2)) * 0.5;
  
  ctx.translate(pos.x + wobbleX, pos.y - wobbleY);
  
  // Glow effect
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  
  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -size * 0.3, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  
  // Body
  ctx.beginPath();
  ctx.arc(0, size * 0.2, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Draw a taxi - with volumetric headlights
function drawTaxi(ctx, pos, angle, colors, isAvailable, direction = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  // Flip 180° when traveling in reverse so headlights face forward
  const rotationOffset = direction < 0 ? Math.PI : 0;
  ctx.rotate(-angle + Math.PI + rotationOffset);
  
  const len = CONFIG.carLength + 2; // Slightly larger than regular cars
  const width = CONFIG.carWidth + 1;
  
  // Volumetric headlight beams
  const beamLen = 50;
  const grad = ctx.createLinearGradient(0, -len/2, 0, -len/2 - beamLen);
  grad.addColorStop(0, 'rgba(255, 255, 220, 0.4)');
  grad.addColorStop(1, 'rgba(255, 255, 220, 0)');
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-width/2 + 1, -len/2);
  ctx.lineTo(-width - 2, -len/2 - beamLen);
  ctx.lineTo(width + 2, -len/2 - beamLen);
  ctx.lineTo(width/2 - 1, -len/2);
  ctx.fill();
  
  // Taxi body with glow
  ctx.shadowColor = colors.body;
  ctx.shadowBlur = 10;
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(-width / 2, -len / 2, width, len, 2);
  ctx.fill();
  
  // Taxi roof sign with glow
  const signColor = isAvailable ? '#00ff00' : '#ff0000';
  ctx.fillStyle = signColor;
  ctx.shadowColor = signColor;
  ctx.shadowBlur = 12;
  ctx.fillRect(-2, -len / 4 - 3, 4, 3);
  
  // Taillights (Intense Red Trails)
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ff2222';
  ctx.fillRect(-width/2 + 1, len/2 - 1, 2, 2);
  ctx.fillRect(width/2 - 3, len/2 - 1, 2, 2);
  
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Draw a bicycle with rider - direction param flips orientation
function drawBicycle(ctx, pos, angle, colors, pedalPhase, direction = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  // Flip 180° when traveling in reverse
  const rotationOffset = direction < 0 ? Math.PI : 0;
  ctx.rotate(-angle + Math.PI + rotationOffset);
  
  const len = CONFIG.bicycleLength;
  const width = CONFIG.bicycleWidth;
  
  // Bicycle frame
  ctx.strokeStyle = colors.frame;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = colors.frame;
  ctx.shadowBlur = 4;
  
  // Frame triangle
  ctx.beginPath();
  ctx.moveTo(0, -len / 2 + 1); // Front
  ctx.lineTo(-1, len / 4); // Bottom bracket
  ctx.lineTo(0, len / 2 - 1); // Rear
  ctx.lineTo(0, -len / 2 + 1);
  ctx.stroke();
  
  // Wheels
  ctx.beginPath();
  ctx.arc(0, -len / 2 + 1, 2, 0, Math.PI * 2); // Front wheel
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, len / 2 - 1, 2, 0, Math.PI * 2); // Rear wheel
  ctx.stroke();
  
  // Rider (bobbing with pedaling motion)
  const bobY = Math.sin(pedalPhase) * 0.5;
  ctx.fillStyle = colors.rider;
  ctx.shadowColor = colors.rider;
  ctx.shadowBlur = 6;
  
  // Rider body
  ctx.beginPath();
  ctx.ellipse(0, -len / 4 + bobY, width / 2, len / 4, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Rider head
  ctx.beginPath();
  ctx.arc(0, -len / 2 - 1 + bobY, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Pedaling legs (animated)
  const pedalX = Math.cos(pedalPhase) * 1.5;
  const pedalY = Math.sin(pedalPhase) * 1;
  ctx.strokeStyle = colors.rider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1, len / 4);
  ctx.lineTo(-1 + pedalX, len / 4 + pedalY + 2);
  ctx.moveTo(-1, len / 4);
  ctx.lineTo(-1 - pedalX, len / 4 - pedalY + 2);
  ctx.stroke();
  
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ALTERNATIVE: Draw vehicles as "Data Comets" - minimal abstract style
// Set CONFIG.useDataComet = true to enable this mode
function drawDataComet(ctx, pos, angle, color, direction = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  const rotationOffset = direction < 0 ? Math.PI : 0;
  ctx.rotate(-angle + Math.PI + rotationOffset);
  
  // Draw the head (Data Packet) - white hot center
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw the tail (Speed Streak)
  const tailLen = 30;
  const grad = ctx.createLinearGradient(0, 0, 0, tailLen);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(0, tailLen);
  ctx.lineTo(1, 0);
  ctx.fill();
  
  ctx.shadowBlur = 0;
  ctx.restore();
}

// FIXED: Main draw function with Correct Rotation
function drawStreetLife() {
  const width = streetLifeCanvas.width;
  const height = streetLifeCanvas.height;
  
  // 1. CLEAR CANVAS (No motion blur)
  streetLifeCtx.clearRect(0, 0, width, height);
  
  // 2. PREPARE FOR DRAWING
  streetLifeCtx.globalCompositeOperation = 'source-over';
  
  // GET MAP BEARING (Critical for Headlight Alignment)
  // Convert map bearing from degrees to radians
  const mapBearing = (map.getBearing() || 0) * (Math.PI / 180);
  
  // --- DRAW STREETLIGHTS FIRST (Background layer of light) ---
  streetLifeCtx.globalCompositeOperation = 'lighter';
  drawStreetlights(streetLifeCtx, width, height);
  
  // --- DRAW VEHICLES ---
  // Keep lighter mode for neon glow
  vehicles.forEach(v => {
    const point = getPointAlongPath(v.path, v.progress);
    if (!point) return;
    const pos = projectToStreetLifeCanvas(point.lng, point.lat);
    
    // Optimization: Skip off-screen
    if (!isOnScreen(pos, width, height)) return;
    
    // --- THE ANGLE FIX ---
    // 1. point.angle is Math (Counter-Clockwise from East).
    // 2. Screen Y is flipped vs Geo Y (Lat), so we negate (-point.angle).
    // 3. We add the Map Bearing to rotate with the camera.
    const screenAngle = -point.angle + mapBearing;
    
    if (v.type === 'car') {
      drawFastLight(streetLifeCtx, pos, screenAngle, v.colors.body, 25, 8, v.direction);
    } else if (v.type === 'taxi') {
      drawFastLight(streetLifeCtx, pos, screenAngle, v.colors.body, 25, 8, v.direction);
    } else if (v.type === 'bus') {
      drawFastLight(streetLifeCtx, pos, screenAngle, v.colors.body, 35, 12, v.direction);
    } else if (v.type === 'bicycle') {
      drawFastLight(streetLifeCtx, pos, screenAngle, v.colors.frame, 10, 4, v.direction);
    }
  });
  
  // --- DRAW PEDESTRIANS ---
  streetLifeCtx.globalCompositeOperation = 'source-over'; // Solid dots
  
  pedestrians.forEach(p => {
    const point = getPointAlongPath(p.path, p.progress);
    if (!point) return;
    
    // Organic Offset - rotate wobble with map bearing too
    const offsetMag = Math.sin(p.wobblePhase) * 1.5;
    const perpAngle = -point.angle + mapBearing + Math.PI / 2;
    const offsetX = Math.cos(perpAngle) * offsetMag;
    const offsetY = Math.sin(perpAngle) * offsetMag;
    
    const pos = projectToStreetLifeCanvas(point.lng, point.lat);
    
    if (!isOnScreen(pos, width, height)) return;
    
    streetLifeCtx.fillStyle = p.color;
    streetLifeCtx.beginPath();
    streetLifeCtx.arc(pos.x + offsetX, pos.y + offsetY, 1.5, 0, Math.PI * 2);
    streetLifeCtx.fill();
  });
  
  // Reset for next frame
  streetLifeCtx.globalCompositeOperation = 'source-over';
}

// Generate static streetlights along paths (called once on load)
function generateStreetlights() {
  streetlights = [];
  if (streetPaths.length === 0) return;
  
  console.time('Generating Streetlights');
  
  streetPaths.forEach(path => {
    // Only put lights on MAJOR roads (not residential/service/footways)
    const majorRoads = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
    if (!majorRoads.includes(path.type)) return;
    // Skip very short segments
    if (path.totalLength < CONFIG.streetlightSpacing * 2) return;
    
    // Calculate how many lights fit on this path segment
    const numLights = Math.floor(path.totalLength / CONFIG.streetlightSpacing);
    
    // Place them evenly along the path
    for (let i = 1; i <= numLights; i++) {
      const progress = i / (numLights + 1);
      const point = getPointAlongPath(path, progress);
      if (point) {
        streetlights.push({ lng: point.lng, lat: point.lat });
      }
    }
  });
  
  console.timeEnd('Generating Streetlights');
  console.log(`✓ Generated ${streetlights.length} static streetlights`);
}

// Draw static streetlights efficiently
function drawStreetlights(ctx, width, height) {
  const radius = CONFIG.streetlightRadius;
  
  streetlights.forEach(light => {
    const pos = projectToStreetLifeCanvas(light.lng, light.lat);
    
    // Strict bounds check with padding for radius
    if (pos.x < -radius || pos.x > width + radius ||
        pos.y < -radius || pos.y > height + radius) {
      return;
    }
    
    // Create Radial Gradient with gradual spread
    const grad = ctx.createRadialGradient(
      pos.x, pos.y, 0,      // Inner circle (center point)
      pos.x, pos.y, radius  // Outer circle
    );
    grad.addColorStop(0, CONFIG.streetlightColor);   // Warm center
    grad.addColorStop(0.3, 'rgba(255, 210, 150, 0.06)'); // Gradual falloff
    grad.addColorStop(0.7, 'rgba(255, 210, 150, 0.02)'); // Soft spread
    grad.addColorStop(1, 'rgba(0,0,0,0)');           // Fade to nothing
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

// FIXED: Robust Drawing Function (Always draws facing Right/East)
function drawFastLight(ctx, pos, angle, color, length, width, direction = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  
  // 1. ROTATION
  // Add Math.PI to rotate headlights 180 degrees (flip front/back)
  // If direction is -1 (Reverse), we flip it another 180 degrees.
  const finalAngle = direction === 1 ? angle + Math.PI : angle;
  ctx.rotate(finalAngle);
  
  // 2. DRAW FACING RIGHT (0 Radians)
  
  // Headlight Glow Halo (Large soft radial glow)
  const glowRadius = length * 0.6;
  const headlightGlow = ctx.createRadialGradient(length * 0.3, 0, 0, length * 0.3, 0, glowRadius);
  headlightGlow.addColorStop(0, 'rgba(255, 255, 220, 0.5)');
  headlightGlow.addColorStop(0.3, 'rgba(255, 255, 200, 0.2)');
  headlightGlow.addColorStop(1, 'rgba(255, 255, 200, 0)');
  ctx.fillStyle = headlightGlow;
  ctx.beginPath();
  ctx.arc(length * 0.3, 0, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Headlight Beam (Facing Right ->) - Brighter volumetric cone
  const beamGrad = ctx.createLinearGradient(1, 0, length, 0);
  beamGrad.addColorStop(0, 'rgba(255, 255, 220, 0.6)');
  beamGrad.addColorStop(0.5, 'rgba(255, 255, 200, 0.3)');
  beamGrad.addColorStop(1, 'rgba(255, 255, 200, 0)');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(1, 0); // Nose of car
  ctx.lineTo(length, -width/2); // Top right flare
  ctx.lineTo(length, width/2);  // Bottom right flare
  ctx.lineTo(1, 0);
  ctx.closePath();
  ctx.fill();
  
  // Body (Core) - Bright center point, scales with vehicle size
  const coreSize = Math.max(2.5, width / 3);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = color;
  ctx.shadowBlur = coreSize * 3;
  ctx.beginPath();
  ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Taillight (Facing Left <-) - smaller, longer trail
  const tailLen = 18;
  const tailGrad = ctx.createLinearGradient(-2, 0, -2 - tailLen, 0);
  tailGrad.addColorStop(0, 'rgba(255, 60, 60, 0.6)');
  tailGrad.addColorStop(0.4, 'rgba(255, 0, 0, 0.25)');
  tailGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  ctx.moveTo(-2, -1.5);
  ctx.lineTo(-2 - tailLen, -0.5);
  ctx.lineTo(-2 - tailLen, 0.5);
  ctx.lineTo(-2, 1.5);
  ctx.closePath();
  ctx.fill();
  
  // Taillight core (small)
  ctx.fillStyle = '#ff4444';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(-2, 0, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  ctx.restore();
}

// Helper for bounds checking
function isOnScreen(pos, w, h) {
  return pos.x >= -50 && pos.x <= w + 50 && pos.y >= -50 && pos.y <= h + 50;
}

// Animation loop
function animateStreetLife() {
  if (!isStreetLifeAnimating) return;
  
  updateStreetLifeEntities();
  drawStreetLife();
  
  streetLifeAnimationFrame = requestAnimationFrame(animateStreetLife);
}

// Spawn timer
let spawnTimer = null;

function startSpawning() {
  if (spawnTimer) clearInterval(spawnTimer);
  
  // Initial spawn burst - populate the city immediately
  for (let i = 0; i < 30; i++) spawnCar();
  for (let i = 0; i < 10; i++) spawnTaxi();
  for (let i = 0; i < 8; i++) spawnBus();
  for (let i = 0; i < 20; i++) spawnBicycle();
  for (let i = 0; i < 200; i++) spawnPedestrian(); // Dense crowd
  
  // Continuous spawning (auto-replenish handles most of it now)
  spawnTimer = setInterval(() => {
    if (!isStreetLifeAnimating) return;
    
    // Top up any that despawned
    if (Math.random() < 0.4) spawnCar();
    if (Math.random() < 0.2) spawnTaxi();
    if (Math.random() < 0.15) spawnBus();
    if (Math.random() < 0.3) spawnBicycle();
    if (Math.random() < 0.5) spawnPedestrian();
  }, CONFIG.spawnInterval);
}

function stopSpawning() {
  if (spawnTimer) {
    clearInterval(spawnTimer);
    spawnTimer = null;
  }
}

// Resize canvas
function resizeStreetLifeCanvas() {
  const s = computeOverlayPixelSize();
  streetLifeCanvas.width = s.w;
  streetLifeCanvas.height = s.h;
  streetLifeCanvas.style.width = s.w + 'px';
  streetLifeCanvas.style.height = s.h + 'px';
}

// Start animation
function startStreetLifeAnimation() {
  if (isStreetLifeAnimating) return;
  
  loadStreetLifeData().then(() => {
    if (streetPaths.length === 0) {
      console.warn('Street Life: No paths available for animation');
      return;
    }
    
    isStreetLifeAnimating = true;
    streetLifeCanvas.style.display = 'block';
    resizeStreetLifeCanvas();
    
    // Clear any existing entities
    vehicles = [];
    pedestrians = [];
    
    startSpawning();
    animateStreetLife();
    
    console.log('Street Life animation started');
  });
}

// Stop animation
function stopStreetLifeAnimation() {
  isStreetLifeAnimating = false;
  streetLifeCanvas.style.display = 'none';
  stopSpawning();
  
  if (streetLifeAnimationFrame) {
    cancelAnimationFrame(streetLifeAnimationFrame);
    streetLifeAnimationFrame = null;
  }
  
  streetLifeCtx.clearRect(0, 0, streetLifeCanvas.width, streetLifeCanvas.height);
  vehicles = [];
  pedestrians = [];
  
  console.log('Street Life animation stopped');
}

// Check if any visualization is active
function isAnyVisualizationActive() {
  // Check for active/toggled-on buttons
  const activeButtons = [
    'cfd-simulation-btn',
    'stormwater-btn', 
    'sun-study-btn',
    'slideshow-btn',
    'grid-animation-btn',
    'isovist-btn',
    'bird-sounds-btn'
  ];
  
  for (const id of activeButtons) {
    const btn = document.getElementById(id);
    if (btn && (btn.classList.contains('active') || btn.classList.contains('toggled-on'))) {
      return true;
    }
  }
  
  // Also check if any visualization canvas is active/visible
  const canvasIds = [
    'cfd-simulation-canvas',
    'stormwater-canvas',
    'slideshow-canvas',
    'grid-animation-canvas',
    'bird-sounds-canvas'
  ];
  
  for (const id of canvasIds) {
    const canvas = document.getElementById(id);
    if (canvas && canvas.classList.contains('active')) {
      return true;
    }
  }
  
  return false;
}

// Auto-manage street life based on other visualizations
function updateStreetLifeVisibility() {
  if (isAnyVisualizationActive()) {
    if (isStreetLifeAnimating) {
      stopStreetLifeAnimation();
    }
  } else {
    if (!isStreetLifeAnimating) {
      startStreetLifeAnimation();
    }
  }
}

// Listen for button clicks to manage visibility - using MutationObserver for reliable detection
function setupVisibilityObserver() {
  const buttons = document.querySelectorAll('.icon-btn');
  
  // Use MutationObserver to watch for class changes on buttons
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        // Delay slightly to let other handlers complete
        setTimeout(updateStreetLifeVisibility, 50);
      }
    });
  });
  
  buttons.forEach(btn => {
    observer.observe(btn, { attributes: true, attributeFilter: ['class'] });
    // Also listen for direct clicks
    btn.addEventListener('click', () => {
      setTimeout(updateStreetLifeVisibility, 100);
    });
  });
  
  // Also watch canvases
  const canvases = document.querySelectorAll('canvas');
  canvases.forEach(canvas => {
    observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
  });
}

// Initialize on load
function initStreetLife() {
  setupVisibilityObserver();
  
  // Start street life animation after a delay (let map and other things load)
  setTimeout(() => {
    if (!isAnyVisualizationActive()) {
      startStreetLifeAnimation();
    }
  }, 2500);
}

// Wait for DOM and map to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStreetLife);
} else {
  // DOM already loaded, but wait for map
  setTimeout(initStreetLife, 1000);
}

// Handle window resize
window.addEventListener('resize', () => {
  if (isStreetLifeAnimating) {
    resizeStreetLifeCanvas();
  }
});

// Expose for external control
window.streetLifeAnimation = {
  start: startStreetLifeAnimation,
  stop: stopStreetLifeAnimation,
  isActive: () => isStreetLifeAnimating,
  updateVisibility: updateStreetLifeVisibility
};

console.log('Street Life animation module loaded');

})();
