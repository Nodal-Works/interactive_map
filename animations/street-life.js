// ===== Street Life Animation =====
// Animated pedestrians, cars, and buses following the street network
// Now refactored as an ES6 class for better module management

class StreetLifeAnimation {
  constructor(map) {
    this.map = map;
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'street-life-canvas';
    this.canvas.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 845;
      pointer-events: none;
      display: none;
    `;
    document.body.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext('2d');
    
    // Animation state
    this.animationFrame = null;
    this.isAnimating = false;
    this.streetLifeData = null;
    this.dataLoaded = false;
    
    // Entity collections
    this.vehicles = [];
    this.pedestrians = [];
    this.streetlights = [];
    this.streetPaths = [];
    this.buildings = [];
    this.buildingFlickerStates = [];
    this.emergencyVehicle = null;
    this.emergencySpawnTimer = null;
    
    // City ambient sound
    this.cityAmbientAudio = null;
    this.audioFadeInterval = null;
    this.AUDIO_FADE_DURATION = 1500;
    this.AUDIO_MAX_VOLUME = 0.5;
    this.AUDIO_FADE_STEPS = 30;
    
    // Configuration
    this.CONFIG = {
      maxCars: 50,
      maxBuses: 12,
      maxBicycles: 30,
      maxTaxis: 15,
      maxPedestrians: 1500,
      carSpeed: 0.002,
      busSpeed: 0.0012,
      bicycleSpeed: 0.0015,
      pedestrianSpeed: 0.0005,
      spawnInterval: 200,
      
      // Streetlight Configuration
      streetlightColor: 'rgba(255, 210, 150, 0.6)',
      streetlightRadius: 60,
      streetlightSpacing: 0.0008,
      
      // Building Window Lights Configuration
      buildingGlowColor: 'rgba(255, 220, 150, 0.25)',
      buildingDashLength: 8,
      buildingGapLength: 12,
      buildingGlowWidth: 2,
      
      // Emergency Vehicle Configuration
      emergencySpawnMin: 10000,
      emergencySpawnMax: 20000,
      emergencySpeedMultiplier: 1.5,
      emergencyLightRadius: 60,
      emergencyFlashRate: 20,
      
      // Building flicker configuration
      buildingFlickerChance: 0.0003,
      
      // Trail effect control
      trailFade: 0.96,
      
      // Visual sizes
      carLength: 12,
      carWidth: 6,
      busLength: 22,
      busWidth: 7,
      bicycleLength: 6,
      bicycleWidth: 3,
      pedestrianSize: 4,
      
      // Color Palettes
      carColors: [
        { body: '#00f2ff', headlight: '#ffffff', taillight: '#ff0055' },
        { body: '#e0e0e0', headlight: '#ffffff', taillight: '#ff0055' },
        { body: '#1a2b45', headlight: '#aaddff', taillight: '#ff0055' },
        { body: '#2d6a6a', headlight: '#aaffff', taillight: '#ff0055' },
        { body: '#4a3a6a', headlight: '#ddccff', taillight: '#ff0055' },
      ],
      taxiColors: [
        { body: '#ffcc00', headlight: '#ffffff', taillight: '#ff0055', sign: '#00ff88' },
        { body: '#e6e600', headlight: '#ffffff', taillight: '#ff0055', sign: '#00ff88' },
      ],
      busColors: [
        { body: '#ffcc00', windows: '#1a1a2e', lights: '#ffffff' },
        { body: '#0088cc', windows: '#1a1a2e', lights: '#ffffff' },
      ],
      bicycleColors: [
        { frame: '#00f2ff', rider: '#445566' },
        { frame: '#00cc88', rider: '#445566' },
        { frame: '#ff6688', rider: '#445566' },
      ],
      pedestrianColors: [
        '#334455', '#445566', '#556677', '#3a4a5a', '#4a5a6a',
        '#00aaaa', '#00aa88'
      ]
    };
    
    // Road type filters
    this.vehicleRoads = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service'];
    this.pedestrianPaths = ['footway', 'path', 'pedestrian', 'cycleway', 'residential', 'living_street', 'service', 'tertiary', 'secondary'];
    this.busRoutes = ['primary', 'secondary', 'tertiary', 'trunk'];
    this.cycleRoutes = ['cycleway', 'path', 'residential', 'tertiary', 'secondary', 'living_street'];
    
    // Bind event handlers
    this.handleResize = this.handleResize.bind(this);
  }
  
  // Public API methods
  start() {
    this.startStreetLifeAnimation();
  }
  
  stop() {
    this.stopStreetLifeAnimation();
  }
  
  toggle() {
    if (this.isAnimating) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  isActive() {
    return this.isAnimating;
  }
  
  // Data loading
  async loadStreetLifeData() {
    if (this.dataLoaded) return Promise.resolve();
    
    try {
      const response = await fetch('media/street-network.geojson');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.streetLifeData = await response.json();
      
      this.parseStreetPaths(this.streetLifeData);
      this.generateStreetlights();
      this.loadBuildingFootprints();
      
      this.dataLoaded = true;
      console.log(`✓ Street Life: Loaded ${this.streetPaths.length} paths for animation`);
    } catch (err) {
      console.warn('Street Life: Could not load street network:', err);
    }
  }
  
  // Parse GeoJSON into usable paths with pre-calculated cumulative distances
  parseStreetPaths(geojson) {
    this.streetPaths = [];
    
    if (!geojson || !geojson.features) return;
    
    geojson.features.forEach(feature => {
      const highway = feature.properties?.highway || 'default';
      
      let coordinates = [];
      
      if (feature.geometry.type === 'LineString') {
        coordinates = feature.geometry.coordinates;
      } else if (feature.geometry.type === 'MultiLineString') {
        feature.geometry.coordinates.forEach(line => {
          if (coordinates.length > 0) {
            coordinates.push(null);
          }
          coordinates = coordinates.concat(line);
        });
      }
      
      coordinates = coordinates.filter(c => c !== null);
      
      if (coordinates.length >= 2) {
        let totalLength = 0;
        const cumulativeLengths = [0];
        const segmentAngles = [];
        
        for (let i = 0; i < coordinates.length - 1; i++) {
          const dx = coordinates[i + 1][0] - coordinates[i][0];
          const dy = coordinates[i + 1][1] - coordinates[i][1];
          const segLen = Math.sqrt(dx * dx + dy * dy);
          totalLength += segLen;
          cumulativeLengths.push(totalLength);
          segmentAngles.push(Math.atan2(dy, dx));
        }
        
        this.streetPaths.push({
          coords: coordinates,
          cumulativeLengths: cumulativeLengths,
          segmentAngles: segmentAngles,
          totalLength: totalLength,
          type: highway,
          isVehicleRoad: this.vehicleRoads.includes(highway),
          isPedestrianPath: this.pedestrianPaths.includes(highway),
          isBusRoute: this.busRoutes.includes(highway),
          isCycleRoute: this.cycleRoutes.includes(highway)
        });
      }
    });
    
    this.streetPaths.sort((a, b) => b.totalLength - a.totalLength);
    console.log(`✓ Street Life: Pre-calculated distances for ${this.streetPaths.length} paths`);
  }
  
  // Project coordinates to canvas
  projectToStreetLifeCanvas(lng, lat) {
    const point = this.map.project([lng, lat]);
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    
    return {
      x: point.x - (canvasRect.left - mapRect.left),
      y: point.y - (canvasRect.top - mapRect.top)
    };
  }
  
  // Get point along a path at given progress (0-1)
  getPointAlongPath(path, progress) {
    if (path.coords.length < 2) return null;
    
    const targetDist = progress * path.totalLength;
    
    let i = 0;
    while (i < path.cumulativeLengths.length - 1 && path.cumulativeLengths[i + 1] < targetDist) {
      i++;
    }
    
    if (i >= path.coords.length - 1) {
      i = path.coords.length - 2;
    }
    
    const segmentStartDist = path.cumulativeLengths[i];
    const segmentLen = path.cumulativeLengths[i + 1] - segmentStartDist;
    const segmentProgress = segmentLen > 0 ? (targetDist - segmentStartDist) / segmentLen : 0;
    
    const p1 = path.coords[i];
    const p2 = path.coords[i + 1];
    
    return {
      lng: p1[0] + (p2[0] - p1[0]) * segmentProgress,
      lat: p1[1] + (p2[1] - p1[1]) * segmentProgress,
      angle: path.segmentAngles[i]
    };
  }
  
  // Spawn entities
  spawnCar() {
    if (this.vehicles.filter(v => v.type === 'car').length >= this.CONFIG.maxCars) return;
    
    const eligiblePaths = this.streetPaths.filter(p => p.isVehicleRoad && p.totalLength > 0.001);
    if (eligiblePaths.length === 0) return;
    
    const majorRoads = this.streetPaths.filter(p => 
      (p.type === 'motorway' || p.type === 'primary' || p.type === 'trunk' || p.type === 'secondary') && 
      p.totalLength > 0.001
    );
    
    let pool = (Math.random() < 0.7 && majorRoads.length > 0) ? majorRoads : eligiblePaths;
    
    const path = pool[Math.floor(Math.random() * pool.length)];
    const colorScheme = this.CONFIG.carColors[Math.floor(Math.random() * this.CONFIG.carColors.length)];
    const reverse = Math.random() > 0.5;
    
    this.vehicles.push({
      type: 'car',
      path: path,
      progress: reverse ? 1 : 0,
      speed: this.CONFIG.carSpeed * (0.8 + Math.random() * 0.4),
      speedVar: 0.9 + Math.random() * 0.2,
      direction: reverse ? -1 : 1,
      colors: colorScheme,
      headlightsOn: true,
      wobble: Math.random() * Math.PI * 2
    });
  }
  
  spawnBus() {
    if (this.vehicles.filter(v => v.type === 'bus').length >= this.CONFIG.maxBuses) return;
    
    const eligiblePaths = this.streetPaths.filter(p => p.isBusRoute && p.totalLength > 0.002);
    if (eligiblePaths.length === 0) return;
    
    const path = eligiblePaths[Math.floor(Math.random() * eligiblePaths.length)];
    const colorScheme = this.CONFIG.busColors[Math.floor(Math.random() * this.CONFIG.busColors.length)];
    const reverse = Math.random() > 0.5;
    
    this.vehicles.push({
      type: 'bus',
      path: path,
      progress: reverse ? 1 : 0,
      speed: this.CONFIG.busSpeed * (0.9 + Math.random() * 0.2),
      speedVar: 0.9 + Math.random() * 0.2,
      direction: reverse ? -1 : 1,
      colors: colorScheme,
      stopTimer: 0,
      isAtStop: false
    });
  }
  
  spawnTaxi() {
    if (this.vehicles.filter(v => v.type === 'taxi').length >= this.CONFIG.maxTaxis) return;
    
    const eligiblePaths = this.streetPaths.filter(p => p.isVehicleRoad && p.totalLength > 0.001);
    if (eligiblePaths.length === 0) return;
    
    const majorRoads = this.streetPaths.filter(p => 
      (p.type === 'primary' || p.type === 'secondary' || p.type === 'tertiary') && 
      p.totalLength > 0.001
    );
    
    let pool = (Math.random() < 0.8 && majorRoads.length > 0) ? majorRoads : eligiblePaths;
    
    const path = pool[Math.floor(Math.random() * pool.length)];
    const colorScheme = this.CONFIG.taxiColors[Math.floor(Math.random() * this.CONFIG.taxiColors.length)];
    const reverse = Math.random() > 0.5;
    
    this.vehicles.push({
      type: 'taxi',
      path: path,
      progress: reverse ? 1 : 0,
      speed: this.CONFIG.carSpeed * (0.7 + Math.random() * 0.3),
      speedVar: 0.9 + Math.random() * 0.2,
      direction: reverse ? -1 : 1,
      colors: colorScheme,
      headlightsOn: true,
      isAvailable: Math.random() > 0.3
    });
  }
  
  spawnBicycle() {
    if (this.vehicles.filter(v => v.type === 'bicycle').length >= this.CONFIG.maxBicycles) return;
    
    const eligiblePaths = this.streetPaths.filter(p => p.isCycleRoute && p.totalLength > 0.0008);
    if (eligiblePaths.length === 0) return;
    
    const path = eligiblePaths[Math.floor(Math.random() * eligiblePaths.length)];
    const colorScheme = this.CONFIG.bicycleColors[Math.floor(Math.random() * this.CONFIG.bicycleColors.length)];
    const reverse = Math.random() > 0.5;
    
    this.vehicles.push({
      type: 'bicycle',
      path: path,
      progress: reverse ? 1 : 0,
      speed: this.CONFIG.bicycleSpeed * (0.7 + Math.random() * 0.6),
      speedVar: 0.9 + Math.random() * 0.2,
      direction: reverse ? -1 : 1,
      colors: colorScheme,
      pedalPhase: Math.random() * Math.PI * 2
    });
  }
  
  spawnPedestrian() {
    if (this.pedestrians.length >= this.CONFIG.maxPedestrians) return;
    
    const eligiblePaths = this.streetPaths.filter(p => p.isPedestrianPath && p.totalLength > 0.0005);
    if (eligiblePaths.length === 0) return;
    
    const path = eligiblePaths[Math.floor(Math.random() * eligiblePaths.length)];
    const color = this.CONFIG.pedestrianColors[Math.floor(Math.random() * this.CONFIG.pedestrianColors.length)];
    const reverse = Math.random() > 0.5;
    
    this.pedestrians.push({
      path: path,
      progress: reverse ? 1 : 0,
      speed: this.CONFIG.pedestrianSpeed * (0.6 + Math.random() * 0.8),
      direction: reverse ? -1 : 1,
      color: color,
      wobblePhase: Math.random() * Math.PI * 2,
      size: this.CONFIG.pedestrianSize * (0.8 + Math.random() * 0.4)
    });
  }
  
  spawnEmergencyVehicle() {
    if (this.emergencyVehicle) return;
    
    const eligiblePaths = this.streetPaths.filter(p => 
      ['primary', 'secondary', 'tertiary', 'trunk', 'motorway', 'residential', 'unclassified'].includes(p.type) && 
      p.totalLength > 0.001
    );
    
    const pathsToUse = eligiblePaths.length > 0 ? eligiblePaths : this.streetPaths.filter(p => p.totalLength > 0.001);
    if (pathsToUse.length === 0) {
      console.log('🚨 No paths available for emergency vehicle!');
      return;
    }
    
    const path = pathsToUse[Math.floor(Math.random() * pathsToUse.length)];
    const reverse = Math.random() > 0.5;
    const isPolice = Math.random() > 0.5;
    
    this.emergencyVehicle = {
      path: path,
      progress: reverse ? 1 : 0,
      speed: this.CONFIG.carSpeed * this.CONFIG.emergencySpeedMultiplier,
      direction: reverse ? -1 : 1,
      vehicleType: isPolice ? 'police' : 'ambulance',
      flashPhase: 0,
      spinPhase: 0
    };
    
    console.log(`🚨 Emergency ${this.emergencyVehicle.vehicleType} dispatched!`);
  }
  
  scheduleEmergencySpawn() {
    const delay = this.CONFIG.emergencySpawnMin + 
      Math.random() * (this.CONFIG.emergencySpawnMax - this.CONFIG.emergencySpawnMin);
    
    this.emergencySpawnTimer = setTimeout(() => {
      if (this.isAnimating) {
        this.spawnEmergencyVehicle();
        this.scheduleEmergencySpawn();
      }
    }, delay);
  }
  
  // Drawing functions
  drawEmergencyVehicle(ctx, pos, angle, vehicle) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    
    const finalAngle = vehicle.direction === 1 ? angle + Math.PI : angle;
    ctx.rotate(finalAngle);
    
    const flashState = Math.floor(vehicle.flashPhase) % 2;
    const primaryColor = flashState === 0 ? '#ff0000' : '#0055ff';
    const secondaryColor = flashState === 0 ? '#0055ff' : '#ff0000';
    
    // SPINNING LIGHT BEAM
    ctx.globalCompositeOperation = 'lighter';
    const beamAngle = vehicle.spinPhase;
    const beamLength = this.CONFIG.emergencyLightRadius;
    
    // Red beam
    ctx.save();
    ctx.rotate(beamAngle);
    const redGrad = ctx.createLinearGradient(0, 0, beamLength, 0);
    redGrad.addColorStop(0, 'rgba(255, 80, 80, 0.6)');
    redGrad.addColorStop(0.3, 'rgba(255, 0, 0, 0.3)');
    redGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = redGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(beamLength, -beamLength * 0.5);
    ctx.lineTo(beamLength, beamLength * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    
    // Blue beam (opposite direction)
    ctx.save();
    ctx.rotate(beamAngle + Math.PI);
    const blueGrad = ctx.createLinearGradient(0, 0, beamLength, 0);
    blueGrad.addColorStop(0, 'rgba(80, 120, 255, 0.6)');
    blueGrad.addColorStop(0.3, 'rgba(0, 80, 255, 0.3)');
    blueGrad.addColorStop(1, 'rgba(0, 80, 255, 0)');
    ctx.fillStyle = blueGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(beamLength, -beamLength * 0.5);
    ctx.lineTo(beamLength, beamLength * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    
    // 2. CENTER LIGHT ORBS (Flashing)
    ctx.globalCompositeOperation = 'lighter';
    
    // Primary color (flashing)
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Secondary color (opposite side)
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // 3. BODY (Simple rectangle)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = vehicle.vehicleType === 'police' ? '#1a3a5a' : '#5a3a2a';
    ctx.fillRect(-6, -5, 12, 10);
    
    // 4. WINDSHIELD
    ctx.strokeStyle = '#4488cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(4, -4);
    ctx.stroke();
    
    ctx.restore();
  }
  
  updateStreetLifeEntities() {
    const spawnThreshold = 0.15;
    
    // Update vehicles
    this.vehicles = this.vehicles.filter(v => {
      if (!v.path) return false;
      
      v.progress += (v.direction * v.speed * v.speedVar) / 60;
      
      if (v.progress >= 1 || v.progress <= 0) {
        return false;
      }
      
      if (v.type === 'bus') {
        if (Math.random() < 0.01) {
          v.isAtStop = !v.isAtStop;
          v.stopTimer = 0.5;
        }
        if (v.isAtStop) {
          v.stopTimer -= 1 / 60;
          if (v.stopTimer <= 0) {
            v.isAtStop = false;
          }
          v.speed = v.speed * 0.95;
        } else {
          v.speed = this.CONFIG.busSpeed * (0.9 + Math.random() * 0.2);
        }
      }
      
      return true;
    });
    
    // Update pedestrians
    this.pedestrians = this.pedestrians.filter(p => {
      if (!p.path) return false;
      
      p.progress += (p.direction * p.speed) / 60;
      p.wobblePhase += 0.1;
      
      if (p.progress >= 1 || p.progress <= 0) {
        return false;
      }
      
      return true;
    });
    
    // Update emergency vehicle
    if (this.emergencyVehicle) {
      this.emergencyVehicle.progress += (this.emergencyVehicle.direction * this.emergencyVehicle.speed) / 60;
      this.emergencyVehicle.flashPhase += this.CONFIG.emergencyFlashRate / 60;
      this.emergencyVehicle.spinPhase += Math.PI * 2 * (this.CONFIG.emergencyFlashRate / 10) / 60;
      
      if (this.emergencyVehicle.progress >= 1 || this.emergencyVehicle.progress <= 0) {
        this.emergencyVehicle = null;
      }
    }
    
    // Spawn new entities
    if (Math.random() < spawnThreshold) this.spawnCar();
    if (Math.random() < spawnThreshold * 0.4) this.spawnBus();
    if (Math.random() < spawnThreshold * 0.3) this.spawnTaxi();
    if (Math.random() < spawnThreshold * 0.6) this.spawnBicycle();
    if (Math.random() < spawnThreshold * 4) this.spawnPedestrian();
  }
  
  drawCar(ctx, pos, angle, colors, headlightsOn, direction = 1) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const finalAngle = direction === 1 ? angle + Math.PI : angle;
    ctx.rotate(finalAngle);
    
    const length = this.CONFIG.carLength;
    const width = this.CONFIG.carWidth;
    
    // Body
    ctx.fillStyle = colors.body;
    ctx.shadowColor = colors.body;
    ctx.shadowBlur = 15;
    ctx.fillRect(-length / 2, -width / 2, length, width);
    
    // Headlights
    if (headlightsOn) {
      ctx.fillStyle = colors.headlight;
      ctx.shadowColor = colors.headlight;
      ctx.shadowBlur = 8;
      ctx.fillRect(length / 2 - 2, -width / 3, 3, width / 3 - 1);
      ctx.fillRect(length / 2 - 2, 1, 3, width / 3 - 1);
    }
    
    // Taillights
    ctx.fillStyle = colors.taillight;
    ctx.shadowColor = colors.taillight;
    ctx.shadowBlur = 8;
    ctx.fillRect(-length / 2 - 2, -width / 3, 3, width / 3 - 1);
    ctx.fillRect(-length / 2 - 2, 1, 3, width / 3 - 1);
    
    ctx.restore();
  }
  
  drawBus(ctx, pos, angle, colors, isAtStop, direction = 1) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const finalAngle = direction === 1 ? angle + Math.PI : angle;
    ctx.rotate(finalAngle);
    
    const length = this.CONFIG.busLength;
    const width = this.CONFIG.busWidth;
    
    // Body
    ctx.fillStyle = colors.body;
    ctx.shadowColor = colors.body;
    ctx.shadowBlur = 15;
    ctx.fillRect(-length / 2, -width / 2, length, width);
    
    // Windows
    ctx.fillStyle = colors.windows;
    const windowWidth = 3;
    const windowHeight = width - 2;
    for (let i = -length / 2 + 3; i < length / 2 - 3; i += 4) {
      ctx.fillRect(i, -windowHeight / 2, windowWidth, windowHeight);
    }
    
    // Window lights
    ctx.fillStyle = colors.lights;
    ctx.shadowColor = colors.lights;
    ctx.shadowBlur = 10;
    for (let i = -length / 2 + 3; i < length / 2 - 3; i += 4) {
      ctx.fillRect(i, -windowHeight / 2, windowWidth, windowHeight);
    }
    
    // Bus stop indicator
    if (isAtStop) {
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(-length / 2, -width / 2 - 2, length, width + 4);
      ctx.globalAlpha = 1.0;
    }
    
    ctx.restore();
  }
  
  drawPedestrian(ctx, pos, wobblePhase, color, size) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  drawTaxi(ctx, pos, angle, colors, isAvailable, direction = 1) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const finalAngle = direction === 1 ? angle + Math.PI : angle;
    ctx.rotate(finalAngle);
    
    const length = this.CONFIG.carLength;
    const width = this.CONFIG.carWidth;
    
    // Body
    ctx.fillStyle = colors.body;
    ctx.shadowColor = colors.body;
    ctx.shadowBlur = 15;
    ctx.fillRect(-length / 2, -width / 2, length, width);
    
    // Taxi light sign
    ctx.fillStyle = colors.sign;
    ctx.globalAlpha = isAvailable ? 0.8 : 0.2;
    ctx.shadowColor = colors.sign;
    ctx.shadowBlur = isAvailable ? 12 : 4;
    ctx.fillRect(-2, -width / 2 - 3, 4, 2);
    ctx.globalAlpha = 1.0;
    
    // Headlights
    ctx.fillStyle = colors.headlight;
    ctx.shadowColor = colors.headlight;
    ctx.shadowBlur = 8;
    ctx.fillRect(length / 2 - 2, -width / 3, 3, width / 3 - 1);
    ctx.fillRect(length / 2 - 2, 1, 3, width / 3 - 1);
    
    ctx.restore();
  }
  
  drawBicycle(ctx, pos, angle, colors, pedalPhase, direction = 1) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const finalAngle = direction === 1 ? angle + Math.PI : angle;
    ctx.rotate(finalAngle);
    
    const length = this.CONFIG.bicycleLength;
    const width = this.CONFIG.bicycleWidth;
    
    // Frame
    ctx.strokeStyle = colors.frame;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = colors.frame;
    ctx.shadowBlur = 10;
    
    ctx.beginPath();
    ctx.moveTo(-length / 2, 0);
    ctx.lineTo(length / 2, 0);
    ctx.stroke();
    
    // Wheels (circles)
    ctx.beginPath();
    ctx.arc(-length / 2, 0, 2, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(length / 2, 0, 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Rider
    ctx.fillStyle = colors.rider;
    ctx.fillRect(-1, -3, 2, 3);
    
    ctx.restore();
  }
  
  drawDataComet(ctx, pos, angle, color, direction = 1) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const finalAngle = direction === 1 ? angle + Math.PI : angle;
    ctx.rotate(finalAngle);
    
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
  
  drawStreetLife() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    // Prepare for drawing
    this.ctx.globalCompositeOperation = 'source-over';
    
    // Get map bearing
    const mapBearing = (this.map.getBearing() || 0) * (Math.PI / 180);
    
    // Draw streetlights
    this.ctx.globalCompositeOperation = 'lighter';
    this.drawStreetlights(this.ctx, width, height);
    
    // Draw buildings
    this.drawBuildings(this.ctx, width, height);
    
    // Draw vehicles
    this.vehicles.forEach(v => {
      const point = this.getPointAlongPath(v.path, v.progress);
      if (!point) return;
      const pos = this.projectToStreetLifeCanvas(point.lng, point.lat);
      
      if (!this.isOnScreen(pos, width, height)) return;
      
      const screenAngle = -point.angle + mapBearing;
      
      if (v.type === 'car') {
        this.drawFastLight(this.ctx, pos, screenAngle, v.colors.body, 25, 8, v.direction);
      } else if (v.type === 'taxi') {
        this.drawFastLight(this.ctx, pos, screenAngle, v.colors.body, 25, 8, v.direction);
      } else if (v.type === 'bus') {
        this.drawFastLight(this.ctx, pos, screenAngle, v.colors.body, 35, 12, v.direction);
      } else if (v.type === 'bicycle') {
        this.drawFastLight(this.ctx, pos, screenAngle, v.colors.frame, 10, 4, v.direction);
      }
    });
    
    // Draw emergency vehicle
    if (this.emergencyVehicle) {
      const ePoint = this.getPointAlongPath(this.emergencyVehicle.path, this.emergencyVehicle.progress);
      if (ePoint) {
        const ePos = this.projectToStreetLifeCanvas(ePoint.lng, ePoint.lat);
        if (this.isOnScreen(ePos, width, height)) {
          const eAngle = -ePoint.angle + mapBearing;
          this.drawEmergencyVehicle(this.ctx, ePos, eAngle, this.emergencyVehicle);
        }
      }
    }
    
    // Draw pedestrians
    this.ctx.globalCompositeOperation = 'source-over';
    
    this.pedestrians.forEach(p => {
      const point = this.getPointAlongPath(p.path, p.progress);
      if (!point) return;
      
      const offsetMag = Math.sin(p.wobblePhase) * 1.5;
      const perpAngle = -point.angle + mapBearing + Math.PI / 2;
      const offsetX = Math.cos(perpAngle) * offsetMag;
      const offsetY = Math.sin(perpAngle) * offsetMag;
      
      const pos = this.projectToStreetLifeCanvas(point.lng, point.lat);
      
      if (!this.isOnScreen(pos, width, height)) return;
      
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(pos.x + offsetX, pos.y + offsetY, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
    });
    
    this.ctx.globalCompositeOperation = 'source-over';
  }
  
  generateStreetlights() {
    this.streetlights = [];
    
    this.streetPaths.forEach(path => {
      if (path.totalLength < 0.001) return;
      
      for (let dist = 0; dist < path.totalLength; dist += this.CONFIG.streetlightSpacing) {
        const progress = dist / path.totalLength;
        const point = this.getPointAlongPath(path, progress);
        
        if (!point) continue;
        
        this.streetlights.push({
          lng: point.lng,
          lat: point.lat,
          radius: this.CONFIG.streetlightRadius,
          intensity: 0.6 + Math.random() * 0.2
        });
      }
    });
    
    console.log(`✓ Street Life: Generated ${this.streetlights.length} streetlights`);
  }
  
  drawStreetlights(ctx, width, height) {
    this.streetlights.forEach(light => {
      const pos = this.projectToStreetLifeCanvas(light.lng, light.lat);
      
      if (!this.isOnScreen(pos, width, height)) return;
      
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, light.radius);
      gradient.addColorStop(0, this.CONFIG.streetlightColor.replace('0.6', String(light.intensity)));
      gradient.addColorStop(1, 'rgba(255, 210, 150, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, light.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  
  loadBuildingFootprints() {
    this.buildings = [];
    
    if (!this.streetLifeData || !this.streetLifeData.features) {
      console.log('No building data available');
      return;
    }
    
    this.streetLifeData.features.forEach((feature, idx) => {
      if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0];
        const bounds = ring.reduce((acc, [lng, lat]) => ({
          minLng: Math.min(acc.minLng, lng),
          maxLng: Math.max(acc.maxLng, lng),
          minLat: Math.min(acc.minLat, lat),
          maxLat: Math.max(acc.maxLat, lat)
        }), {
          minLng: Infinity,
          maxLng: -Infinity,
          minLat: Infinity,
          maxLat: -Infinity
        });
        
        this.buildings.push({
          coords: ring,
          bounds: bounds,
          flickering: false,
          flickerIntensity: 0
        });
      }
    });
    
    this.buildingFlickerStates = new Array(this.buildings.length).fill(0);
    console.log(`✓ Street Life: Loaded ${this.buildings.length} buildings`);
  }
  
  drawBuildings(ctx, width, height) {
    this.buildings.forEach((building, idx) => {
      // Building flicker effect
      if (Math.random() < this.CONFIG.buildingFlickerChance) {
        this.buildingFlickerStates[idx] = 1;
      }
      
      if (this.buildingFlickerStates[idx] > 0) {
        this.buildingFlickerStates[idx] *= 0.95;
      }
      
      const intensity = this.buildingFlickerStates[idx];
      
      building.coords.forEach((coord, i) => {
        const nextCoord = building.coords[(i + 1) % building.coords.length];
        
        const pos1 = this.projectToStreetLifeCanvas(coord[0], coord[1]);
        const pos2 = this.projectToStreetLifeCanvas(nextCoord[0], nextCoord[1]);
        
        if (!this.isOnScreen(pos1, width, height) && !this.isOnScreen(pos2, width, height)) return;
        
        ctx.strokeStyle = this.CONFIG.buildingGlowColor.replace('0.25', String(0.25 + intensity * 0.3));
        ctx.lineWidth = this.CONFIG.buildingGlowWidth;
        ctx.lineDashOffset = (Date.now() % 1000) / 100;
        ctx.setLineDash([this.CONFIG.buildingDashLength, this.CONFIG.buildingGapLength]);
        
        ctx.beginPath();
        ctx.moveTo(pos1.x, pos1.y);
        ctx.lineTo(pos2.x, pos2.y);
        ctx.stroke();
      });
      
      ctx.setLineDash([]);
    });
  }
  
  drawFastLight(ctx, pos, angle, color, length, width, direction = 1) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const finalAngle = direction === 1 ? angle + Math.PI : angle;
    ctx.rotate(finalAngle);
    
    ctx.globalCompositeOperation = 'lighter';
    
    // Gradient glow
    const gradient = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
    gradient.addColorStop(0, color + '55');
    gradient.addColorStop(0.5, color + 'cc');
    gradient.addColorStop(1, color + '55');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(-length / 2, -width / 2, length, width);
    
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    
    // Bright core
    const coreGrad = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
    coreGrad.addColorStop(0.2, color + '00');
    coreGrad.addColorStop(0.5, color + 'ff');
    coreGrad.addColorStop(0.8, color + '00');
    
    ctx.fillStyle = coreGrad;
    ctx.fillRect(-length / 2, -width / 2 + 2, length, width - 4);
    
    ctx.restore();
  }
  
  isOnScreen(pos, w, h) {
    return pos.x > -50 && pos.x < w + 50 && pos.y > -50 && pos.y < h + 50;
  }
  
  animateStreetLife() {
    if (!this.isAnimating) return;
    
    this.updateStreetLifeEntities();
    this.drawStreetLife();
    
    this.animationFrame = requestAnimationFrame(() => this.animateStreetLife());
  }
  
  startSpawning() {
    this.spawnInterval = setInterval(() => {
      if (this.isAnimating) {
        this.spawnCar();
        this.spawnBus();
        this.spawnTaxi();
        this.spawnBicycle();
        this.spawnPedestrian();
      }
    }, this.CONFIG.spawnInterval);
  }
  
  stopSpawning() {
    if (this.spawnInterval) {
      clearInterval(this.spawnInterval);
      this.spawnInterval = null;
    }
  }
  
  resizeStreetLifeCanvas() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    const rect = mapContainer.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }
  
  fadeInCitySound() {
    if (!this.cityAmbientAudio) {
      this.cityAmbientAudio = new Audio('media/city-ambient.mp3');
      this.cityAmbientAudio.loop = true;
      this.cityAmbientAudio.volume = 0;
    }
    
    this.cityAmbientAudio.play().catch(err => {
      console.log('Could not play city ambient audio:', err);
    });
    
    if (this.audioFadeInterval) clearInterval(this.audioFadeInterval);
    
    let step = 0;
    this.audioFadeInterval = setInterval(() => {
      step++;
      const progress = step / this.AUDIO_FADE_STEPS;
      this.cityAmbientAudio.volume = progress * this.AUDIO_MAX_VOLUME;
      
      if (step >= this.AUDIO_FADE_STEPS) {
        clearInterval(this.audioFadeInterval);
        this.audioFadeInterval = null;
      }
    }, this.AUDIO_FADE_DURATION / this.AUDIO_FADE_STEPS);
  }
  
  fadeOutCitySound() {
    if (!this.cityAmbientAudio) return;
    
    if (this.audioFadeInterval) clearInterval(this.audioFadeInterval);
    
    let step = 0;
    this.audioFadeInterval = setInterval(() => {
      step++;
      const progress = 1 - (step / this.AUDIO_FADE_STEPS);
      this.cityAmbientAudio.volume = progress * this.AUDIO_MAX_VOLUME;
      
      if (step >= this.AUDIO_FADE_STEPS) {
        this.cityAmbientAudio.pause();
        this.cityAmbientAudio.currentTime = 0;
        clearInterval(this.audioFadeInterval);
        this.audioFadeInterval = null;
      }
    }, this.AUDIO_FADE_DURATION / this.AUDIO_FADE_STEPS);
  }
  
  isAnyVisualizationActive() {
    const visualizations = [
      'cfdSimulation',
      'gridAnimation',
      'isovistView',
      'stormwaterFlow',
      'sunStudy',
      'streetGlowAnimation',
      'trafikAnimation'
    ];
    
    return visualizations.some(name => {
      const obj = window[name];
      return obj && typeof obj.isActive === 'function' && obj.isActive();
    });
  }
  
  updateStreetLifeVisibility() {
    if (this.isAnyVisualizationActive()) {
      this.stopStreetLifeAnimation();
    } else {
      this.startStreetLifeAnimation();
    }
  }
  
  setupVisibilityObserver() {
    const callback = (mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          this.updateStreetLifeVisibility();
        }
      });
    };
    
    const observer = new MutationObserver(callback);
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
    });
  }
  
  startStreetLifeAnimation() {
    if (this.isAnimating) return;
    
    this.loadStreetLifeData().then(() => {
      if (this.streetPaths.length === 0) {
        console.warn('Street Life: No paths available for animation');
        return;
      }
      
      this.isAnimating = true;
      this.canvas.style.display = 'block';
      this.resizeStreetLifeCanvas();
      
      this.fadeInCitySound();
      
      this.vehicles = [];
      this.pedestrians = [];
      this.emergencyVehicle = null;
      this.buildingFlickerStates = [];
      
      this.startSpawning();
      
      setTimeout(() => {
        if (this.isAnimating) {
          console.log('🚨 Attempting to spawn first emergency vehicle...');
          this.spawnEmergencyVehicle();
          this.scheduleEmergencySpawn();
        }
      }, 1000);
      
      this.animateStreetLife();
      
      if (window.trafikAnimation) {
        window.trafikAnimation.start();
      }
      
      console.log('Street Life animation started');
    });
  }
  
  stopStreetLifeAnimation() {
    this.isAnimating = false;
    this.canvas.style.display = 'none';
    this.stopSpawning();
    
    this.fadeOutCitySound();
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.vehicles = [];
    this.pedestrians = [];
    this.emergencyVehicle = null;
    if (this.emergencySpawnTimer) {
      clearTimeout(this.emergencySpawnTimer);
      this.emergencySpawnTimer = null;
    }
    
    if (window.trafikAnimation) {
      window.trafikAnimation.stop();
    }
    
    console.log('Street Life animation stopped');
  }
  
  handleResize() {
    if (this.isAnimating) {
      this.resizeStreetLifeCanvas();
    }
  }
}

// Initialize and export
let streetLifeAnimation = null;

function initStreetLife() {
  if (!streetLifeAnimation && window.map) {
    streetLifeAnimation = new StreetLifeAnimation(window.map);
    
    // Expose globally for backward compatibility
    window.streetLifeAnimation = {
      start: () => streetLifeAnimation.start(),
      stop: () => streetLifeAnimation.stop(),
      isActive: () => streetLifeAnimation.isActive(),
      updateVisibility: () => streetLifeAnimation.updateStreetLifeVisibility(),
      toggle: () => streetLifeAnimation.toggle()
    };
    
    streetLifeAnimation.setupVisibilityObserver();
    
    window.addEventListener('resize', streetLifeAnimation.handleResize);
    
    // Start animation after a delay
    setTimeout(() => {
      if (!streetLifeAnimation.isAnyVisualizationActive()) {
        streetLifeAnimation.startStreetLifeAnimation();
      }
    }, 2500);
  }
}

// Wait for DOM and map to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStreetLife);
} else {
  setTimeout(initStreetLife, 1000);
}

console.log('Street Life animation module loaded');

// Export the class for use as a module
export { StreetLifeAnimation };
