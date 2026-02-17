// ===== Lattice Boltzmann CFD Simulation =====
// Real-time wind flow simulation around building obstacles
// Wind direction: Left to Right (in screen space, accounting for map rotation)

class CFDSimulation {
  constructor(map) {
    this.map = map;
    
    // Canvas and button setup
    this.cfdCanvas = document.getElementById('cfd-simulation-canvas');
    this.cfdBtn = document.getElementById('cfd-simulation-btn');
    
    if (!this.cfdCanvas || !this.cfdBtn) {
      console.warn('CFD Simulation: Required elements not found');
      return;
    }

    this.ctx = this.cfdCanvas.getContext('2d');
    this.animationFrame = null;
    this.isSimulating = false;
    
    // Audio setup
    this.windAudio = new Audio('media/sound/wind.mp3');
    this.windAudio.loop = true;
    
    // Simulation parameters
    this.GRID_RESOLUTION = 200; // Number of cells along longer dimension
    const UPSTREAM_FACTOR = 1.0; // Extend domain 1x to the left (reduced for performance)
    const DOWNSTREAM_FACTOR = 0.5; // Extend domain 0.5x to the right (reduced for performance)
    const VERTICAL_PADDING_FACTOR = 0.2; // Extend domain 20% on top and bottom (reduced for performance)
    this.NX = null; // Grid dimensions (including all extensions)
    this.NY = null;
    this.NX_VISIBLE = null; // Visible grid dimensions
    this.NY_VISIBLE = null;
    this.X_OFFSET = null; // Offsets to start of visible region
    this.Y_OFFSET = null;
    this.cellSize = null; // Size of each cell in pixels
    
    // Store padding factors
    this.UPSTREAM_FACTOR = UPSTREAM_FACTOR;
    this.DOWNSTREAM_FACTOR = DOWNSTREAM_FACTOR;
    this.VERTICAL_PADDING_FACTOR = VERTICAL_PADDING_FACTOR;
    
    // Map rotation - wind flows left-to-right in SCREEN space
    const MAP_BEARING = -92.58546386659737; // Map rotation in degrees
    const WIND_BEARING = 90; // Wind comes from left (90° in screen space)
    // Actual wind direction in geographic space = WIND_BEARING - MAP_BEARING
    this.GEOGRAPHIC_WIND_ANGLE = (WIND_BEARING - MAP_BEARING) * Math.PI / 180;
    
    // Real-world scaling parameters
    this.REAL_WIND_SPEED_MPS = 5.0; // Wind speed in meters per second (m/s)
    this.DOMAIN_WIDTH_METERS = 500; // Approximate width of visible domain in meters
    
    // Lattice Boltzmann parameters (tuned for stability)
    const Q = 9; // D2Q9 lattice (9 velocities in 2D)
    this.Q = Q;
    this.OMEGA = 1.2; // Base relaxation parameter (higher = lower viscosity)
    this.WIND_SPEED = 0.05; // Inlet wind speed in lattice units (increased for better Reynolds number)
    const VISCOSITY = 0.05; // Kinematic viscosity (lower = more turbulent)
    const MAX_VELOCITY = 0.3; // Velocity clamp for stability
    this.MAX_VELOCITY = MAX_VELOCITY;
    this.WIND_ANGLE = 0; // Wind direction in degrees (0 = left to right)
    
    // D2Q9 lattice velocities (directions)
    this.ex = [0, 1, 0, -1, 0, 1, -1, -1, 1]; // x components
    this.ey = [0, 0, 1, 0, -1, 1, 1, -1, -1]; // y components
    this.w = [4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36]; // weights
    
    // Opposite direction indices for bounce-back
    this.opp = [0, 3, 4, 1, 2, 7, 8, 5, 6];
    
    // Grid arrays
    this.f = null; // Distribution functions [x][y][direction]
    this.fTemp = null; // Temporary distribution functions
    this.rho = null; // Density [x][y]
    this.ux = null; // Velocity x-component [x][y]
    this.uy = null; // Velocity y-component [x][y]
    this.obstacle = null; // Boolean obstacle map [x][y] (solid - buildings)
    this.treeObstacle = null; // Boolean tree obstacle map [x][y] (permeable)
    
    // Dynamic velocity scale tracking
    this.currentMaxVelocity = 0;
    this.maxVelocitySmoothed = 0; // Smoothed version to avoid jitter in legend
    
    // Building obstacles from map
    this.buildingPolygons = [];
    
    // Tree obstacles
    this.treeObstacles = [];
    this.INCLUDE_TREES = true; // Toggle tree obstacles
    const TREE_BASE_RADIUS = 2; // Base radius in meters for tree canopy
    const TREE_RADIUS_VARIATION = 1.5; // Random variation in meters
    const TREE_HEIGHT_FACTOR = 0.3; // Additional radius per meter of height
    const TREE_POROSITY = 0.6; // Porosity factor (0 = solid, 1 = fully permeable)
    
    this.TREE_BASE_RADIUS = TREE_BASE_RADIUS;
    this.TREE_RADIUS_VARIATION = TREE_RADIUS_VARIATION;
    this.TREE_HEIGHT_FACTOR = TREE_HEIGHT_FACTOR;
    this.TREE_POROSITY = TREE_POROSITY;
    
    // Particle system for flow visualization
    this.particles = [];
    this.NUM_PARTICLES = 1500; // Increased from 200 for more visible flow
    this.PARTICLE_SPEED_MULTIPLIER = 20; // Control particle movement speed (increased for faster flow)
    
    // Simulation state
    this.simulationSteps = 0;
    const WARMUP_STEPS = 100; // Run faster during initial warmup
    this.WARMUP_STEPS = WARMUP_STEPS;
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Set up broadcast channel for remote control
    this.channel = new BroadcastChannel('map_controller_channel');
    this.channel.onmessage = (event) => this.handleRemoteControl(event);
    
    console.log('CFD Simulation module loaded');
  }
  
