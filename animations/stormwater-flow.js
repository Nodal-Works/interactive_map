/**
 * Stormwater Flow Animation
 * 
 * Visualizes stormwater drainage using particle-based flow animation.
 * Particles follow terrain flow directions calculated from DEM analysis.
 */

class StormwaterFlowAnimation {
  constructor(map, canvas) {
    this.map = map;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isActive = false;
    this.animationFrame = null;
    
    // Particle system
    this.particles = [];
    this.maxParticles = 3000;
    this.particleSpawnRate = 10; // particles per frame
    
    // Flow data
    this.flowData = null;
    this.buildingFootprints = null;
    this.demImageData = null; // Cached DEM visualization
    
    // Animation parameters
    this.particleSpeed = 2.0;
    this.particleLifetime = 200; // frames
    this.particleSize = 2;
    this.flowIntensity = 1.0; // Multiplier for flow visualization
    this.showDEM = false; // Show DEM elevation background (hidden by default)
    this.debugFlowLines = false; // Show flow direction arrows for debugging
    
    // Colors
    this.particleColor = 'rgba(0, 150, 255, 0.7)'; // Water blue
    this.particleTrailColor = 'rgba(0, 150, 255, 0.3)';
    
    // Bind methods
    this.animate = this.animate.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }
  
  async loadData() {
    try {
      console.log('Loading stormwater flow data...');
      
      // Load flow data
      const flowResponse = await fetch('media/flow_data.json');
      if (!flowResponse.ok) {
        throw new Error('Flow data not found. Please run process_dem_flow.py first.');
      }
      this.flowData = await flowResponse.json();
      
      // Load DEM visualization image
      const demImage = new Image();
      demImage.src = 'media/dem_visualization.png';
      await new Promise((resolve, reject) => {
        demImage.onload = resolve;
        demImage.onerror = reject;
      });
      this.demImage = demImage;
      console.log('DEM visualization image loaded');
      
      // Load building footprints
      const buildingsResponse = await fetch('media/building-footprints.geojson');
      if (buildingsResponse.ok) {
        this.buildingFootprints = await buildingsResponse.json();
      }
      
      console.log('Stormwater flow data loaded:', {
        flowLines: this.flowData.flow_lines.length,
        startPoints: this.flowData.start_points.length,
        bounds: this.flowData.bounds
      });
      
      return true;
    } catch (error) {
      console.error('Error loading stormwater flow data:', error);
      alert('Please run process_dem_flow.py first to generate flow data.');
      return false;
    }
  }
  
  async start() {
    if (this.isActive) return;
    
    // Load data if not already loaded
    if (!this.flowData) {
      const loaded = await this.loadData();
      if (!loaded) return;
    }
    
    this.isActive = true;
    this.canvas.classList.add('active');
    this.handleResize();
    
    // Scale normalized flow data to current canvas size
    this.scaleFlowToScreen();
    
    // Initialize particles
    this.particles = [];
    
    // Add resize listener
    window.addEventListener('resize', () => {
      this.handleResize();
      this.scaleFlowToScreen();  // Rescale when canvas size changes
    });
    
    // Start animation loop
    this.animate();
    
    console.log('Stormwater flow animation started');
  }
  
  // Scale normalized flow data (0-1 range) to current canvas dimensions
  scaleFlowToScreen() {
    if (!this.flowData) return;
    
    console.log('Scaling normalized flow data to screen space...');
    
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Calculate max accumulation for color scaling
    const accValues = this.flowData.flow_lines.map(line => line.accumulation);
    this.maxAccumulation = Math.max(...accValues);
    this.logMaxAcc = Math.log10(this.maxAccumulation + 1);
    
    // Scale flow lines from normalized (0-1) to pixel coordinates
    this.flowData.flow_lines_screen = this.flowData.flow_lines.map(line => {
      return {
        from_x: line.from_x_norm * width,
        from_y: line.from_y_norm * height,
        to_x: line.to_x_norm * width,
        to_y: line.to_y_norm * height,
        accumulation: line.accumulation,
        direction: line.direction
      };
    });
    
    // Scale start points from normalized (0-1) to pixel coordinates
    this.flowData.start_points_screen = this.flowData.start_points.map(point => {
      return {
        x: point.position_norm[0] * width,
        y: point.position_norm[1] * height,
        weight: point.weight
      };
    });
    
    console.log(`Scaled ${this.flowData.flow_lines_screen.length} flow lines and ${this.flowData.start_points_screen.length} start points to ${width}x${height}px`);
  }
  
  stop() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.canvas.classList.remove('active');
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    // Remove resize listener
    window.removeEventListener('resize', this.handleResize);
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.particles = [];
    
