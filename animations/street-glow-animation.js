// ===== Street Network Glow Animation =====
// Animated glowing paths along street network GeoJSON

class StreetGlowAnimation {
  constructor(map, canvas = null) {
    // Store map reference
    this.map = map;
    
    // Initialize canvas
    if (canvas) {
      this.streetCanvas = canvas;
    } else {
      this.streetCanvas = document.createElement('canvas');
      this.streetCanvas.id = 'street-animation-canvas';
      this.streetCanvas.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 850;
        pointer-events: none;
        display: none;
      `;
      document.body.appendChild(this.streetCanvas);
    }
    
    this.streetCtx = this.streetCanvas.getContext('2d');
    
    // Animation state
    this.streetAnimationFrame = null;
    this.isStreetAnimating = false;
    this.streetSegments = [];
    this.flowParticles = [];
    this.streetGeoJSON = null;
    this.streetDataLoading = false;
    this.streetDataLoaded = false;
    this.animationStartTime = 0;
    
    // Street types and visibility
    this.streetTypes = [];
    this.visibleStreetTypes = [];
    this.typeRevealProgress = 0;
    
    // Group segments by type for efficient rendering
    this.segmentsByType = {};
    
    // Color palette for different street types (more vibrant!)
    this.streetColors = {
      'motorway': 'rgba(255, 50, 50, ',
      'trunk': 'rgba(255, 120, 50, ',
      'primary': 'rgba(255, 200, 50, ',
      'secondary': 'rgba(50, 255, 150, ',
      'tertiary': 'rgba(50, 180, 255, ',
      'unclassified': 'rgba(180, 150, 255, ',
      'residential': 'rgba(50, 255, 100, ',
      'living_street': 'rgba(200, 255, 50, ',
      'service': 'rgba(220, 220, 220, ',
      'pedestrian': 'rgba(255, 100, 255, ',
      'footway': 'rgba(255, 80, 255, ',
      'cycleway': 'rgba(100, 255, 255, ',
      'path': 'rgba(150, 255, 150, ',
      'track': 'rgba(200, 200, 120, ',
      'default': 'rgba(180, 180, 180, '
    };
    
    // Bind event handlers
    this.handleWindowResize = this.handleWindowResize.bind(this);
    this.animateStreets = this.animateStreets.bind(this);
    
    // Load default street network
    this.loadDefaultStreetNetwork();
    
    // Add window resize listener
    window.addEventListener('resize', this.handleWindowResize);
  }
  
  // Load default street network data
  loadDefaultStreetNetwork() {
    this.streetDataLoading = true;
    fetch('media/street-network.geojson')
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(geojson => {
        this.streetGeoJSON = geojson;
        this.parseStreetGeoJSON(geojson);
        this.streetDataLoaded = true;
        this.streetDataLoading = false;
        console.log(`✓ Loaded ${this.streetSegments.length} street segments from media/street-network.geojson`);
      })
      .catch(err => {
        this.streetDataLoading = false;
        console.warn('Could not load media/street-network.geojson:', err);
        console.log('Street animation will require manually loaded GeoJSON');
      });
  }
  
  // Convert lat/lng to canvas pixel coordinates
  projectToCanvas(lng, lat, canvasWidth, canvasHeight) {
    // Project using MapLibre's built-in projection to screen coordinates
    const point = this.map.project([lng, lat]);
    
    // Get the map container position
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();
    
    // Get canvas position (centered on screen)
    const canvasRect = this.streetCanvas.getBoundingClientRect();
    
    // Convert from map coordinates to canvas coordinates
    // Account for canvas being centered and potentially offset from map
    const offsetX = canvasRect.left - mapRect.left;
    const offsetY = canvasRect.top - mapRect.top;
    
    return {
      x: point.x - offsetX,
      y: point.y - offsetY
    };
  }
  
  // Parse GeoJSON and extract line segments with type info
  parseStreetGeoJSON(geojson) {
    this.streetSegments = [];
    this.segmentsByType = {};
    const typeSet = new Set();
    
    if (!geojson || !geojson.features) return;
    
    geojson.features.forEach(feature => {
      const highway = feature.properties?.highway || 'default';
      typeSet.add(highway);
      
      if (!this.segmentsByType[highway]) {
        this.segmentsByType[highway] = [];
      }
      
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
          const segment = {
            start: { lng: coords[i][0], lat: coords[i][1] },
            end: { lng: coords[i + 1][0], lat: coords[i + 1][1] },
            type: highway
          };
          this.streetSegments.push(segment);
          this.segmentsByType[highway].push(segment);
        }
      } else if (feature.geometry.type === 'MultiLineString') {
        feature.geometry.coordinates.forEach(line => {
          for (let i = 0; i < line.length - 1; i++) {
            const segment = {
              start: { lng: line[i][0], lat: line[i][1] },
              end: { lng: line[i + 1][0], lat: line[i + 1][1] },
              type: highway
            };
            this.streetSegments.push(segment);
            this.segmentsByType[highway].push(segment);
          }
        });
      }
    });
    
    this.streetTypes = Array.from(typeSet);
    console.log(`Parsed ${this.streetSegments.length} street segments with ${this.streetTypes.length} types:`, this.streetTypes);
    console.log('Segments by type:', Object.keys(this.segmentsByType).map(k => `${k}: ${this.segmentsByType[k].length}`).join(', '));
  }
  
  // Create flowing particles along streets
  initializeParticles() {
    this.flowParticles = [];
    
    // Reduce particles for large networks
    const totalParticles = Math.min(this.streetSegments.length * 0.3, 500); // Max 500 particles
    const segmentsPerParticle = Math.max(1, Math.floor(this.streetSegments.length / totalParticles));
    
    for (let i = 0; i < this.streetSegments.length; i += segmentsPerParticle) {
      this.flowParticles.push({
        segmentIdx: i,
        progress: Math.random(), // 0 to 1 along segment
        speed: 0.003 + Math.random() * 0.005,
        phase: Math.random() * Math.PI * 2,
        size: 2 + Math.random() * 2
      });
    }
    
    console.log(`Created ${this.flowParticles.length} particles for ${this.streetSegments.length} segments`);
  }
  
  resizeStreetCanvas() {
    const s = computeOverlayPixelSize();
    this.streetCanvas.width = s.w;
    this.streetCanvas.height = s.h;
    this.streetCanvas.style.width = s.w + 'px';
    this.streetCanvas.style.height = s.h + 'px';
  }
  
  drawStreetGlow(time) {
    const width = this.streetCanvas.width;
    const height = this.streetCanvas.height;
    
    // Clear canvas
    this.streetCtx.clearRect(0, 0, width, height);
    
    // Calculate time relative to animation start
    const elapsed = time - this.animationStartTime;
    
    const baseGlow = 0.5 + Math.sin(elapsed * 0.001) * 0.25;
    
    // Incrementally reveal street types (one every 0.5 seconds)
    const targetTypes = Math.min(this.streetTypes.length, Math.floor(elapsed / 500) + 1);
    this.visibleStreetTypes = this.streetTypes.slice(0, targetTypes);
    
    // Draw each visible type in batches (much more efficient)
    this.visibleStreetTypes.forEach((type, typeIndex) => {
      const segments = this.segmentsByType[type] || [];
      if (segments.length === 0) return;
      
      // Type reveal fade-in effect
      const revealProgress = Math.min(1, (elapsed / 500) - typeIndex);
      const fadeIn = Math.max(0, Math.min(1, revealProgress));
      
      if (fadeIn <= 0) return;
      
      // Get color for this street type
      const colorBase = this.streetColors[type] || this.streetColors['default'];
      
      // Reduced sampling: draw more segments for continuous roads
      const maxSegments = 3000; // Increased from 1000
      const sampleRate = Math.max(1, Math.ceil(segments.length / maxSegments));
      
      // Set styles once per type (not per segment!)
      const pulse = Math.sin(elapsed * 0.003 + typeIndex) * 0.4 + 0.6;
      this.streetCtx.strokeStyle = colorBase + (baseGlow * pulse * 0.8 * fadeIn) + ')';
      this.streetCtx.lineWidth = 2.5;
      this.streetCtx.shadowBlur = 12;
      this.streetCtx.shadowColor = colorBase + (pulse * 0.9 * fadeIn) + ')';
      this.streetCtx.lineCap = 'round';
      
      // Begin a single path for all segments of this type
      this.streetCtx.beginPath();
      
      for (let i = 0; i < segments.length; i += sampleRate) {
        const segment = segments[i];
        const start = this.projectToCanvas(segment.start.lng, segment.start.lat, width, height);
        const end = this.projectToCanvas(segment.end.lng, segment.end.lat, width, height);
        
        this.streetCtx.moveTo(start.x, start.y);
        this.streetCtx.lineTo(end.x, end.y);
      }
      
      // Draw all segments of this type at once
      this.streetCtx.stroke();
    });
    
    this.streetCtx.shadowBlur = 0;
    
    // Draw legend showing current types
    this.streetCtx.font = '12px system-ui';
    this.streetCtx.textAlign = 'left';
    let yOffset = 20;
    this.visibleStreetTypes.forEach(type => {
      const colorBase = this.streetColors[type] || this.streetColors['default'];
      this.streetCtx.fillStyle = colorBase + '0.8)';
      this.streetCtx.fillRect(10, yOffset - 8, 30, 3);
      this.streetCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.streetCtx.fillText(type, 45, yOffset);
      yOffset += 18;
    });
  }
  
  animateStreets() {
    if (!this.isStreetAnimating) return;
    
    const time = performance.now();
    this.drawStreetGlow(time);
    
    this.streetAnimationFrame = requestAnimationFrame(this.animateStreets);
  }
  
  // Start the animation
  start() {
    // Check if data is still loading
    if (this.streetDataLoading) {
      alert('Street network is still loading, please wait a moment...');
      return;
    }
    
    // Check if we have street network data (either loaded from default or map source)
    if (this.streetSegments.length === 0) {
      // Try to get from map source if available
      if (this.map.getSource('user-geojson')) {
        const source = this.map.getSource('user-geojson');
        if (source && source._data) {
          this.parseStreetGeoJSON(source._data);
        }
      }
      
      if (this.streetSegments.length === 0) {
        alert('No street network data found!\n\n' +
              '1. Make sure media/street-network.geojson exists, or\n' +
              '2. Load a GeoJSON file with street LineStrings using the upload button');
        return;
      }
    }
    
    // If already animating, stop and restart
    if (this.isStreetAnimating) {
      this.stop();
    }
    
    // Reset reveal progress and start time
    this.visibleStreetTypes = [];
    this.typeRevealProgress = 0;
    this.animationStartTime = performance.now();
    
    this.isStreetAnimating = true;
    this.streetCanvas.style.display = 'block';
    this.resizeStreetCanvas();
    this.animateStreets();
    
    // Auto-stop after all types revealed + 5 seconds
    const revealDuration = this.streetTypes.length * 500 + 5000;
    setTimeout(() => {
      if (this.isStreetAnimating) this.stop();
    }, revealDuration);
  }
  
  // Stop the animation
  stop() {
    this.isStreetAnimating = false;
    this.streetCanvas.style.display = 'none';
    if (this.streetAnimationFrame) {
      cancelAnimationFrame(this.streetAnimationFrame);
      this.streetAnimationFrame = null;
    }
    this.streetCtx.clearRect(0, 0, this.streetCanvas.width, this.streetCanvas.height);
    this.flowParticles = [];
  }
  
  // Toggle animation state
  toggle() {
    if (this.isStreetAnimating) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  // Handle window resize event
  handleWindowResize() {
    if (this.isStreetAnimating) {
      this.resizeStreetCanvas();
    }
  }
  
  // Clean up event listeners (call when destroying the instance)
  destroy() {
    window.removeEventListener('resize', this.handleWindowResize);
    this.stop();
  }
}

export { StreetGlowAnimation };