  setupEventListeners() {
    // Don't auto-start, just set up the button listener for manual control if needed
    // The button listener is removed to prevent automatic initialization
    
    // Resize on window resize
    window.addEventListener('resize', () => {
      if (this.isSimulating) this.resizeCanvas();
    });
  }
  
  handleRemoteControl(event) {
    const data = event.data;
    if (data.type === 'cfd_control') {
        switch (data.action) {
            case 'set_wind_speed':
                this.REAL_WIND_SPEED_MPS = parseFloat(data.value);
                // Map 0-20 m/s to 0.01-0.1 lattice units roughly
                this.WIND_SPEED = 0.01 + (this.REAL_WIND_SPEED_MPS / 20) * 0.09;
                break;
            case 'set_wind_direction':
                this.WIND_ANGLE = parseFloat(data.value);
                break;
            case 'set_particles':
                this.NUM_PARTICLES = parseInt(data.value);
                this.initParticles();
                break;
            case 'set_particle_speed':
                this.PARTICLE_SPEED_MULTIPLIER = parseFloat(data.value);
                break;
            case 'set_viscosity':
                // Map 0-1 slider to 0.5-1.9 omega (relaxation)
                // Higher omega = lower viscosity
                this.OMEGA = 0.5 + parseFloat(data.value) * 1.4;
                break;
            case 'set_resolution':
                this.GRID_RESOLUTION = parseInt(data.value);
                this.resizeCanvas();
                this.initParticles();
                break;
            case 'toggle_trees':
                this.toggleTrees();
                break;
        }
    }
  }
  
  resizeCanvas() {
    const s = computeOverlayPixelSize();
    this.cfdCanvas.width = s.w;
    this.cfdCanvas.height = s.h;
    this.cfdCanvas.style.width = s.w + 'px';
    this.cfdCanvas.style.height = s.h + 'px';
    
    // Calculate visible grid dimensions
    const aspectRatio = s.w / s.h;
    if (aspectRatio > 1) {
      this.NX_VISIBLE = this.GRID_RESOLUTION;
      this.NY_VISIBLE = Math.floor(this.GRID_RESOLUTION / aspectRatio);
    } else {
      this.NY_VISIBLE = this.GRID_RESOLUTION;
      this.NX_VISIBLE = Math.floor(this.GRID_RESOLUTION * aspectRatio);
    }
    
    // Extend computational domain on all sides to reduce edge effects
    this.X_OFFSET = Math.floor(this.NX_VISIBLE * this.UPSTREAM_FACTOR); // Left (upstream)
    const X_DOWNSTREAM = Math.floor(this.NX_VISIBLE * this.DOWNSTREAM_FACTOR); // Right (downstream)
    this.Y_OFFSET = Math.floor(this.NY_VISIBLE * this.VERTICAL_PADDING_FACTOR); // Top
    const Y_BOTTOM = Math.floor(this.NY_VISIBLE * this.VERTICAL_PADDING_FACTOR); // Bottom
    
    this.NX = this.X_OFFSET + this.NX_VISIBLE + X_DOWNSTREAM;
    this.NY = this.Y_OFFSET + this.NY_VISIBLE + Y_BOTTOM;
    
    this.cellSize = s.w / this.NX_VISIBLE;
    
    console.log(`CFD Grid: ${this.NX}x${this.NY} (visible: ${this.NX_VISIBLE}x${this.NY_VISIBLE}, offsets: X=${this.X_OFFSET}, Y=${this.Y_OFFSET})`);
    
    this.initializeSimulation();
  }
  
