// Interactive Isovist (Viewshed) Visualization
// Real-time visibility polygon calculation with draggable viewer
// Version: 1.4 - with Street View camera trail
// Refactored to ES6 class-based module

class IsovistAnimation {
  constructor(map) {
    // Initialize map
    this.map = map;

    // Channel for communication
    this.isovistChannel = new BroadcastChannel('map_controller_channel');
    
    // Core state
    this.isovistActive = false;
    this.viewerPosition = null;
    this.cursorPosition = null;
    this.obstacles = []; // Flattened list of polygon rings with bboxes
    this.isDragging = false;
    this.updateRequestId = null;
    this.animationFrameId = null;

    // Visualization parameters
    this.MAX_VIEW_DISTANCE = 200; // meters
    this.RAY_COUNT = 360; // number of rays to cast
    this.HUMAN_FOV = 120; // human field of view in degrees (120° total, 60° each side)
    this.USE_HUMAN_FOV = true; // set to false for full 360° view
    this.FOLLOW_CURSOR = true; // viewer follows cursor when it moves far enough
    this.FOLLOW_THRESHOLD = 50; // distance in meters before viewer starts following
    this.FOLLOW_SPEED = 0.15; // how fast viewer follows (0-1, higher = faster)
    
    // Tree obstacle settings
    this.treeObstacles = []; // Circular obstacles from trees
    this.TREE_BASE_RADIUS = 2; // Base radius in meters for tree canopy
    this.TREE_RADIUS_VARIATION = 1.5; // Random variation in meters
    this.TREE_HEIGHT_FACTOR = 0.3; // Additional radius per meter of height
    this.INCLUDE_TREES = true; // Toggle tree obstacles in view analysis
    
    // Path history for trace
    this.pathHistory = [];
    this.MAX_PATH_POINTS = 500;
    this.MIN_PATH_DISTANCE = 2; // minimum meters between path points
    
    // Street View actual camera position trail
    this.streetViewApiKey = null;
    this.actualCameraPosition = null;
    this.cameraHistory = [];
    this.MAX_CAMERA_HISTORY = 12;
    this.lastMetadataFetch = null;
    this.METADATA_FETCH_DISTANCE = 5; // meters between fetches
    
    // Street View position broadcast throttling
    this.lastBroadcastPosition = null;
    this.lastBroadcastHeading = null;
    this.BROADCAST_MIN_DISTANCE = 3; // minimum meters between broadcasts
    this.BROADCAST_MIN_HEADING_CHANGE = 15; // minimum degrees before heading update
    
    // Ambient soundscape settings
    this.ambientAudioContext = null;
    this.ambientSoundEnabled = true; // Toggle for ambient sound
    this.MAX_AMBIENT_VOLUME = 0.5; // Cap volume at 50%
    this.VOLUME_SMOOTHING = 0.1; // How fast volume changes (0-1, lower = smoother)
    this.audioUnlocked = false; // Track if user has interacted (for autoplay policy)
    this.pendingAudioStart = false; // Track if we're waiting to start audio
    
    // Nature sounds (bird sounds)
    this.natureSounds = [
      'media/sound/XC372879 - Thrush Nightingale - Luscinia luscinia.mp3',
      'media/sound/XC647538 - European Pied Flycatcher - Ficedula hypoleuca.mp3',
      'media/sound/XC900416 - Black Redstart - Phoenicurus ochruros.mp3'
    ];
    
    // City/urban sounds
    this.citySounds = [
      'media/sound/city.mp3'
    ];
    
    // Active audio elements and gain nodes
    this.natureAudio = null;
    this.cityAudio = null;
    this.natureGainNode = null;
    this.cityGainNode = null;
    this.currentNatureSoundIndex = 0;
    this.currentGreenViewFactor = 0; // 0 = no trees, 1 = all trees
    this.targetNatureVolume = 0;
    this.targetCityVolume = 0;
    this.volumeAnimationFrame = null;

    // Communication channel
    this.channel = new BroadcastChannel('map_controller_channel');

    // Load API key asynchronously
    this.loadStreetViewApiKey();

    // Setup audio unlock on user interaction
    this.setupAudioUnlock();

    // Bind event handlers
    this.handleMapClick = this.onMapClick.bind(this);
    this.handleMapMouseMove = this.onMapMouseMove.bind(this);
    this.handleViewerMouseDown = this.onViewerMouseDown.bind(this);
    this.handleViewerMouseUp = this.onViewerMouseUp.bind(this);
  }