    console.log('Stormwater flow animation stopped');
  }
  
  toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  handleResize() {
    // Use the same sizing as CFD simulation
    const s = typeof computeOverlayPixelSize === 'function' 
      ? computeOverlayPixelSize() 
      : { w: window.innerWidth - 120, h: window.innerHeight }; // fallback
    
    this.canvas.width = s.w;
    this.canvas.height = s.h;
    this.canvas.style.width = s.w + 'px';
    this.canvas.style.height = s.h + 'px';
  }
  
  // Convert geographic coordinates (EPSG:3006) to screen coordinates
  geoToScreen(x, y) {
    // Input is expected to be WGS84 lon/lat (EPSG:4326)
    // Use MapLibre's project() to get pixel coordinates, then convert to canvas space
    const lon = x;
    const lat = y;

    const projected = this.map.project([lon, lat]);
    const mapContainer = this.map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    const screenX = projected.x + mapRect.left;
    const screenY = projected.y + mapRect.top;

    const canvasX = screenX - canvasRect.left;
    const canvasY = screenY - canvasRect.top;

    return { x: canvasX, y: canvasY };
  }
  
  // Create a new particle at a spawn point
  createParticle() {
    // Use screen space start points
    const startPointsScreen = this.flowData?.start_points_screen;
    if (!startPointsScreen || startPointsScreen.length === 0) {
      console.warn('No screen space start points available');
      return null;
    }
    
    // Select a random start point, weighted by flow accumulation
    const totalWeight = startPointsScreen.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;
    
    let selectedPoint = startPointsScreen[0];
    for (const point of startPointsScreen) {
      random -= point.weight;
      if (random <= 0) {
        selectedPoint = point;
        break;
      }
    }
    
    // Add small random offset for variety
    const offsetX = (Math.random() - 0.5) * 10;
    const offsetY = (Math.random() - 0.5) * 10;
    
    return {
      x: selectedPoint.x + offsetX,
      y: selectedPoint.y + offsetY,
      age: 0,
      trail: [], // Previous positions for trail effect
      velocity: { x: 0, y: 0 },
      accumulation: selectedPoint.weight, // Track accumulation for coloring
      stationaryTime: 0 // Track how long particle has been stationary/slow
    };
  }
  
  // Find flow direction at a given screen position
  getFlowDirection(screenX, screenY) {
    if (!this.flowData || !this.flowData.flow_lines_screen) return { x: 0, y: 0 };
    
    // Find nearest flow line in screen space
    let nearestLine = null;
    let minDist = Infinity;
    
    for (const line of this.flowData.flow_lines_screen) {
      const dx = line.from_x - screenX;
      const dy = line.from_y - screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < minDist) {
        minDist = dist;
        nearestLine = line;
      }
    }
    
    // Use 50 pixel search radius
    if (!nearestLine || minDist > 50) {
      return { x: 0, y: 0 };
    }
    
    // Calculate direction vector in screen space
    const dx = nearestLine.to_x - nearestLine.from_x;
    const dy = nearestLine.to_y - nearestLine.from_y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    
    if (mag === 0) return { x: 0, y: 0 };
    
    // Normalize and scale by accumulation (more flow = faster)
    const speed = Math.min(nearestLine.accumulation / 100, 3) * this.particleSpeed;
    
    return {
      x: (dx / mag) * speed,
      y: (dy / mag) * speed,
      accumulation: nearestLine.accumulation // Return accumulation for particle coloring
    };
  }
  
  // Update particle positions
  updateParticles() {
    // Spawn new particles
    for (let i = 0; i < this.particleSpawnRate && this.particles.length < this.maxParticles; i++) {
      const particle = this.createParticle();
      if (particle) {
        this.particles.push(particle);
      }
    }
    
    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age++;
      
      // Remove old particles
      if (p.age > this.particleLifetime) {
        this.particles.splice(i, 1);
        continue;
      }
      
      // Get flow direction at current position (in screen space)
      const flow = this.getFlowDirection(p.x, p.y);
      
      // Update velocity with flow direction
      p.velocity.x = flow.x;
      p.velocity.y = flow.y;
      
      // Update accumulation - particles collect more water as they flow
      if (flow.accumulation) {
        p.accumulation = Math.max(p.accumulation, flow.accumulation);
      }
      
      // Store previous position for trail
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 10) {
        p.trail.shift();
      }
      
      // Update position directly in screen space
      p.x += p.velocity.x;
      p.y += p.velocity.y;
      
      // Add some randomness for more natural flow
      p.x += (Math.random() - 0.5) * 0.5;
      p.y += (Math.random() - 0.5) * 0.5;
      
      // Track stationary time for particle growth
      const speed = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y);
      if (speed < 0.5) {
        // Particle is moving slowly or stationary (pooling)
        p.stationaryTime++;
      } else {
        // Particle is flowing - reset stationary time
        p.stationaryTime = Math.max(0, p.stationaryTime - 2);
      }
      
      // Remove particles that go off screen
      if (p.x < 0 || p.x > this.canvas.width || 
          p.y < 0 || p.y > this.canvas.height) {
        this.particles.splice(i, 1);
      }
    }
  }
  
  // Get particle color based on flow accumulation
  getParticleColor(accumulation) {
    if (!accumulation || !this.logMaxAcc) {
      return 'rgba(200, 220, 255, 0.7)'; // Default light blue (flowing water)
    }
    
    // Use log scale for better color distribution
    const accNorm = Math.log10(accumulation + 1) / this.logMaxAcc;
    
    // White to blue gradient:
    // Low accumulation (flowing water) = white/very light blue
    // High accumulation (pooled water) = deep blue
    const r = Math.floor(255 - accNorm * 245);  // 255 -> 10 (white to deep blue)
    const g = Math.floor(255 - accNorm * 205);  // 255 -> 50 (white to deep blue)
    const b = 255;                               // Always full blue component
    const a = 0.65 + accNorm * 0.3;              // More opaque with more accumulation
    
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  
  // Get particle size based on flow accumulation and stationary time
  getParticleSize(accumulation, stationaryTime) {
    // Base size from accumulation
    let size = this.particleSize;
    
    if (accumulation && this.logMaxAcc) {
      const accNorm = Math.log10(accumulation + 1) / this.logMaxAcc;
      size += accNorm * 1.5; // Up to +1.5px from accumulation
    }
    
    // Grow larger when stationary (pooling effect)
    // Caps at +3px additional size after ~30 frames of being stationary
    const stationaryBonus = Math.min(stationaryTime / 10, 3);
    size += stationaryBonus;
    
    return size; // Range: 2px (flowing) to 6.5px (heavily pooled and stationary)
  }
  
  // Draw particles
  drawParticles() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw DEM elevation background
    // PNG dimensions (625w x 375h) - rotated 90° in Python to match canvas aspect
    // The image is stretched to fill the canvas dimensions
    if (this.showDEM && this.demImage) {
      this.ctx.drawImage(this.demImage, 0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Debug: Draw flow direction arrows (set debugFlowLines = true to enable)
    if (this.debugFlowLines && this.flowData?.flow_lines_screen) {
      this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
      this.ctx.lineWidth = 1;
      
      // Sample every 50th flow line to avoid clutter
      for (let i = 0; i < this.flowData.flow_lines_screen.length; i += 50) {
        const line = this.flowData.flow_lines_screen[i];
        this.ctx.beginPath();
        this.ctx.moveTo(line.from_x, line.from_y);
        this.ctx.lineTo(line.to_x, line.to_y);
        this.ctx.stroke();
        
        // Draw arrow head
        const dx = line.to_x - line.from_x;
        const dy = line.to_y - line.from_y;
        const angle = Math.atan2(dy, dx);
        const arrowSize = 3;
        
        this.ctx.beginPath();
        this.ctx.moveTo(line.to_x, line.to_y);
        this.ctx.lineTo(
          line.to_x - arrowSize * Math.cos(angle - Math.PI / 6),
          line.to_y - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(line.to_x, line.to_y);
        this.ctx.lineTo(
          line.to_x - arrowSize * Math.cos(angle + Math.PI / 6),
          line.to_y - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
      }
    }
    
    // Draw trails
    this.ctx.strokeStyle = this.particleTrailColor;
    this.ctx.lineWidth = 1;
    
    for (const p of this.particles) {
      if (p.trail.length > 1) {
        this.ctx.beginPath();
        this.ctx.moveTo(p.trail[0].x, p.trail[0].y);
        
        for (let i = 1; i < p.trail.length; i++) {
          this.ctx.lineTo(p.trail[i].x, p.trail[i].y);
        }
        
        this.ctx.stroke();
      }
    }
    
    // Draw particles with color and size based on accumulation and velocity
    for (const p of this.particles) {
      // Fade out older particles
      const alpha = 1.0 - (p.age / this.particleLifetime);
      this.ctx.globalAlpha = alpha;
      
      // Color based on flow accumulation (shows pooling effect)
      this.ctx.fillStyle = this.getParticleColor(p.accumulation);
      
      // Size based on flow accumulation AND stationary time (pooled water is larger)
      const size = this.getParticleSize(p.accumulation, p.stationaryTime);
      
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    this.ctx.globalAlpha = 1.0;
  }
  
  // Main animation loop
  animate() {
    if (!this.isActive) return;
    
    this.updateParticles();
    this.drawParticles();
    
    this.animationFrame = requestAnimationFrame(this.animate);
  }
}

// Initialize animation when DOM is ready
let stormwaterFlowAnimation = null;

function initStormwaterFlow() {
  const canvas = document.getElementById('stormwater-canvas');
  
  if (!canvas) {
    console.error('Stormwater canvas not found');
    return;
  }
  
  // Wait for map to be initialized
  const checkMap = setInterval(() => {
    if (window.map) {
      clearInterval(checkMap);
      
      stormwaterFlowAnimation = new StormwaterFlowAnimation(window.map, canvas);
      
      // Set up button handler
      const btn = document.getElementById('stormwater-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          stormwaterFlowAnimation.toggle();
          btn.classList.toggle('active');
        });
      }
      
      console.log('Stormwater flow animation initialized');
    }
  }, 100);
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStormwaterFlow);
} else {
  initStormwaterFlow();
}