  initializeSimulation() {
    // Initialize arrays
    this.f = new Array(this.NX);
    this.fTemp = new Array(this.NX);
    this.rho = new Array(this.NX);
    this.ux = new Array(this.NX);
    this.uy = new Array(this.NX);
    this.obstacle = new Array(this.NX);
    this.treeObstacle = new Array(this.NX);
    
    for (let i = 0; i < this.NX; i++) {
      this.f[i] = new Array(this.NY);
      this.fTemp[i] = new Array(this.NY);
      this.rho[i] = new Array(this.NY);
      this.ux[i] = new Array(this.NY);
      this.uy[i] = new Array(this.NY);
      this.obstacle[i] = new Array(this.NY);
      this.treeObstacle[i] = new Array(this.NY);
      
      for (let j = 0; j < this.NY; j++) {
        this.f[i][j] = new Array(this.Q);
        this.fTemp[i][j] = new Array(this.Q);
        
        // Initialize with equilibrium distribution for uniform flow
        // Wind flows left-to-right in SCREEN space (i direction)
        const u0 = this.WIND_SPEED; // Horizontal flow in screen space
        const v0 = 0.0; // No vertical component in screen space
        const rho0 = 1.0;
        
        for (let k = 0; k < this.Q; k++) {
          this.f[i][j][k] = this.equilibrium(k, rho0, u0, v0);
          this.fTemp[i][j][k] = this.f[i][j][k];
        }
        
        this.rho[i][j] = rho0;
        this.ux[i][j] = u0;
        this.uy[i][j] = v0;
        this.obstacle[i][j] = false;
        this.treeObstacle[i][j] = false;
      }
    }
    
    // Load building obstacles from map
    this.loadBuildingObstacles();
    
    // Load tree obstacles
    this.loadTreeObstacles();
  }
  