  // ============================================
  // PUBLIC INTERFACE
  // ============================================

  start() {
    this.activateIsovist();
  }

  stop() {
    this.deactivateIsovist();
  }

  toggle() {
    this.toggleIsovist();
  }

  // ============================================
  // INITIALIZATION & LIFECYCLE
  // ============================================

  async loadStreetViewApiKey() {
    const paths = ['trafik-config.json', './trafik-config.json'];
    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const config = await response.json();
          const key = config.streetViewApiKey || config.googleMapsApiKey;
          if (key) {
            this.streetViewApiKey = key;
            console.log('Isovist: Street View API key loaded');
            return;
          }
        }
      } catch (e) { /* try next */ }
    }
    console.warn('Isovist: Could not load Street View API key');
  }

  // ============================================
  // AMBIENT SOUNDSCAPE SYSTEM
  // Based on Green View Factor (GVF)
  // ============================================

  initAmbientAudio() {
    if (this.ambientAudioContext) return; // Already initialized
    if (!this.audioUnlocked) return; // Don't init until user gesture
    
    try {
      this.ambientAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create nature audio (pick a random bird sound to start)
      this.currentNatureSoundIndex = Math.floor(Math.random() * this.natureSounds.length);
      this.natureAudio = new Audio(this.natureSounds[this.currentNatureSoundIndex]);
      this.natureAudio.loop = true;
      
      // Create city audio
      this.cityAudio = new Audio(this.citySounds[0]);
      this.cityAudio.loop = true;
      
      // Create gain nodes for volume control
      const natureSource = this.ambientAudioContext.createMediaElementSource(this.natureAudio);
      this.natureGainNode = this.ambientAudioContext.createGain();
      this.natureGainNode.gain.value = 0;
      natureSource.connect(this.natureGainNode);
      this.natureGainNode.connect(this.ambientAudioContext.destination);
      
      const citySource = this.ambientAudioContext.createMediaElementSource(this.cityAudio);
      this.cityGainNode = this.ambientAudioContext.createGain();
      this.cityGainNode.gain.value = 0;
      citySource.connect(this.cityGainNode);
      this.cityGainNode.connect(this.ambientAudioContext.destination);
      
      // Handle nature audio ending to switch to next bird sound
      this.natureAudio.addEventListener('ended', () => this.switchNatureSound());
      
      console.log('Ambient audio initialized');
    } catch (e) {
      console.warn('Failed to initialize ambient audio:', e);
      this.ambientAudioContext = null;
    }
  }

  switchNatureSound() {
    if (!this.natureAudio || !this.ambientAudioContext) return;
    
    // Pick a different bird sound
    const prevIndex = this.currentNatureSoundIndex;
    do {
      this.currentNatureSoundIndex = Math.floor(Math.random() * this.natureSounds.length);
    } while (this.currentNatureSoundIndex === prevIndex && this.natureSounds.length > 1);
    
    // Update source and restart
    this.natureAudio.src = this.natureSounds[this.currentNatureSoundIndex];
    if (this.targetNatureVolume > 0 && this.audioUnlocked) {
      this.natureAudio.play().catch(e => console.warn('Nature sound play failed:', e));
    }
  }

  startAmbientAudio() {
    // If user hasn't interacted yet, mark as pending and wait
    if (!this.audioUnlocked) {
      this.pendingAudioStart = true;
      console.log('Ambient audio pending - waiting for user interaction');
      return;
    }
    
    if (!this.ambientAudioContext) {
      this.initAmbientAudio();
    }
    
    if (!this.ambientAudioContext) return; // Failed to initialize
    
    // Resume audio context if suspended (browser autoplay policy)
    if (this.ambientAudioContext.state === 'suspended') {
      this.ambientAudioContext.resume().catch(e => console.warn('Audio context resume failed:', e));
    }
    
    // Start both audio streams (they start muted, volume controlled by GVF)
    this.natureAudio.play().catch(e => console.warn('Nature audio play failed:', e));
    this.cityAudio.play().catch(e => console.warn('City audio play failed:', e));
    
    // Start volume animation loop
    if (!this.volumeAnimationFrame) {
      this.animateVolumes();
    }
    
    this.pendingAudioStart = false;
    console.log('Ambient audio started');
  }

  stopAmbientAudio() {
    if (this.volumeAnimationFrame) {
      cancelAnimationFrame(this.volumeAnimationFrame);
      this.volumeAnimationFrame = null;
    }
    
    if (this.natureAudio) {
      this.natureAudio.pause();
      this.natureAudio.currentTime = 0;
    }
    if (this.cityAudio) {
      this.cityAudio.pause();
      this.cityAudio.currentTime = 0;
    }
    
    if (this.natureGainNode) this.natureGainNode.gain.value = 0;
    if (this.cityGainNode) this.cityGainNode.gain.value = 0;
    
    this.targetNatureVolume = 0;
    this.targetCityVolume = 0;
    this.currentGreenViewFactor = 0;
    
    console.log('Ambient audio stopped');
  }

  updateAmbientSoundscape(gvf) {
    // gvf: 0 = no trees visible (city sound), 1 = all trees (nature sound)
    this.currentGreenViewFactor = gvf;
    
    // Calculate target volumes based on GVF
    // High GVF = more nature, less city
    // Low GVF = more city, less nature
    // Both capped at MAX_AMBIENT_VOLUME (0.5)
    
    this.targetNatureVolume = gvf * this.MAX_AMBIENT_VOLUME;
    this.targetCityVolume = (1 - gvf) * this.MAX_AMBIENT_VOLUME;
    
    // Ensure minimum volume for active sound to keep some ambiance
    const minVolume = 0.05;
    if (gvf > 0.1) {
      this.targetNatureVolume = Math.max(this.targetNatureVolume, minVolume);
    }
    if (gvf < 0.9) {
      this.targetCityVolume = Math.max(this.targetCityVolume, minVolume);
    }
  }

  animateVolumes() {
    if (!this.ambientAudioContext || !this.isovistActive) {
      this.volumeAnimationFrame = null;
      return;
    }
    
    // Smoothly interpolate current volumes towards targets
    if (this.natureGainNode) {
      const currentNature = this.natureGainNode.gain.value;
      const newNature = currentNature + (this.targetNatureVolume - currentNature) * this.VOLUME_SMOOTHING;
      this.natureGainNode.gain.setValueAtTime(newNature, this.ambientAudioContext.currentTime);
    }
    
    if (this.cityGainNode) {
      const currentCity = this.cityGainNode.gain.value;
      const newCity = currentCity + (this.targetCityVolume - currentCity) * this.VOLUME_SMOOTHING;
      this.cityGainNode.gain.setValueAtTime(newCity, this.ambientAudioContext.currentTime);
    }
    
    this.volumeAnimationFrame = requestAnimationFrame(() => this.animateVolumes());
  }

  setupAudioUnlock() {
    // Only add listeners once per window (use a static flag)
    if (IsovistAnimation.audioUnlockSetup) return;
    IsovistAnimation.audioUnlockSetup = true;

    const unlockAudio = () => {
      // Mark audio as unlocked globally (affects all instances)
      document.documentElement.dataset.audioUnlocked = 'true';
      
      // Update all instances if they exist
      if (window.isovistInstances) {
        window.isovistInstances.forEach(instance => {
          instance.audioUnlocked = true;
          console.log('Audio unlocked by user gesture');
          
          // Resume existing context if any
          if (instance.ambientAudioContext && instance.ambientAudioContext.state === 'suspended') {
            instance.ambientAudioContext.resume();
          }
          
          // If audio was waiting to start, start it now
          if (instance.pendingAudioStart && instance.isovistActive && instance.ambientSoundEnabled) {
            instance.startAmbientAudio();
          }
        });
      }
    };
    
    // Listen for user interactions (only once globally)
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    
    // Register this instance
    if (!window.isovistInstances) window.isovistInstances = [];
    window.isovistInstances.push(this);
  }

  broadcastIsovistStats(stats) {
    this.channel.postMessage({
      type: 'isovist_stats',
      data: stats
    });
    
    // Update ambient soundscape based on green view factor
    if (this.ambientSoundEnabled && stats.totalRays > 0) {
      // Calculate green view factor: ratio of tree rays to total rays
      const gvf = stats.treeRays / stats.totalRays;
      this.updateAmbientSoundscape(gvf);
    }
  }

  // ============================================
  // MAIN CONTROL METHODS
  // ============================================

  initIsovist() {
    console.log('Initializing Isovist...');
    if (!this.map || !this.map.loaded()) {
      console.warn('Map not ready');
      return;
    }
    
    // Load building obstacles
    this.loadBuildingObstacles();
    
    // Setup UI
    this.setupUIControls();
    
    console.log('Isovist initialized');
  }

  toggleIsovist() {
    if (this.isovistActive) {
      this.deactivateIsovist();
    } else {
      this.activateIsovist();
    }
  }

  activateIsovist() {
    if (this.isovistActive) return;
    
    console.log('Activating Isovist');
    this.isovistActive = true;
    
    // Initialize starting position to map center
    const center = this.map.getCenter();
    this.viewerPosition = [center.lng, center.lat];
    this.cursorPosition = this.viewerPosition;
    
    // Add map layers for visualization
    this.setupVisualizationLayers();
    
    // Add event listeners
    this.map.on('click', this.handleMapClick);
    this.map.on('mousemove', this.handleMapMouseMove);
    
    // Start animation loop
    this.updateVisualization();
    
    // Start ambient audio if enabled
    if (this.ambientSoundEnabled) {
      this.startAmbientAudio();
    }
    
    // Log statistics
    console.log('Isovist activated');
  }

  deactivateIsovist() {
    if (!this.isovistActive) return;
    
    console.log('Deactivating Isovist');
    this.isovistActive = false;
    
    // Stop animation
    if (this.updateRequestId) {
      cancelAnimationFrame(this.updateRequestId);
      this.updateRequestId = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Remove event listeners
    this.map.off('click', this.handleMapClick);
    this.map.off('mousemove', this.handleMapMouseMove);
    
    // Remove map layers
    this.removeVisualizationLayers();
    
    // Stop ambient audio
    this.stopAmbientAudio();
    
    // Clear path history
    this.pathHistory = [];
    this.cameraHistory = [];
    
    console.log('Isovist deactivated');
  }

  setupUIControls() {
    // Setup any UI controls needed
    // This can be extended in subclasses
  }

  setupVisualizationLayers() {
    // Add layers to map for visualization
    // This method sets up GeoJSON sources and layers
    const sourceId = 'isovist-source';
    const layerId = 'isovist-layer';
    
    if (!this.map.getSource(sourceId)) {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      this.map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#088',
          'fill-opacity': 0.4
        }
      });
    }
    
    // Add other visualization layers as needed
  }

  removeVisualizationLayers() {
    const sourceId = 'isovist-source';
    const layerId = 'isovist-layer';
    
    try {
      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }
    } catch (e) {
      console.warn('Error removing visualization layers:', e);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onMapClick(e) {
    if (!this.isovistActive) return;
    
    const position = [e.lngLat.lng, e.lngLat.lat];
    const validPosition = this.getValidPosition(position);
    
    if (validPosition) {
      this.viewerPosition = validPosition;
      this.cursorPosition = validPosition;
      this.pathHistory = [];
    }
  }

  onMapMouseMove(e) {
    if (!this.isovistActive || this.isDragging) return;
    
    const position = [e.lngLat.lng, e.lngLat.lat];
    this.cursorPosition = position;
  }

  onViewerMouseDown(e) {
    if (!this.isovistActive) return;
    this.isDragging = true;
  }

  onViewerMouseUp() {
    this.isDragging = false;
  }

  // ============================================
  // VISUALIZATION & UPDATES
  // ============================================

  updateVisualization() {
    if (!this.isovistActive) return;
    
    // Use requestAnimationFrame for updates
    this.updateRequestId = requestAnimationFrame(() => {
      // Check if still active before continuing animation
      if (!this.isovistActive) {
        this.updateRequestId = null;
        return;
      }
      
      this.performUpdate();
      this.updateVisualization();
    });
  }

  performUpdate() {
    // Main update loop
    if (!this.viewerPosition) return;
    
    // Update viewer position based on cursor following
    if (this.FOLLOW_CURSOR && this.cursorPosition) {
      const dist = this.distance(this.viewerPosition, this.cursorPosition);
      if (dist > this.FOLLOW_THRESHOLD) {
        // Move viewer towards cursor
        const bearing = this.calculateBearing(this.viewerPosition, this.cursorPosition);
        const moveDistance = Math.min(dist, this.FOLLOW_SPEED);
        this.viewerPosition = this.destination(this.viewerPosition, moveDistance, bearing);
      }
    }
    
    // Calculate isovist
    const lookDirection = this.calculateBearing(this.viewerPosition, this.cursorPosition || this.viewerPosition);
    const stats = this.calculateIsovistFeatures(this.viewerPosition, lookDirection);
    
    // Broadcast stats
    this.broadcastIsovistStats(stats);
    
    // Update visualization (render to map)
    this.animateOutline();
  }

  animateOutline() {
    // Update the isovist visualization on the map
    // This would render the current polygon outline
  }

  // ============================================
  // OBSTACLE LOADING & PROCESSING
  // ============================================

  async loadBuildingObstacles() {
    try {
      console.log('Loading building obstacles...');
      
      // Try to fetch building data from a GeoJSON source
      // Sources can be overridden via constructor parameter or environment
      const sources = [
        '/data/buildings.geojson',
        // Add custom sources as needed
      ];
      
      // Allow configuration via environment or data attribute
      if (window.ISOVIST_BUILDING_DATA_URL) {
        sources.unshift(window.ISOVIST_BUILDING_DATA_URL);
      }
      
      for (const source of sources) {
        try {
          const response = await fetch(source);
          if (response.ok) {
            const geojson = await response.json();
            this.processGeoJSON(geojson);
            console.log('Building obstacles loaded from:', source);
            return;
          }
        } catch (e) { /* try next */ }
      }
      
      console.warn('Could not load building obstacles - no valid source found');
      console.info('To load obstacles, set window.ISOVIST_BUILDING_DATA_URL or provide a /data/buildings.geojson file');
    } catch (e) {
      console.error('Error loading obstacles:', e);
    }
  }

  processGeoJSON(geojson) {
    if (geojson.type === 'FeatureCollection') {
      geojson.features.forEach(feature => {
        if (feature.geometry.type === 'Polygon') {
          const rings = feature.geometry.coordinates;
          rings.forEach(ring => {
            this.addObstacle(ring, feature.properties);
          });
        }
      });
    }
  }

  addObstacle(ring, properties = {}) {
    if (!ring || ring.length < 3) return;
    
    // Calculate bbox for quick intersection checks
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const point of ring) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
    
    this.obstacles.push({
      ring,
      bbox: { minX, minY, maxX, maxY },
      properties
    });
  }

  // ============================================
  // ISOVIST CALCULATION
  // ============================================

  calculateIsovistFeatures(origin, lookDirection) {
    // Calculate visibility polygon by casting rays
    const rays = [];
    const intersectionPoints = [];
    
    let treeRays = 0;
    const startAngle = lookDirection - this.HUMAN_FOV / 2;
    
    for (let i = 0; i < this.RAY_COUNT; i++) {
      let angle = startAngle + (i / this.RAY_COUNT) * (this.USE_HUMAN_FOV ? this.HUMAN_FOV : 360);
      
      // Calculate ray endpoint
      const rayEnd = this.destination(origin, this.MAX_VIEW_DISTANCE, angle);
      
      // Find closest intersection with obstacles
      let closestDistance = this.MAX_VIEW_DISTANCE;
      let hitObstacle = false;
      
      for (const obstacle of this.obstacles) {
        // Quick bbox check
        if (rayEnd[0] < obstacle.bbox.minX || rayEnd[0] > obstacle.bbox.maxX ||
            rayEnd[1] < obstacle.bbox.minY || rayEnd[1] > obstacle.bbox.maxY) {
          continue;
        }
        
        // Check polygon intersection
        for (let j = 0; j < obstacle.ring.length; j++) {
          const p1 = obstacle.ring[j];
          const p2 = obstacle.ring[(j + 1) % obstacle.ring.length];
          
          const intersection = this.lineIntersection(origin, rayEnd, p1, p2);
          if (intersection) {
            const dist = this.distance(origin, intersection);
            if (dist < closestDistance) {
              closestDistance = dist;
              hitObstacle = true;
            }
          }
        }
      }
      
      // Check tree obstacles
      if (this.INCLUDE_TREES) {
        for (const tree of this.treeObstacles) {
          const treeIntersection = this.rayCircleIntersection(origin, rayEnd, tree.center, tree.radius);
          if (treeIntersection) {
            const dist = this.distance(origin, treeIntersection);
            if (dist < closestDistance) {
              closestDistance = dist;
              hitObstacle = true;
              treeRays++;
            }
          }
        }
      }
      
      const endpoint = this.destination(origin, closestDistance, angle);
      rays.push(endpoint);
      intersectionPoints.push({
        point: endpoint,
        angle,
        distance: closestDistance,
        hitObstacle
      });
    }
    
    return {
      origin,
      rays,
      intersectionPoints,
      totalRays: this.RAY_COUNT,
      treeRays,
      visibleArea: this.calculatePolygonArea(rays)
    };
  }

  calculatePolygonArea(points) {
    // Shoelace formula for polygon area
    if (points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];
    }
    
    return Math.abs(area / 2);
  }

  rayCircleIntersection(rayStart, rayEnd, circleCenter, radiusMeters) {
    // Check if a ray intersects with a circle
    const dx = rayEnd[0] - rayStart[0];
    const dy = rayEnd[1] - rayStart[1];
    
    const fx = rayStart[0] - circleCenter[0];
    const fy = rayStart[1] - circleCenter[1];
    
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - (radiusMeters * radiusMeters);
    
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    
    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (t1 >= 0 && t1 <= 1) {
      return [
        rayStart[0] + t1 * dx,
        rayStart[1] + t1 * dy
      ];
    }
    
    return null;
  }

  // ============================================
  // POSITION VALIDATION
  // ============================================

  getValidPosition(position) {
    // Check if position is inside a building
    if (this.isPointInsideAnyBuilding(position)) {
      return this.findNearestValidPosition(position);
    }
    
    return position;
  }

  isPointInsideAnyBuilding(point) {
    for (const obstacle of this.obstacles) {
      if (this.isPointInPolygon(point, obstacle.ring)) {
        return true;
      }
    }
    return false;
  }

  isPointInPolygon(point, polygon) {
    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > point[1]) !== (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  findNearestValidPosition(position) {
    // Find nearest point outside any building
    let bestPosition = position;
    let bestDistance = 0;
    
    const searchRadius = 100; // meters
    const steps = 16;
    
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 360;
      const testPos = this.destination(position, 10, angle);
      
      if (!this.isPointInsideAnyBuilding(testPos)) {
        return testPos;
      }
    }
    
    return bestPosition;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  calculateBearing(from, to) {
    const dLon = (to[0] - from[0]) * Math.PI / 180;
    const lat1 = from[1] * Math.PI / 180;
    const lat2 = to[1] * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  destination(origin, distanceMeters, bearingDegrees) {
    const R = 6371000; // Earth radius in meters
    const lat1 = origin[1] * Math.PI / 180;
    const lon1 = origin[0] * Math.PI / 180;
    const brng = bearingDegrees * Math.PI / 180;
    const distance = distanceMeters;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distance / R) +
      Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
    );

    return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
  }

  distance(point1, point2) {
    const R = 6371000; // Earth radius in meters
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    const dLat = (point2[1] - point1[1]) * Math.PI / 180;
    const dLon = (point2[0] - point1[0]) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  lineIntersection(p1, p2, p3, p4) {
    // Line segment intersection using parametric equations
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null; // Parallel lines

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1)
      ];
    }

    return null;
  }

  updateStreetViewCameraLayer() {
    // Update camera position visualization
    // This would render the street view camera trail on the map
  }
}

// Export the class
export { IsovistAnimation };
