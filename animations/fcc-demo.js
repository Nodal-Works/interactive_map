// FCC Demo - Synchronized VR Flythrough with Isovist Visualization
// Plays VR recording video synchronized with isovist movement along recorded path
// Version: 1.0

class FCCDemoAnimation {
  constructor(map) {
    this.map = map;
    this.channel = new BroadcastChannel('map_controller_channel');
    
    this.fccDemoActive = false;
    this.pathCoordinates = [];
    this.totalPathLength = 0;
    this.segmentLengths = [];
    this.cumulativeLengths = [];
    
    this.currentProgress = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.animationFrameId = null;
    this.lastTimestamp = null;
    
    this.videoDuration = 20;
    
    this.MAX_VIEW_DISTANCE = 200;
    this.RAY_COUNT = 360;
    this.HUMAN_FOV = 120;
    this.USE_HUMAN_FOV = true;
    
    this.obstacles = [];
    this.treeObstacles = [];
    this.INCLUDE_TREES = true;
    
    this.lastBroadcastPosition = null;
    this.lastBroadcastHeading = null;
    this.BROADCAST_MIN_DISTANCE = 2;
    this.BROADCAST_MIN_HEADING_CHANGE = 10;
    
    this.setupChannelListener();
  }

  setupChannelListener() {
    this.channel.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'fcc_demo_control') {
        switch (data.action) {
          case 'play':
            this.startPlayback();
            break;
          case 'pause':
            this.pausePlayback();
            break;
          case 'seek':
            this.seekTo(parseFloat(data.value));
            break;
          case 'set_speed':
            this.playbackSpeed = parseFloat(data.value);
            break;
          case 'set_video_duration':
            this.videoDuration = parseFloat(data.value);
            break;
          case 'toggle':
            this.toggle();
            break;
        }
      }
    };
  }

  start() {
    this.toggle();
  }

  stop() {
    if (this.fccDemoActive) {
      this.toggle();
    }
  }

  toggle() {
    this.fccDemoActive = !this.fccDemoActive;
    const btn = document.getElementById('fcc-demo-btn');
    
    if (this.fccDemoActive) {
      if (btn) {
        btn.classList.add('toggled-off');
        btn.style.background = '#0078d4';
        btn.style.color = '#fff';
      }
      this.activateFCCDemo();
      this.showToast('FCC Demo activated - Use controller to play flythrough');
    } else {
      if (btn) {
        btn.classList.remove('toggled-off');
        btn.style.background = '';
        btn.style.color = '';
      }
      this.deactivateFCCDemo();
      this.showToast('FCC Demo deactivated');
    }
  }

  async activateFCCDemo() {
    this.channel.postMessage({ 
      type: 'animation_state', 
      animationId: 'fcc-demo-btn', 
      isActive: true 
    });
    
    const streetLifeCanvas = document.getElementById('street-life-canvas');
    if (streetLifeCanvas) {
      streetLifeCanvas.style.display = 'none';
    }
    
    const trafikCanvas = document.getElementById('trafik-canvas');
    if (trafikCanvas) {
      trafikCanvas.style.display = 'none';
    }
    
    await this.loadPathData();
    this.loadBuildingObstacles();
    await this.loadTreeObstacles();
    this.addMapLayers();
    this.seekTo(0);
    
    this.channel.postMessage({
      type: 'fcc_demo_ready',
      data: {
        pathLength: this.totalPathLength,
        pointCount: this.pathCoordinates.length
      }
    });
  }

  deactivateFCCDemo() {
    this.channel.postMessage({ 
      type: 'animation_state', 
      animationId: 'fcc-demo-btn', 
      isActive: false 
    });
    
    const streetLifeCanvas = document.getElementById('street-life-canvas');
    if (streetLifeCanvas) {
      streetLifeCanvas.style.display = 'block';
    }
    
    const trafikCanvas = document.getElementById('trafik-canvas');
    if (trafikCanvas) {
      trafikCanvas.style.display = 'block';
    }
    
    this.pausePlayback();
    this.removeMapLayers();
    
    this.currentProgress = 0;
    this.pathCoordinates = [];
    this.obstacles = [];
    this.treeObstacles = [];
    this.lastBroadcastPosition = null;
    this.lastBroadcastHeading = null;
  }

  async loadPathData() {
    try {
      const response = await fetch('media/VR-movement.geojson');
      const geojson = await response.json();
      
      if (geojson.features && geojson.features.length > 0) {
        const feature = geojson.features[0];
        if (feature.geometry.type === 'LineString') {
          this.pathCoordinates = feature.geometry.coordinates;
          
          this.segmentLengths = [];
          this.cumulativeLengths = [0];
          this.totalPathLength = 0;
          
          for (let i = 1; i < this.pathCoordinates.length; i++) {
            const segLength = this.distance(this.pathCoordinates[i-1], this.pathCoordinates[i]);
            this.segmentLengths.push(segLength);
            this.totalPathLength += segLength;
            this.cumulativeLengths.push(this.totalPathLength);
          }
          
          console.log(`FCC Demo: Loaded path with ${this.pathCoordinates.length} points, ${this.totalPathLength.toFixed(1)}m total`);
        }
      }
    } catch (e) {
      console.error('FCC Demo: Failed to load path data:', e);
    }
  }

  loadBuildingObstacles() {
    const source = this.map.getSource('building-footprints');
    if (source && source._data) {
      this.processGeoJSON(source._data);
      return;
    }
    
    fetch('media/building-footprints.geojson')
      .then(res => res.json())
      .then(data => this.processGeoJSON(data))
      .catch(e => console.warn('FCC Demo: Could not load building footprints:', e));
  }

  processGeoJSON(geojson) {
    this.obstacles = [];
    if (!geojson.features) return;
    
    geojson.features.forEach(feature => {
      if (feature.geometry.type === 'Polygon') {
        this.addObstacle(feature.geometry.coordinates[0], feature.properties);
      } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
          this.addObstacle(polygon[0], feature.properties);
        });
      }
    });
    
    console.log(`FCC Demo: Loaded ${this.obstacles.length} building obstacles`);
  }

  addObstacle(ring, properties = {}) {
    const lons = ring.map(c => c[0]);
    const lats = ring.map(c => c[1]);
    this.obstacles.push({
      ring: ring,
      bbox: {
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats)
      },
      properties: properties
    });
  }

  async loadTreeObstacles() {
    this.treeObstacles = [];
    
    try {
      const response = await fetch('media/trees.geojson');
      const geojson = await response.json();
      
      if (geojson.features) {
        geojson.features.forEach((feature, index) => {
          if (feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates;
            const height = feature.properties?.height || 10;
            const radius = 2 + Math.random() * 1.5 + height * 0.3;
            
            this.treeObstacles.push({
              center: coords,
              radius: radius,
              height: height,
              index: index,
              properties: feature.properties || {}
            });
          }
        });
        console.log(`FCC Demo: Loaded ${this.treeObstacles.length} tree obstacles`);
      }
    } catch (e) {
      console.warn('FCC Demo: Could not load trees:', e);
    }
  }

  addMapLayers() {
    if (!this.map.getSource('fcc-demo-all-buildings')) {
      const buildingFeatures = this.obstacles.map(obs => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [obs.ring]
        },
        properties: obs.properties
      }));
      
      this.map.addSource('fcc-demo-all-buildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: buildingFeatures }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-all-buildings-fill',
        type: 'fill',
        source: 'fcc-demo-all-buildings',
        paint: {
          'fill-color': '#888888',
          'fill-opacity': 0.15
        }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-all-buildings-outline',
        type: 'line',
        source: 'fcc-demo-all-buildings',
        paint: {
          'line-color': '#666666',
          'line-width': 1,
          'line-opacity': 0.3
        }
      });
    }
    
    if (!this.map.getSource('fcc-demo-all-trees')) {
      const treeFeatures = this.treeObstacles.map(tree => {
        const circleCoords = [];
        for (let a = 0; a <= 360; a += 30) {
          circleCoords.push(this.destination(tree.center, tree.radius, a));
        }
        circleCoords.push(circleCoords[0]);
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [circleCoords]
          },
          properties: tree.properties
        };
      });
      
      this.map.addSource('fcc-demo-all-trees', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: treeFeatures }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-all-trees-fill',
        type: 'fill',
        source: 'fcc-demo-all-trees',
        paint: {
          'fill-color': '#2D5A27',
          'fill-opacity': 0.15
        }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-all-trees-outline',
        type: 'line',
        source: 'fcc-demo-all-trees',
        paint: {
          'line-color': '#2D5A27',
          'line-width': 1,
          'line-opacity': 0.3
        }
      });
    }
    
    if (!this.map.getSource('fcc-demo-path')) {
      this.map.addSource('fcc-demo-path', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: this.pathCoordinates
          }
        }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-path-line',
        type: 'line',
        source: 'fcc-demo-path',
        paint: {
          'line-color': '#00ff88',
          'line-width': 4,
          'line-opacity': 0.6,
          'line-dasharray': [2, 2]
        }
      });
    }
    
    if (!this.map.getSource('fcc-demo-isovist')) {
      this.map.addSource('fcc-demo-isovist', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-isovist-fill',
        type: 'fill',
        source: 'fcc-demo-isovist',
        paint: {
          'fill-color': '#00ffcc',
          'fill-opacity': 0.25
        }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-isovist-line',
        type: 'line',
        source: 'fcc-demo-isovist',
        paint: {
          'line-color': '#00ffcc',
          'line-width': 3,
          'line-opacity': 0.8
        }
      });
    }
    
    if (!this.map.getSource('fcc-demo-viewer')) {
      this.map.addSource('fcc-demo-viewer', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-viewer-point',
        type: 'circle',
        source: 'fcc-demo-viewer',
        paint: {
          'circle-radius': 10,
          'circle-color': '#ff0066',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-viewer-direction',
        type: 'line',
        source: 'fcc-demo-viewer',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#ff0066',
          'line-width': 4,
          'line-opacity': 1
        }
      });
    }
    
    if (!this.map.getSource('fcc-demo-viewed-buildings')) {
      this.map.addSource('fcc-demo-viewed-buildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-viewed-buildings-fill',
        type: 'fill',
        source: 'fcc-demo-viewed-buildings',
        paint: {
          'fill-color': '#ffaa00',
          'fill-opacity': 0.4
        }
      });
    }
    
    if (!this.map.getSource('fcc-demo-viewed-trees')) {
      this.map.addSource('fcc-demo-viewed-trees', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      this.map.addLayer({
        id: 'fcc-demo-viewed-trees-fill',
        type: 'fill',
        source: 'fcc-demo-viewed-trees',
        paint: {
          'fill-color': '#00ff44',
          'fill-opacity': 0.5
        }
      });
    }
  }

  removeMapLayers() {
    const layers = [
      'fcc-demo-all-buildings-fill',
      'fcc-demo-all-buildings-outline',
      'fcc-demo-all-trees-fill',
      'fcc-demo-all-trees-outline',
      'fcc-demo-path-line',
      'fcc-demo-isovist-fill',
      'fcc-demo-isovist-line',
      'fcc-demo-viewer-point',
      'fcc-demo-viewer-direction',
      'fcc-demo-viewed-buildings-fill',
      'fcc-demo-viewed-trees-fill'
    ];
    
    const sources = [
      'fcc-demo-all-buildings',
      'fcc-demo-all-trees',
      'fcc-demo-path',
      'fcc-demo-isovist',
      'fcc-demo-viewer',
      'fcc-demo-viewed-buildings',
      'fcc-demo-viewed-trees'
    ];
    
    layers.forEach(id => {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    });
    
    sources.forEach(id => {
      if (this.map.getSource(id)) this.map.removeSource(id);
    });
  }

  startPlayback() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame((t) => this.playbackLoop(t));
    
    this.channel.postMessage({
      type: 'fcc_demo_playback_state',
      isPlaying: true
    });
  }

  pausePlayback() {
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.channel.postMessage({
      type: 'fcc_demo_playback_state',
      isPlaying: false
    });
  }

  playbackLoop(timestamp) {
    if (!this.isPlaying || !this.fccDemoActive) return;
    
    const deltaTime = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    
    const progressIncrement = (deltaTime * this.playbackSpeed) / this.videoDuration;
    this.currentProgress = Math.min(1, this.currentProgress + progressIncrement);
    
    this.updateVisualization();
    
    this.channel.postMessage({
      type: 'fcc_demo_progress',
      progress: this.currentProgress,
      time: this.currentProgress * this.videoDuration
    });
    
    if (this.currentProgress < 1) {
      this.animationFrameId = requestAnimationFrame((t) => this.playbackLoop(t));
    } else {
      this.pausePlayback();
    }
  }

  seekTo(progress) {
    this.currentProgress = Math.max(0, Math.min(1, progress));
    
    this.lastBroadcastPosition = null;
    this.lastBroadcastHeading = null;
    
    this.updateVisualization();
    
    this.channel.postMessage({
      type: 'fcc_demo_progress',
      progress: this.currentProgress,
      time: this.currentProgress * this.videoDuration
    });
  }

  updateVisualization() {
    if (this.pathCoordinates.length < 2) return;
    
    const { position, direction } = this.getPositionAlongPath(this.currentProgress);
    
    this.broadcastStreetViewPosition(position, direction);
    
    const viewerFeatures = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: position }
        }
      ]
    };
    
    if (direction) {
      const directionEnd = this.destination(position, 30, direction);
      viewerFeatures.features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [position, directionEnd]
        }
      });
    }
    
    if (this.map.getSource('fcc-demo-viewer')) {
      this.map.getSource('fcc-demo-viewer').setData(viewerFeatures);
    }
    
    if (this.obstacles.length > 0 || this.treeObstacles.length > 0) {
      const result = this.calculateIsovist(position, direction);
      
      if (this.map.getSource('fcc-demo-isovist')) {
        this.map.getSource('fcc-demo-isovist').setData({
          type: 'FeatureCollection',
          features: [result.polygon]
        });
      }
      
      if (this.map.getSource('fcc-demo-viewed-buildings')) {
        this.map.getSource('fcc-demo-viewed-buildings').setData({
          type: 'FeatureCollection',
          features: result.viewedBuildings
        });
      }
      
      if (this.map.getSource('fcc-demo-viewed-trees')) {
        this.map.getSource('fcc-demo-viewed-trees').setData({
          type: 'FeatureCollection',
          features: result.viewedTrees
        });
      }
      
      this.channel.postMessage({
        type: 'fcc_demo_stats',
        data: result.stats
      });
    }
  }

  broadcastStreetViewPosition(position, heading) {
    if (!position) return;
    
    const currentHeading = heading || 0;
    const positionChanged = !this.lastBroadcastPosition || 
      this.distance([this.lastBroadcastPosition.lng, this.lastBroadcastPosition.lat], position) > this.BROADCAST_MIN_DISTANCE;
    const headingChanged = this.lastBroadcastHeading === null || 
      Math.abs(currentHeading - this.lastBroadcastHeading) > this.BROADCAST_MIN_HEADING_CHANGE;
    
    if (positionChanged || headingChanged) {
      this.lastBroadcastPosition = { lng: position[0], lat: position[1] };
      this.lastBroadcastHeading = currentHeading;
      
      this.channel.postMessage({
        type: 'street_view_position',
        position: {
          lng: position[0],
          lat: position[1]
        },
        heading: currentHeading
      });
    }
  }

  getPositionAlongPath(progress) {
    if (this.pathCoordinates.length < 2) {
      return { position: this.pathCoordinates[0] || [0, 0], direction: 0 };
    }
    
    const targetDistance = progress * this.totalPathLength;
    
    let segmentIndex = 0;
    for (let i = 0; i < this.cumulativeLengths.length - 1; i++) {
      if (targetDistance >= this.cumulativeLengths[i] && targetDistance <= this.cumulativeLengths[i + 1]) {
        segmentIndex = i;
        break;
      }
    }
    
    const segmentStart = this.cumulativeLengths[segmentIndex];
    const segmentEnd = this.cumulativeLengths[segmentIndex + 1];
    const segmentProgress = segmentEnd > segmentStart 
      ? (targetDistance - segmentStart) / (segmentEnd - segmentStart)
      : 0;
    
    const p1 = this.pathCoordinates[segmentIndex];
    const p2 = this.pathCoordinates[segmentIndex + 1] || p1;
    
    const position = [
      p1[0] + (p2[0] - p1[0]) * segmentProgress,
      p1[1] + (p2[1] - p1[1]) * segmentProgress
    ];
    
    const direction = this.calculateBearing(p1, p2);
    
    return { position, direction };
  }

  calculateIsovist(origin, lookDirection) {
    const rays = [];
    const viewedObstacleIndices = new Set();
    const viewedTreeIndices = new Set();
    
    let startAngle, endAngle, angleStep;
    
    if (this.USE_HUMAN_FOV && lookDirection !== null) {
      const halfFOV = (this.HUMAN_FOV / 2) * Math.PI / 180;
      const viewAngle = lookDirection * Math.PI / 180;
      startAngle = viewAngle - halfFOV;
      endAngle = viewAngle + halfFOV;
      angleStep = (endAngle - startAngle) / this.RAY_COUNT;
    } else {
      startAngle = 0;
      endAngle = 2 * Math.PI;
      angleStep = (2 * Math.PI) / this.RAY_COUNT;
    }
    
    let openRays = 0;
    let buildingRays = 0;
    let treeRays = 0;
    const buildingTypeRays = {};
    
    for (let angle = startAngle; angle < endAngle; angle += angleStep) {
      const bearing = (angle * 180 / Math.PI + 360) % 360;
      const maxPoint = this.destination(origin, this.MAX_VIEW_DISTANCE, bearing);
      
      let closestDist = this.MAX_VIEW_DISTANCE;
      let hitType = 'open';
      let hitObstacleIdx = -1;
      let hitTreeIdx = -1;
      let hitBuildingType = null;
      
      for (let i = 0; i < this.obstacles.length; i++) {
        const obs = this.obstacles[i];
        
        const rayBbox = {
          minLon: Math.min(origin[0], maxPoint[0]),
          maxLon: Math.max(origin[0], maxPoint[0]),
          minLat: Math.min(origin[1], maxPoint[1]),
          maxLat: Math.max(origin[1], maxPoint[1])
        };
        
        if (rayBbox.maxLon < obs.bbox.minLon || rayBbox.minLon > obs.bbox.maxLon ||
            rayBbox.maxLat < obs.bbox.minLat || rayBbox.minLat > obs.bbox.maxLat) {
          continue;
        }
        
        const ring = obs.ring;
        for (let j = 0; j < ring.length - 1; j++) {
          const intersection = this.lineIntersection(origin, maxPoint, ring[j], ring[j + 1]);
          if (intersection) {
            const dist = this.distance(origin, intersection);
            if (dist < closestDist) {
              closestDist = dist;
              hitType = 'building';
              hitObstacleIdx = i;
              hitBuildingType = obs.properties?.ANDESSION || 'Unknown';
            }
          }
        }
      }
      
      if (this.INCLUDE_TREES) {
        for (let i = 0; i < this.treeObstacles.length; i++) {
          const tree = this.treeObstacles[i];
          const treeDist = this.rayCircleIntersection(origin, maxPoint, tree.center, tree.radius);
          
          if (treeDist !== null && treeDist < closestDist) {
            closestDist = treeDist;
            hitType = 'tree';
            hitTreeIdx = i;
            hitObstacleIdx = -1;
          }
        }
      }
      
      const hitPoint = this.destination(origin, closestDist, bearing);
      rays.push(hitPoint);
      
      if (hitType === 'open') {
        openRays++;
      } else if (hitType === 'building') {
        buildingRays++;
        viewedObstacleIndices.add(hitObstacleIdx);
        buildingTypeRays[hitBuildingType] = (buildingTypeRays[hitBuildingType] || 0) + 1;
      } else if (hitType === 'tree') {
        treeRays++;
        viewedTreeIndices.add(hitTreeIdx);
      }
    }
    
    const polygonCoords = [origin, ...rays, origin];
    const polygon = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [polygonCoords]
      }
    };
    
    const viewedBuildings = [];
    viewedObstacleIndices.forEach(idx => {
      viewedBuildings.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [this.obstacles[idx].ring]
        },
        properties: this.obstacles[idx].properties
      });
    });
    
    const viewedTrees = [];
    viewedTreeIndices.forEach(idx => {
      const tree = this.treeObstacles[idx];
      const circleCoords = [];
      for (let a = 0; a <= 360; a += 30) {
        circleCoords.push(this.destination(tree.center, tree.radius, a));
      }
      circleCoords.push(circleCoords[0]);
      
      viewedTrees.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [circleCoords]
        },
        properties: tree.properties
      });
    });
    
    const totalRays = rays.length;
    const stats = {
      totalRays,
      openRays,
      buildingRays,
      treeRays,
      buildingTypeRays,
      viewedBuildingCount: viewedObstacleIndices.size,
      viewedTreeCount: viewedTreeIndices.size
    };
    
    return { polygon, viewedBuildings, viewedTrees, stats };
  }

  rayCircleIntersection(rayStart, rayEnd, circleCenter, radiusMeters) {
    const dx = rayEnd[0] - rayStart[0];
    const dy = rayEnd[1] - rayStart[1];
    
    const fx = rayStart[0] - circleCenter[0];
    const fy = rayStart[1] - circleCenter[1];
    
    const radiusDeg = radiusMeters / 111320;
    
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radiusDeg * radiusDeg;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return null;
    
    const sqrtDisc = Math.sqrt(discriminant);
    let t = (-b - sqrtDisc) / (2 * a);
    
    if (t < 0) {
      t = (-b + sqrtDisc) / (2 * a);
    }
    
    if (t >= 0 && t <= 1) {
      const hitPoint = [
        rayStart[0] + t * dx,
        rayStart[1] + t * dy
      ];
      return this.distance(rayStart, hitPoint);
    }
    
    return null;
  }

  calculateBearing(from, to) {
    const lon1 = from[0] * Math.PI / 180;
    const lat1 = from[1] * Math.PI / 180;
    const lon2 = to[0] * Math.PI / 180;
    const lat2 = to[1] * Math.PI / 180;
    
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  destination(origin, distanceMeters, bearingDegrees) {
    const R = 6371000;
    const d = distanceMeters / R;
    const brng = bearingDegrees * Math.PI / 180;
    
    const lat1 = origin[1] * Math.PI / 180;
    const lon1 = origin[0] * Math.PI / 180;
    
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    
    return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
  }

  distance(point1, point2) {
    const R = 6371000;
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
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    }
    
    return null;
  }

  showToast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
    } else {
      console.log('FCC Demo:', msg);
    }
  }
}

export { FCCDemoAnimation };