  equilibrium(k, density, u, v) {
    // Equilibrium distribution function
    const cu = this.ex[k] * u + this.ey[k] * v;
    const u2 = u * u + v * v;
    return this.w[k] * density * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2);
  }
  
  loadBuildingObstacles() {
    this.buildingPolygons = [];
    
    // Try to get buildings from map
    if (typeof this.map !== 'undefined' && this.map.getSource && this.map.getSource('usergeo')) {
      const data = this.map.getSource('usergeo')._data;
      if (data && data.features) {
        data.features.forEach(feature => {
          if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            this.buildingPolygons.push(feature);
          }
        });
      }
    }
    
    console.log(`CFD: Loaded ${this.buildingPolygons.length} building obstacles`);
    
    if (this.buildingPolygons.length === 0) {
      // Try to load default buildings
      this.loadDefaultBuildings();
    } else {
      this.rasterizeBuildings();
    }
  }
  
  async loadDefaultBuildings() {
    try {
      const response = await fetch('media/building-footprints.geojson');
      if (!response.ok) throw new Error('Building footprints not found');
      
      const geojson = await response.json();
      geojson.features.forEach(feature => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          this.buildingPolygons.push(feature);
        }
      });
      
      console.log(`CFD: Loaded ${this.buildingPolygons.length} buildings from default file`);
      this.rasterizeBuildings();
    } catch (error) {
      console.error('CFD: Failed to load default buildings:', error);
    }
  }
  
  rasterizeBuildings() {
    // Convert geographic building polygons to screen-space grid obstacles
    // Uses MapLibre's project() to properly handle map rotation and projection
    if (typeof this.map === 'undefined' || this.buildingPolygons.length === 0) return;
    
    // Clear existing obstacles
    for (let i = 0; i < this.NX; i++) {
      for (let j = 0; j < this.NY; j++) {
        this.obstacle[i][j] = false;
      }
    }
    
    // Get canvas bounds in screen space
    const canvasWidth = this.cfdCanvas.width;
    const canvasHeight = this.cfdCanvas.height;
    
    // Get map container position (map excludes sidebars: left:60px, right:60px)
    const mapContainer = this.map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    
    // Canvas is centered on the window, calculate its position
    const canvasRect = this.cfdCanvas.getBoundingClientRect();
    
    // Add building obstacles
    this.buildingPolygons.forEach(building => {
      const coords = building.geometry.type === 'Polygon' 
        ? building.geometry.coordinates[0] 
        : building.geometry.coordinates[0][0];
      
      // Convert geographic coordinates to screen pixels using map.project()
      const screenPoints = coords.map(coord => {
        // map.project returns pixel coords relative to map container
        const point = this.map.project([coord[0], coord[1]]);
        
        // Convert from map container space to canvas space
        // Add map container offset, then subtract canvas offset
        const screenX = point.x + mapRect.left;
        const screenY = point.y + mapRect.top;
        
        const canvasX = screenX - canvasRect.left;
        const canvasY = screenY - canvasRect.top;
        
        return {
          x: canvasX,
          y: canvasY
        };
      });
      
      // Find bounding box in canvas space
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      screenPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
      
      // Convert to grid coordinates (account for offsets on all sides)
      const gridMinX = Math.max(this.X_OFFSET, Math.floor(minX / this.cellSize) + this.X_OFFSET);
      const gridMaxX = Math.min(this.NX - 1, Math.ceil(maxX / this.cellSize) + this.X_OFFSET);
      const gridMinY = Math.max(this.Y_OFFSET, Math.floor(minY / this.cellSize) + this.Y_OFFSET);
      const gridMaxY = Math.min(this.NY - 1, Math.ceil(maxY / this.cellSize) + this.Y_OFFSET);
      
      // Fill building area with obstacles
      for (let i = gridMinX; i <= gridMaxX; i++) {
        for (let j = gridMinY; j <= gridMaxY; j++) {
          // Check if grid cell center is inside the polygon
          // Subtract offsets to get canvas coordinates
          const cellCenterX = (i - this.X_OFFSET + 0.5) * this.cellSize;
          const cellCenterY = (j - this.Y_OFFSET + 0.5) * this.cellSize;
          
          if (this.pointInScreenPolygon({x: cellCenterX, y: cellCenterY}, screenPoints)) {
            this.obstacle[i][j] = true;
          }
        }
      }
    });
    
    console.log('CFD: Buildings rasterized to screen-space grid');
  }
  
  async loadTreeObstacles() {
    try {
      const response = await fetch('media/trees.geojson');
      if (!response.ok) {
        console.warn('CFD: Trees file not found');
        return;
      }
      
      const geojson = await response.json();
      
      // Process tree points into circular obstacles
      this.treeObstacles = [];
      
      // Use a seeded random for consistent radii per tree
      const seededRandom = (seed) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };
      
      geojson.features.forEach((feature, idx) => {
        if (feature.geometry.type === 'Point') {
          const coords = feature.geometry.coordinates;
          const height = feature.properties.height || 10;
          
          // Calculate radius based on height with random variation
          const randomVariation = (seededRandom(idx) - 0.5) * 2 * this.TREE_RADIUS_VARIATION;
          const radius = this.TREE_BASE_RADIUS + (height * this.TREE_HEIGHT_FACTOR) + randomVariation;
          
          this.treeObstacles.push({
            center: coords,
            radius: Math.max(1, radius), // minimum 1 meter radius
            properties: feature.properties
          });
        }
      });
      
      console.log(`CFD: Loaded ${this.treeObstacles.length} tree obstacles`);
      
      // Rasterize trees to the grid
      if (this.INCLUDE_TREES) {
        this.rasterizeTrees();
      }
      
    } catch (error) {
      console.warn('CFD: Failed to load trees:', error);
    }
  }
  
  rasterizeTrees() {
    if (typeof this.map === 'undefined' || this.treeObstacles.length === 0 || !this.INCLUDE_TREES) return;
    
    // Get canvas bounds
    const canvasRect = this.cfdCanvas.getBoundingClientRect();
    const mapContainer = this.map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    
    let treeCellCount = 0;
    
    this.treeObstacles.forEach(tree => {
      // Project tree center to screen coordinates
      const point = this.map.project(tree.center);
      const screenX = point.x + mapRect.left;
      const screenY = point.y + mapRect.top;
      const canvasX = screenX - canvasRect.left;
      const canvasY = screenY - canvasRect.top;
      
      // Convert radius from meters to pixels (approximate)
      // Use map zoom to estimate meters per pixel
      const zoom = this.map.getZoom();
      const lat = tree.center[1];
      const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      const radiusPixels = tree.radius / metersPerPixel;
      
      // Convert to grid coordinates
      const gridCenterX = Math.floor(canvasX / this.cellSize) + this.X_OFFSET;
      const gridCenterY = Math.floor(canvasY / this.cellSize) + this.Y_OFFSET;
      const gridRadius = Math.ceil(radiusPixels / this.cellSize);
      
      // Fill circular area with permeable tree obstacles
      for (let di = -gridRadius; di <= gridRadius; di++) {
        for (let dj = -gridRadius; dj <= gridRadius; dj++) {
          const i = gridCenterX + di;
          const j = gridCenterY + dj;
          
          // Check if within grid bounds
          if (i >= 0 && i < this.NX && j >= 0 && j < this.NY) {
            // Check if within circle radius
            const dist = Math.sqrt(di * di + dj * dj);
            if (dist <= gridRadius) {
              this.treeObstacle[i][j] = true;
              treeCellCount++;
            }
          }
        }
      }
    });
    
    console.log(`CFD: Rasterized ${treeCellCount} tree cells to grid (permeable)`);
  }
  
  clearTreeObstacles() {
    // Clear tree obstacles
    for (let i = 0; i < this.NX; i++) {
      for (let j = 0; j < this.NY; j++) {
        this.treeObstacle[i][j] = false;
      }
    }
  }
  
  toggleTrees() {
    this.INCLUDE_TREES = !this.INCLUDE_TREES;
    
    if (this.INCLUDE_TREES) {
      this.rasterizeTrees();
      console.log('CFD: Trees enabled (permeable obstacles)');
    } else {
      this.clearTreeObstacles();
      console.log('CFD: Trees disabled');
    }
  }
  
  pointInScreenPolygon(point, polygon) {
    // Ray casting algorithm for screen coordinates
    let inside = false;
    const x = point.x, y = point.y;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > y) !== (yj > y)) &&
                       (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
  
  simulationStep() {
    // Streaming step
    for (let i = 0; i < this.NX; i++) {
      for (let j = 0; j < this.NY; j++) {
        for (let k = 0; k < this.Q; k++) {
          const nextI = i + this.ex[k];
          const nextJ = j + this.ey[k];
          
          // Stream to neighbors if within bounds
          if (nextI >= 0 && nextI < this.NX && nextJ >= 0 && nextJ < this.NY) {
            this.fTemp[nextI][nextJ][k] = this.f[i][j][k];
          }
        }
      }
    }
    
    // Apply free-slip boundaries at top and bottom (allow parallel flow, zero normal velocity)
    for (let i = 0; i < this.NX; i++) {
      // Top boundary (j = 0) - mirror velocities to enforce zero vertical velocity
      if (i > 0 && i < this.NX - 1) {
        for (let k = 0; k < this.Q; k++) {
          this.fTemp[i][0][k] = this.fTemp[i][1][k]; // Copy from interior
        }
      }
      
      // Bottom boundary (j = NY-1) - mirror velocities to enforce zero vertical velocity
      if (i > 0 && i < this.NX - 1) {
        for (let k = 0; k < this.Q; k++) {
          this.fTemp[i][this.NY-1][k] = this.fTemp[i][this.NY-2][k]; // Copy from interior
        }
      }
    }
    
    // Swap arrays
    let temp = this.f;
    this.f = this.fTemp;
    this.fTemp = temp;
    
    // Boundary conditions and collision
    for (let i = 0; i < this.NX; i++) {
      for (let j = 0; j < this.NY; j++) {
        // Handle solid obstacles (buildings) with full bounce-back
        if (this.obstacle[i][j]) {
          for (let k = 0; k < this.Q; k++) {
            this.fTemp[i][j][k] = this.f[i][j][this.opp[k]];
          }
          continue;
        }
        
        // Handle permeable obstacles (trees) with partial bounce-back
        // This models porous media where some flow passes through
        const isTreeCell = this.INCLUDE_TREES && this.treeObstacle && this.treeObstacle[i][j];
        
        // Compute macroscopic quantities
        let density = 0.0;
        let u = 0.0;
        let v = 0.0;
        
        for (let k = 0; k < this.Q; k++) {
          density += this.f[i][j][k];
          u += this.ex[k] * this.f[i][j][k];
          v += this.ey[k] * this.f[i][j][k];
        }
        
        u /= density;
        v /= density;
        
        // Apply drag for tree cells (porous media resistance)
        if (isTreeCell) {
          // Reduce velocity through trees based on porosity
          const dragFactor = 1.0 - this.TREE_POROSITY; // 0.4 means 40% velocity reduction
          u *= this.TREE_POROSITY;
          v *= this.TREE_POROSITY;
        }
        
        // Clamp velocities for stability
        const speed = Math.sqrt(u * u + v * v);
        if (speed > this.MAX_VELOCITY) {
          u = (u / speed) * this.MAX_VELOCITY;
          v = (v / speed) * this.MAX_VELOCITY;
        }
        
        // Inlet boundary condition (left side of screen)
        // Force equilibrium state to prevent backflow/instability
        if (i === 0) {
          const u_inlet = this.WIND_SPEED;
          const v_inlet = 0.0;
          const rho_inlet = 1.0;
          
          for (let k = 0; k < this.Q; k++) {
            this.fTemp[i][j][k] = this.equilibrium(k, rho_inlet, u_inlet, v_inlet);
          }
          
          this.rho[i][j] = rho_inlet;
          this.ux[i][j] = u_inlet;
          this.uy[i][j] = v_inlet;
          continue;
        }
        
        // Outflow boundary condition (right side of screen)
        // Zero-gradient extrapolation (Neumann) for distribution functions
        if (i === this.NX - 1) {
          for (let k = 0; k < this.Q; k++) {
            this.fTemp[i][j][k] = this.f[i-1][j][k];
          }
          
          this.rho[i][j] = this.rho[i-1][j];
          this.ux[i][j] = this.ux[i-1][j];
          this.uy[i][j] = this.uy[i-1][j];
          continue;
        }
        
        // Free-slip boundary conditions on top and bottom
        // Allow horizontal flow but zero vertical velocity
        if (j === 0 || j === this.NY - 1) {
          v = 0.0; // No vertical flow at top/bottom boundaries
          // Keep horizontal velocity u unchanged
        }
        
        // Clamp density for stability
        density = Math.max(0.5, Math.min(2.0, density));
        
        // Store macroscopic values
        this.rho[i][j] = density;
        this.ux[i][j] = u;
        this.uy[i][j] = v;
        
        // Collision step: TRT-LES (Two-Relaxation Time with Smagorinsky)
        // This is much more stable than standard BGK, as recommended by the paper
        
        // 1. Calculate Smagorinsky turbulence (same as before)
        let S = 0;
        if (i > 0 && i < this.NX - 1 && j > 0 && j < this.NY - 1) {
          const du_dx = (this.ux[i+1][j] - this.ux[i-1][j]) / 2;
          const du_dy = (this.ux[i][j+1] - this.ux[i][j-1]) / 2;
          const dv_dx = (this.uy[i+1][j] - this.uy[i-1][j]) / 2;
          const dv_dy = (this.uy[i][j+1] - this.uy[i][j-1]) / 2;
          
          const Sxx = du_dx;
          const Syy = dv_dy;
          const Sxy = 0.5 * (du_dy + dv_dx);
          S = Math.sqrt(2 * (Sxx*Sxx + Syy*Syy + 2*Sxy*Sxy));
        }
        
        const C_Smag = 0.15;
        const tau_0 = 1.0 / this.OMEGA;
        const tau_eff = tau_0 + 0.5 * (Math.sqrt(tau_0*tau_0 + 18.0 * C_Smag * C_Smag * S) - tau_0);
        const omega_plus = 1.0 / tau_eff; // Viscous relaxation rate
        
        // TRT "Magic Parameter" Lambda = 1/4 for best boundary location accuracy
        // (1/omega_plus - 0.5) * (1/omega_minus - 0.5) = 1/4
        const omega_minus = 1.0 / (0.5 + 1.0 / (4.0 * (1.0/omega_plus - 0.5)));
        
        // 2. TRT Collision
        for (let k = 0; k < this.Q; k++) {
          const k_opp = this.opp[k];
          const feq_k = this.equilibrium(k, density, u, v);
          const feq_k_opp = this.equilibrium(k_opp, density, u, v);
          
          // Symmetric and Anti-symmetric non-equilibrium parts
          const f_neq_plus = 0.5 * ((this.f[i][j][k] - feq_k) + (this.f[i][j][k_opp] - feq_k_opp));
          const f_neq_minus = 0.5 * ((this.f[i][j][k] - feq_k) - (this.f[i][j][k_opp] - feq_k_opp));
          
          // Relax with different rates
          this.fTemp[i][j][k] = this.f[i][j][k] - omega_plus * f_neq_plus - omega_minus * f_neq_minus;
          
          // Clamp for stability
          this.fTemp[i][j][k] = Math.max(0, this.fTemp[i][j][k]);
        }
      }
    }
    
    // Swap arrays again
    temp = this.f;
    this.f = this.fTemp;
    this.fTemp = temp;
  }
  
  visualize(time) {
    this.ctx.clearRect(0, 0, this.cfdCanvas.width, this.cfdCanvas.height);
    
    // Track maximum velocity in current frame (only in visible region)
    this.currentMaxVelocity = 0;
    for (let i = this.X_OFFSET; i < this.X_OFFSET + this.NX_VISIBLE; i++) {
      for (let j = this.Y_OFFSET; j < this.Y_OFFSET + this.NY_VISIBLE; j++) {
        if (this.obstacle[i][j]) continue;
        const speed = Math.sqrt(this.ux[i][j] * this.ux[i][j] + this.uy[i][j] * this.uy[i][j]);
        if (speed > this.currentMaxVelocity) {
          this.currentMaxVelocity = speed;
        }
      }
    }
    
    // Smooth the max velocity to avoid jitter (exponential moving average)
    this.maxVelocitySmoothed = this.maxVelocitySmoothed * 0.9 + this.currentMaxVelocity * 0.1;
    
    // Visualize velocity magnitude with color and streamlines
    // Only render the visible region (skip padding zones)
    const visibleStartX = this.X_OFFSET;
    const visibleEndX = this.X_OFFSET + this.NX_VISIBLE;
    const visibleStartY = this.Y_OFFSET;
    const visibleEndY = this.Y_OFFSET + this.NY_VISIBLE;
    
    for (let i = visibleStartX; i < visibleEndX; i++) {
      for (let j = visibleStartY; j < visibleEndY; j++) {
        // Skip obstacles - we want to see the buildings underneath
        if (this.obstacle[i][j]) continue;
        
        const speed = Math.sqrt(this.ux[i][j] * this.ux[i][j] + this.uy[i][j] * this.uy[i][j]);
        
        // Color based on velocity magnitude with transparency
        // Normalize against DYNAMIC maximum for adaptive color scaling
        const normalized = Math.min(speed / Math.max(this.maxVelocitySmoothed, 0.01), 1.0);
        const hue = 240 - normalized * 240; // Blue (240) to Red (0)
        const saturation = 70 + normalized * 20;
        const lightness = 40 + normalized * 30;
        // Lower alpha for better transparency
        this.ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`;
        
        // Map to canvas coordinates (subtract offsets)
        const x = (i - this.X_OFFSET) * this.cellSize;
        const y = (j - this.Y_OFFSET) * this.cellSize;
        this.ctx.fillRect(x, y, this.cellSize + 1, this.cellSize + 1);
      }
    }
    
    // Draw velocity vectors (streamlines) at regular intervals
    const vectorSpacing = Math.max(6, Math.floor(this.NX_VISIBLE / 25));
    const vectorScale = this.cellSize * 3;
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 2;
    
    for (let i = visibleStartX + vectorSpacing; i < visibleEndX; i += vectorSpacing) {
      for (let j = visibleStartY + vectorSpacing; j < visibleEndY; j += vectorSpacing) {
        if (this.obstacle[i][j]) continue;
        
        const speed = Math.sqrt(this.ux[i][j] * this.ux[i][j] + this.uy[i][j] * this.uy[i][j]);
        if (speed < 0.001) continue;
        
        // Map to canvas coordinates (subtract offsets)
        const x = (i - this.X_OFFSET) * this.cellSize + this.cellSize / 2;
        const y = (j - this.Y_OFFSET) * this.cellSize + this.cellSize / 2;
        // Scale vectors by actual speed relative to DYNAMIC maximum
        const speedRatio = Math.min(speed / Math.max(this.maxVelocitySmoothed * 0.5, 0.01), 1.5);
        const vx = (this.ux[i][j] / speed) * vectorScale * speedRatio;
        const vy = (this.uy[i][j] / speed) * vectorScale * speedRatio;
        
        // Draw arrow
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + vx, y + vy);
        this.ctx.stroke();
        
        // Arrow head
        const angle = Math.atan2(vy, vx);
        const headLen = 5;
        this.ctx.beginPath();
        this.ctx.moveTo(x + vx, y + vy);
        this.ctx.lineTo(
          x + vx - headLen * Math.cos(angle - Math.PI / 6),
          y + vy - headLen * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(x + vx, y + vy);
        this.ctx.lineTo(
          x + vx - headLen * Math.cos(angle + Math.PI / 6),
          y + vy - headLen * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
      }
    }
    
    // Draw animated flow particles
    this.drawFlowParticles(time);
  }
  
  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.NUM_PARTICLES; i++) {
      this.particles.push({
        // Start particles in the visible region only
        x: this.X_OFFSET + Math.random() * this.NX_VISIBLE,
        y: this.Y_OFFSET + Math.random() * this.NY_VISIBLE,
        age: Math.random() * 150 // Longer max age for more particles on screen
      });
    }
  }
  
  drawFlowParticles(time) {
    // Update and draw particles with glow effect
    this.particles.forEach(p => {
      const i = Math.floor(p.x);
      const j = Math.floor(p.y);
      
      if (i >= 0 && i < this.NX && j >= 0 && j < this.NY) {
        // Check if particle hit an obstacle
        if (this.obstacle[i][j]) {
          // Bounce particle slightly away from obstacle
          p.x -= this.ux[i][j] * this.PARTICLE_SPEED_MULTIPLIER * 2;
          p.y -= this.uy[i][j] * this.PARTICLE_SPEED_MULTIPLIER * 2;
          p.age += 2; // Age faster when hitting obstacles
        } else {
          // Move particle with flow using bilinear interpolation for smoother motion
          const fracI = p.x - i;
          const fracJ = p.y - j;
          
          // Sample velocity at current cell and neighbors
          let velX = this.ux[i][j];
          let velY = this.uy[i][j];
          
          // Bilinear interpolation if neighbors exist
          if (i + 1 < this.NX && j + 1 < this.NY) {
            velX = (1 - fracI) * (1 - fracJ) * this.ux[i][j] +
                   fracI * (1 - fracJ) * this.ux[i + 1][j] +
                   (1 - fracI) * fracJ * this.ux[i][j + 1] +
                   fracI * fracJ * this.ux[i + 1][j + 1];
            
            velY = (1 - fracI) * (1 - fracJ) * this.uy[i][j] +
                   fracI * (1 - fracJ) * this.uy[i + 1][j] +
                   (1 - fracI) * fracJ * this.uy[i][j + 1] +
                   fracI * fracJ * this.uy[i + 1][j + 1];
          }
          
          p.x += velX * this.PARTICLE_SPEED_MULTIPLIER;
          p.y += velY * this.PARTICLE_SPEED_MULTIPLIER;
          p.age += 0.3;
        }
        
        // Only draw particles in the visible region
        if (i >= this.X_OFFSET && i < this.X_OFFSET + this.NX_VISIBLE && 
            j >= this.Y_OFFSET && j < this.Y_OFFSET + this.NY_VISIBLE) {
          // Draw particle with glow
          const alpha = Math.max(0, 1 - p.age / 150);
          const size = 2.5 + Math.sin(time * 0.01 + p.age * 0.1) * 0.5;
          
          // Speed-based color (faster = more red/yellow)
          const speed = Math.sqrt(this.ux[i][j] * this.ux[i][j] + this.uy[i][j] * this.uy[i][j]);
          const speedNorm = Math.min(speed / this.WIND_SPEED, 1.0);
          const r = 255;
          const g = 255 - speedNorm * 100;
          const b = 150 - speedNorm * 150;
          
          // Glow effect
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`;
          this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.9})`;
          
          this.ctx.globalAlpha = alpha;
          this.ctx.beginPath();
          // Map to canvas coordinates (subtract offsets)
          const canvasX = (p.x - this.X_OFFSET) * this.cellSize;
          const canvasY = (p.y - this.Y_OFFSET) * this.cellSize;
          this.ctx.arc(canvasX, canvasY, size, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.globalAlpha = 1.0;
          this.ctx.shadowBlur = 0;
        }
      }
      
      // Reset particle if it goes out of bounds or ages out
      // Allow particles to exist slightly upstream (buffer) so they can flow into the visible area
      const upstreamBuffer = 20;
      if (p.x < this.X_OFFSET - upstreamBuffer || p.x >= this.X_OFFSET + this.NX_VISIBLE || 
          p.y < this.Y_OFFSET || p.y >= this.Y_OFFSET + this.NY_VISIBLE || p.age > 150) {
        
        // Determine respawn strategy
        let respawnType = 'random';
        
        // If it flowed out the right side, respawn at inlet to maintain flow
        if (p.x >= this.X_OFFSET + this.NX_VISIBLE) {
          respawnType = 'inlet';
        }
        // If it died of age or hit other boundaries, respawn randomly
        
        if (respawnType === 'random') {
           p.x = this.X_OFFSET + Math.random() * this.NX_VISIBLE;
           p.y = this.Y_OFFSET + Math.random() * this.NY_VISIBLE;
        } else {
           // Inlet respawn: spawn slightly upstream so they flow in smoothly
           // This prevents "popping" and accumulation at the exact edge
           p.x = this.X_OFFSET - Math.random() * 15; 
           p.y = this.Y_OFFSET + Math.random() * this.NY_VISIBLE;
        }
        
        p.age = 0;
        
        // Ensure we don't spawn inside an obstacle
        let attempts = 0;
        while (attempts < 10) {
          const i = Math.floor(p.x);
          const j = Math.floor(p.y);
          // Check bounds and obstacles
          if (i >= 0 && i < this.NX && j >= 0 && j < this.NY && !this.obstacle[i][j]) {
            break;
          }
          
          // Try again with same strategy
          if (respawnType === 'random') {
             p.x = this.X_OFFSET + Math.random() * this.NX_VISIBLE;
             p.y = this.Y_OFFSET + Math.random() * this.NY_VISIBLE;
          } else {
             p.x = this.X_OFFSET - Math.random() * 15;
             p.y = this.Y_OFFSET + Math.random() * this.NY_VISIBLE;
          }
          attempts++;
        }
      }
    });
  }
  
  latticeToRealSpeed(latticeSpeed) {
    // Convert lattice units to m/s based on domain scaling
    const metersPerCell = this.DOMAIN_WIDTH_METERS / this.NX_VISIBLE;
    return latticeSpeed * metersPerCell * 60; // Approximate scaling factor
  }
  
  animate() {
    if (!this.isSimulating) return;
    
    const time = performance.now();
    
    // During warmup, run 3 steps per frame for faster flow development
    // After warmup, run 1 step per frame for smooth visualization
    const stepsPerFrame = this.simulationSteps < this.WARMUP_STEPS ? 3 : 1;
    
    for (let s = 0; s < stepsPerFrame; s++) {
      this.simulationStep();
      this.simulationSteps++;
    }
    
    this.visualize(time);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
  
  start() {
    if (this.isSimulating) {
      this.stop();
      return;
    }
    
    this.isSimulating = true;
    this.simulationSteps = 0;
    this.cfdCanvas.classList.add('active');
    this.cfdBtn.classList.add('toggled-on');
    this.cfdBtn.style.background = '#0078d4';
    this.cfdBtn.style.color = '#fff';
    
    // Broadcast state to controller
    this.channel.postMessage({ type: 'animation_state', animationId: 'cfd-simulation-btn', isActive: true });
    
    // Play wind sound
    this.windAudio.play().catch(e => console.warn("Audio play failed:", e));
    
    this.resizeCanvas();
    this.initParticles();
    this.animate();
    
    if (typeof showToast === 'function') {
      showToast('CFD Simulation: Wind flowing left to right (screen space)', 4000);
    }
  }
  
  stop() {
    this.isSimulating = false;
    this.cfdCanvas.classList.remove('active');
    this.cfdBtn.classList.remove('toggled-on');
    this.cfdBtn.style.background = '';
    this.cfdBtn.style.color = '';
    
    // Broadcast state to controller
    this.channel.postMessage({ type: 'animation_state', animationId: 'cfd-simulation-btn', isActive: false });
    
    // Stop wind sound
    this.windAudio.pause();
    this.windAudio.currentTime = 0;
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    this.ctx.clearRect(0, 0, this.cfdCanvas.width, this.cfdCanvas.height);
    
    if (typeof showToast === 'function') {
      showToast(`CFD Simulation stopped (${this.simulationSteps} steps)`, 3000);
    }
  }
  
  toggle() {
    if (this.isSimulating) {
      this.stop();
    } else {
      this.start();
    }
  }
}

export { CFDSimulation };
