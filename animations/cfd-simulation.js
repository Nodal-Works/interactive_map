// ===== Lattice Boltzmann CFD Simulation =====
// Real-time wind flow simulation around building obstacles
// Wind direction: Left to Right (in screen space, accounting for map rotation)

(function() {
  'use strict';

  // Canvas and button setup
  const cfdCanvas = document.getElementById('cfd-simulation-canvas');
  const cfdBtn = document.getElementById('cfd-simulation-btn');
  
  if (!cfdCanvas || !cfdBtn) {
    console.warn('CFD Simulation: Required elements not found');
    return;
  }

  const ctx = cfdCanvas.getContext('2d');
  let animationFrame = null;
  let isSimulating = false;
  
  // Audio setup
  const windAudio = new Audio('media/sound/wind.mp3');
  windAudio.loop = true;
  
  // Simulation parameters
  let GRID_RESOLUTION = 200; // Number of cells along longer dimension
  const UPSTREAM_FACTOR = 1.0; // Extend domain 1x to the left (reduced for performance)
  const DOWNSTREAM_FACTOR = 0.5; // Extend domain 0.5x to the right (reduced for performance)
  const VERTICAL_PADDING_FACTOR = 0.2; // Extend domain 20% on top and bottom (reduced for performance)
  let NX, NY; // Grid dimensions (including all extensions)
  let NX_VISIBLE, NY_VISIBLE; // Visible grid dimensions
  let X_OFFSET, Y_OFFSET; // Offsets to start of visible region
  let cellSize; // Size of each cell in pixels
  
  // Map rotation - wind flows left-to-right in SCREEN space
  const MAP_BEARING = -92.58546386659737; // Map rotation in degrees
  const WIND_BEARING = 90; // Wind comes from left (90° in screen space)
  // Actual wind direction in geographic space = WIND_BEARING - MAP_BEARING
  const GEOGRAPHIC_WIND_ANGLE = (WIND_BEARING - MAP_BEARING) * Math.PI / 180;
  
  // Real-world scaling parameters
  let REAL_WIND_SPEED_MPS = 5.0; // Wind speed in meters per second (m/s)
  let DOMAIN_WIDTH_METERS = 500; // Approximate width of visible domain in meters
  
  // Lattice Boltzmann parameters (tuned for stability)
  const Q = 9; // D2Q9 lattice (9 velocities in 2D)
  let OMEGA = 1.2; // Base relaxation parameter (higher = lower viscosity)
  let WIND_SPEED = 0.05; // Inlet wind speed in lattice units (increased for better Reynolds number)
  const VISCOSITY = 0.05; // Kinematic viscosity (lower = more turbulent)
  const MAX_VELOCITY = 0.3; // Velocity clamp for stability
  let WIND_ANGLE = 0; // Wind direction in degrees (0 = left to right)
  
  // D2Q9 lattice velocities (directions)
  const ex = [0, 1, 0, -1, 0, 1, -1, -1, 1]; // x components
  const ey = [0, 0, 1, 0, -1, 1, 1, -1, -1]; // y components
  const w = [4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36]; // weights
  
  // Opposite direction indices for bounce-back
  const opp = [0, 3, 4, 1, 2, 7, 8, 5, 6];
  
  // Grid arrays
  let f = null; // Distribution functions [x][y][direction]
  let fTemp = null; // Temporary distribution functions
  let rho = null; // Density [x][y]
  let ux = null; // Velocity x-component [x][y]
  let uy = null; // Velocity y-component [x][y]
  let obstacle = null; // Boolean obstacle map [x][y] (solid - buildings)
  let treeObstacle = null; // Boolean tree obstacle map [x][y] (permeable)
  
  // Dynamic velocity scale tracking
  let currentMaxVelocity = 0;
  let maxVelocitySmoothed = 0; // Smoothed version to avoid jitter in legend
  
  // Building obstacles from map
  let buildingPolygons = [];
  
  // Tree obstacles
  let treeObstacles = [];
  let INCLUDE_TREES = true; // Toggle tree obstacles
  const TREE_BASE_RADIUS = 2; // Base radius in meters for tree canopy
  const TREE_RADIUS_VARIATION = 1.5; // Random variation in meters
  const TREE_HEIGHT_FACTOR = 0.3; // Additional radius per meter of height
  const TREE_POROSITY = 0.6; // Porosity factor (0 = solid, 1 = fully permeable)
  
  function resizeCanvas() {
    const s = computeOverlayPixelSize();
    cfdCanvas.width = s.w;
    cfdCanvas.height = s.h;
    cfdCanvas.style.width = s.w + 'px';
    cfdCanvas.style.height = s.h + 'px';
    
    // Calculate visible grid dimensions
    const aspectRatio = s.w / s.h;
    if (aspectRatio > 1) {
      NX_VISIBLE = GRID_RESOLUTION;
      NY_VISIBLE = Math.floor(GRID_RESOLUTION / aspectRatio);
    } else {
      NY_VISIBLE = GRID_RESOLUTION;
      NX_VISIBLE = Math.floor(GRID_RESOLUTION * aspectRatio);
    }
    
    // Extend computational domain on all sides to reduce edge effects
    X_OFFSET = Math.floor(NX_VISIBLE * UPSTREAM_FACTOR); // Left (upstream)
    const X_DOWNSTREAM = Math.floor(NX_VISIBLE * DOWNSTREAM_FACTOR); // Right (downstream)
    Y_OFFSET = Math.floor(NY_VISIBLE * VERTICAL_PADDING_FACTOR); // Top
    const Y_BOTTOM = Math.floor(NY_VISIBLE * VERTICAL_PADDING_FACTOR); // Bottom
    
    NX = X_OFFSET + NX_VISIBLE + X_DOWNSTREAM;
    NY = Y_OFFSET + NY_VISIBLE + Y_BOTTOM;
    
    cellSize = s.w / NX_VISIBLE;
    
    console.log(`CFD Grid: ${NX}x${NY} (visible: ${NX_VISIBLE}x${NY_VISIBLE}, offsets: X=${X_OFFSET}, Y=${Y_OFFSET})`);
    
    initializeSimulation();
  }
  
  function initializeSimulation() {
    // Initialize arrays
    f = new Array(NX);
    fTemp = new Array(NX);
    rho = new Array(NX);
    ux = new Array(NX);
    uy = new Array(NX);
    obstacle = new Array(NX);
    treeObstacle = new Array(NX);
    
    for (let i = 0; i < NX; i++) {
      f[i] = new Array(NY);
      fTemp[i] = new Array(NY);
      rho[i] = new Array(NY);
      ux[i] = new Array(NY);
      uy[i] = new Array(NY);
      obstacle[i] = new Array(NY);
      treeObstacle[i] = new Array(NY);
      
      for (let j = 0; j < NY; j++) {
        f[i][j] = new Array(Q);
        fTemp[i][j] = new Array(Q);
        
        // Initialize with equilibrium distribution for uniform flow
        // Wind flows left-to-right in SCREEN space (i direction)
        const u0 = WIND_SPEED; // Horizontal flow in screen space
        const v0 = 0.0; // No vertical component in screen space
        const rho0 = 1.0;
        
        for (let k = 0; k < Q; k++) {
          f[i][j][k] = equilibrium(k, rho0, u0, v0);
          fTemp[i][j][k] = f[i][j][k];
        }
        
        rho[i][j] = rho0;
        ux[i][j] = u0;
        uy[i][j] = v0;
        obstacle[i][j] = false;
        treeObstacle[i][j] = false;
      }
    }
    
    // Load building obstacles from map
    loadBuildingObstacles();
    
    // Load tree obstacles
    loadTreeObstacles();
  }
  
  function equilibrium(k, density, u, v) {
    // Equilibrium distribution function
    const cu = ex[k] * u + ey[k] * v;
    const u2 = u * u + v * v;
    return w[k] * density * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2);
  }
  
  function loadBuildingObstacles() {
    buildingPolygons = [];
    
    // Try to get buildings from map
    if (typeof map !== 'undefined' && map.getSource && map.getSource('usergeo')) {
      const data = map.getSource('usergeo')._data;
      if (data && data.features) {
        data.features.forEach(feature => {
          if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            buildingPolygons.push(feature);
          }
        });
      }
    }
    
    console.log(`CFD: Loaded ${buildingPolygons.length} building obstacles`);
    
    if (buildingPolygons.length === 0) {
      // Try to load default buildings
      loadDefaultBuildings();
    } else {
      rasterizeBuildings();
    }
  }
  
  async function loadDefaultBuildings() {
    try {
      const response = await fetch('media/building-footprints.geojson');
      if (!response.ok) throw new Error('Building footprints not found');
      
      const geojson = await response.json();
      geojson.features.forEach(feature => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          buildingPolygons.push(feature);
        }
      });
      
      console.log(`CFD: Loaded ${buildingPolygons.length} buildings from default file`);
      rasterizeBuildings();
    } catch (error) {
      console.error('CFD: Failed to load default buildings:', error);
    }
  }
  
  function rasterizeBuildings() {
    // Convert geographic building polygons to screen-space grid obstacles
    // Uses MapLibre's project() to properly handle map rotation and projection
    if (typeof map === 'undefined' || buildingPolygons.length === 0) return;
    
    // Clear existing obstacles
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        obstacle[i][j] = false;
      }
    }
    
    // Get canvas bounds in screen space
    const canvasWidth = cfdCanvas.width;
    const canvasHeight = cfdCanvas.height;
    
    // Get map container position (map excludes sidebars: left:60px, right:60px)
    const mapContainer = map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    
    // Canvas is centered on the window, calculate its position
    const canvasRect = cfdCanvas.getBoundingClientRect();
    
    // Add building obstacles
    buildingPolygons.forEach(building => {
      const coords = building.geometry.type === 'Polygon' 
        ? building.geometry.coordinates[0] 
        : building.geometry.coordinates[0][0];
      
      // Convert geographic coordinates to screen pixels using map.project()
      const screenPoints = coords.map(coord => {
        // map.project returns pixel coords relative to map container
        const point = map.project([coord[0], coord[1]]);
        
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
      const gridMinX = Math.max(X_OFFSET, Math.floor(minX / cellSize) + X_OFFSET);
      const gridMaxX = Math.min(NX - 1, Math.ceil(maxX / cellSize) + X_OFFSET);
      const gridMinY = Math.max(Y_OFFSET, Math.floor(minY / cellSize) + Y_OFFSET);
      const gridMaxY = Math.min(NY - 1, Math.ceil(maxY / cellSize) + Y_OFFSET);
      
      // Fill building area with obstacles
      for (let i = gridMinX; i <= gridMaxX; i++) {
        for (let j = gridMinY; j <= gridMaxY; j++) {
          // Check if grid cell center is inside the polygon
          // Subtract offsets to get canvas coordinates
          const cellCenterX = (i - X_OFFSET + 0.5) * cellSize;
          const cellCenterY = (j - Y_OFFSET + 0.5) * cellSize;
          
          if (pointInScreenPolygon({x: cellCenterX, y: cellCenterY}, screenPoints)) {
            obstacle[i][j] = true;
          }
        }
      }
    });
    
    console.log('CFD: Buildings rasterized to screen-space grid');
  }
  
  async function loadTreeObstacles() {
    try {
      const response = await fetch('media/trees.geojson');
      if (!response.ok) {
        console.warn('CFD: Trees file not found');
        return;
      }
      
      const geojson = await response.json();
      
      // Process tree points into circular obstacles
      treeObstacles = [];
      
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
          const randomVariation = (seededRandom(idx) - 0.5) * 2 * TREE_RADIUS_VARIATION;
          const radius = TREE_BASE_RADIUS + (height * TREE_HEIGHT_FACTOR) + randomVariation;
          
          treeObstacles.push({
            center: coords,
            radius: Math.max(1, radius), // minimum 1 meter radius
            properties: feature.properties
          });
        }
      });
      
      console.log(`CFD: Loaded ${treeObstacles.length} tree obstacles`);
      
      // Rasterize trees to the grid
      if (INCLUDE_TREES) {
        rasterizeTrees();
      }
      
    } catch (error) {
      console.warn('CFD: Failed to load trees:', error);
    }
  }
  
  function rasterizeTrees() {
    if (typeof map === 'undefined' || treeObstacles.length === 0 || !INCLUDE_TREES) return;
    
    // Get canvas bounds
    const canvasRect = cfdCanvas.getBoundingClientRect();
    const mapContainer = map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    
    let treeCellCount = 0;
    
    treeObstacles.forEach(tree => {
      // Project tree center to screen coordinates
      const point = map.project(tree.center);
      const screenX = point.x + mapRect.left;
      const screenY = point.y + mapRect.top;
      const canvasX = screenX - canvasRect.left;
      const canvasY = screenY - canvasRect.top;
      
      // Convert radius from meters to pixels (approximate)
      // Use map zoom to estimate meters per pixel
      const zoom = map.getZoom();
      const lat = tree.center[1];
      const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      const radiusPixels = tree.radius / metersPerPixel;
      
      // Convert to grid coordinates
      const gridCenterX = Math.floor(canvasX / cellSize) + X_OFFSET;
      const gridCenterY = Math.floor(canvasY / cellSize) + Y_OFFSET;
      const gridRadius = Math.ceil(radiusPixels / cellSize);
      
      // Fill circular area with permeable tree obstacles
      for (let di = -gridRadius; di <= gridRadius; di++) {
        for (let dj = -gridRadius; dj <= gridRadius; dj++) {
          const i = gridCenterX + di;
          const j = gridCenterY + dj;
          
          // Check if within grid bounds
          if (i >= 0 && i < NX && j >= 0 && j < NY) {
            // Check if within circle radius
            const dist = Math.sqrt(di * di + dj * dj);
            if (dist <= gridRadius) {
              treeObstacle[i][j] = true;
              treeCellCount++;
            }
          }
        }
      }
    });
    
    console.log(`CFD: Rasterized ${treeCellCount} tree cells to grid (permeable)`);
  }
  
  function clearTreeObstacles() {
    // Clear tree obstacles
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        treeObstacle[i][j] = false;
      }
    }
  }
  
  function toggleTrees() {
    INCLUDE_TREES = !INCLUDE_TREES;
    
    if (INCLUDE_TREES) {
      rasterizeTrees();
      console.log('CFD: Trees enabled (permeable obstacles)');
    } else {
      clearTreeObstacles();
      console.log('CFD: Trees disabled');
    }
  }
  
  function pointInScreenPolygon(point, polygon) {
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
  
  function simulationStep() {
    // Streaming step
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        for (let k = 0; k < Q; k++) {
          const nextI = i + ex[k];
          const nextJ = j + ey[k];
          
          // Stream to neighbors if within bounds
          if (nextI >= 0 && nextI < NX && nextJ >= 0 && nextJ < NY) {
            fTemp[nextI][nextJ][k] = f[i][j][k];
          }
        }
      }
    }
    
    // Apply free-slip boundaries at top and bottom (allow parallel flow, zero normal velocity)
    for (let i = 0; i < NX; i++) {
      // Top boundary (j = 0) - mirror velocities to enforce zero vertical velocity
      if (i > 0 && i < NX - 1) {
        for (let k = 0; k < Q; k++) {
          fTemp[i][0][k] = fTemp[i][1][k]; // Copy from interior
        }
      }
      
      // Bottom boundary (j = NY-1) - mirror velocities to enforce zero vertical velocity
      if (i > 0 && i < NX - 1) {
        for (let k = 0; k < Q; k++) {
          fTemp[i][NY-1][k] = fTemp[i][NY-2][k]; // Copy from interior
        }
      }
    }
    
    // Swap arrays
    let temp = f;
    f = fTemp;
    fTemp = temp;
    
    // Boundary conditions and collision
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        // Handle solid obstacles (buildings) with full bounce-back
        if (obstacle[i][j]) {
          for (let k = 0; k < Q; k++) {
            fTemp[i][j][k] = f[i][j][opp[k]];
          }
          continue;
        }
        
        // Handle permeable obstacles (trees) with partial bounce-back
        // This models porous media where some flow passes through
        const isTreeCell = INCLUDE_TREES && treeObstacle && treeObstacle[i][j];
        
        // Compute macroscopic quantities
        let density = 0.0;
        let u = 0.0;
        let v = 0.0;
        
        for (let k = 0; k < Q; k++) {
          density += f[i][j][k];
          u += ex[k] * f[i][j][k];
          v += ey[k] * f[i][j][k];
        }
        
        u /= density;
        v /= density;
        
        // Apply drag for tree cells (porous media resistance)
        if (isTreeCell) {
          // Reduce velocity through trees based on porosity
          const dragFactor = 1.0 - TREE_POROSITY; // 0.4 means 40% velocity reduction
          u *= TREE_POROSITY;
          v *= TREE_POROSITY;
        }
        
        // Clamp velocities for stability
        const speed = Math.sqrt(u * u + v * v);
        if (speed > MAX_VELOCITY) {
          u = (u / speed) * MAX_VELOCITY;
          v = (v / speed) * MAX_VELOCITY;
        }
        
        // Inlet boundary condition (left side of screen)
        // Force equilibrium state to prevent backflow/instability
        if (i === 0) {
          const u_inlet = WIND_SPEED;
          const v_inlet = 0.0;
          const rho_inlet = 1.0;
          
          for (let k = 0; k < Q; k++) {
            fTemp[i][j][k] = equilibrium(k, rho_inlet, u_inlet, v_inlet);
          }
          
          rho[i][j] = rho_inlet;
          ux[i][j] = u_inlet;
          uy[i][j] = v_inlet;
          continue;
        }
        
        // Outflow boundary condition (right side of screen)
        // Zero-gradient extrapolation (Neumann) for distribution functions
        if (i === NX - 1) {
          for (let k = 0; k < Q; k++) {
            fTemp[i][j][k] = f[i-1][j][k];
          }
          
          rho[i][j] = rho[i-1][j];
          ux[i][j] = ux[i-1][j];
          uy[i][j] = uy[i-1][j];
          continue;
        }
        
        // Free-slip boundary conditions on top and bottom
        // Allow horizontal flow but zero vertical velocity
        if (j === 0 || j === NY - 1) {
          v = 0.0; // No vertical flow at top/bottom boundaries
          // Keep horizontal velocity u unchanged
        }
        
        // Clamp density for stability
        density = Math.max(0.5, Math.min(2.0, density));
        
        // Store macroscopic values
        rho[i][j] = density;
        ux[i][j] = u;
        uy[i][j] = v;
        
        // Collision step: TRT-LES (Two-Relaxation Time with Smagorinsky)
        // This is much more stable than standard BGK, as recommended by the paper
        
        // 1. Calculate Smagorinsky turbulence (same as before)
        let S = 0;
        if (i > 0 && i < NX - 1 && j > 0 && j < NY - 1) {
          const du_dx = (ux[i+1][j] - ux[i-1][j]) / 2;
          const du_dy = (ux[i][j+1] - ux[i][j-1]) / 2;
          const dv_dx = (uy[i+1][j] - uy[i-1][j]) / 2;
          const dv_dy = (uy[i][j+1] - uy[i][j-1]) / 2;
          
          const Sxx = du_dx;
          const Syy = dv_dy;
          const Sxy = 0.5 * (du_dy + dv_dx);
          S = Math.sqrt(2 * (Sxx*Sxx + Syy*Syy + 2*Sxy*Sxy));
        }
        
        const C_Smag = 0.15;
        const tau_0 = 1.0 / OMEGA;
        const tau_eff = tau_0 + 0.5 * (Math.sqrt(tau_0*tau_0 + 18.0 * C_Smag * C_Smag * S) - tau_0);
        const omega_plus = 1.0 / tau_eff; // Viscous relaxation rate
        
        // TRT "Magic Parameter" Lambda = 1/4 for best boundary location accuracy
        // (1/omega_plus - 0.5) * (1/omega_minus - 0.5) = 1/4
        const omega_minus = 1.0 / (0.5 + 1.0 / (4.0 * (1.0/omega_plus - 0.5)));
        
        // 2. TRT Collision
        for (let k = 0; k < Q; k++) {
          const k_opp = opp[k];
          const feq_k = equilibrium(k, density, u, v);
          const feq_k_opp = equilibrium(k_opp, density, u, v);
          
          // Symmetric and Anti-symmetric non-equilibrium parts
          const f_neq_plus = 0.5 * ((f[i][j][k] - feq_k) + (f[i][j][k_opp] - feq_k_opp));
          const f_neq_minus = 0.5 * ((f[i][j][k] - feq_k) - (f[i][j][k_opp] - feq_k_opp));
          
          // Relax with different rates
          fTemp[i][j][k] = f[i][j][k] - omega_plus * f_neq_plus - omega_minus * f_neq_minus;
          
          // Clamp for stability
          fTemp[i][j][k] = Math.max(0, fTemp[i][j][k]);
        }
      }
    }
    
    // Swap arrays again
    temp = f;
    f = fTemp;
    fTemp = temp;
  }
  
  function visualize(time) {
    ctx.clearRect(0, 0, cfdCanvas.width, cfdCanvas.height);
    
    // Track maximum velocity in current frame (only in visible region)
    currentMaxVelocity = 0;
    for (let i = X_OFFSET; i < X_OFFSET + NX_VISIBLE; i++) {
      for (let j = Y_OFFSET; j < Y_OFFSET + NY_VISIBLE; j++) {
        if (obstacle[i][j]) continue;
        const speed = Math.sqrt(ux[i][j] * ux[i][j] + uy[i][j] * uy[i][j]);
        if (speed > currentMaxVelocity) {
          currentMaxVelocity = speed;
        }
      }
    }
    
    // Smooth the max velocity to avoid jitter (exponential moving average)
    maxVelocitySmoothed = maxVelocitySmoothed * 0.9 + currentMaxVelocity * 0.1;
    
    // Visualize velocity magnitude with color and streamlines
    // Only render the visible region (skip padding zones)
    const visibleStartX = X_OFFSET;
    const visibleEndX = X_OFFSET + NX_VISIBLE;
    const visibleStartY = Y_OFFSET;
    const visibleEndY = Y_OFFSET + NY_VISIBLE;
    
    for (let i = visibleStartX; i < visibleEndX; i++) {
      for (let j = visibleStartY; j < visibleEndY; j++) {
        // Skip obstacles - we want to see the buildings underneath
        if (obstacle[i][j]) continue;
        
        const speed = Math.sqrt(ux[i][j] * ux[i][j] + uy[i][j] * uy[i][j]);
        
        // Color based on velocity magnitude with transparency
        // Normalize against DYNAMIC maximum for adaptive color scaling
        const normalized = Math.min(speed / Math.max(maxVelocitySmoothed, 0.01), 1.0);
        const hue = 240 - normalized * 240; // Blue (240) to Red (0)
        const saturation = 70 + normalized * 20;
        const lightness = 40 + normalized * 30;
        // Lower alpha for better transparency
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`;
        
        // Map to canvas coordinates (subtract offsets)
        const x = (i - X_OFFSET) * cellSize;
        const y = (j - Y_OFFSET) * cellSize;
        ctx.fillRect(x, y, cellSize + 1, cellSize + 1);
      }
    }
    
    // Draw velocity vectors (streamlines) at regular intervals
    const vectorSpacing = Math.max(6, Math.floor(NX_VISIBLE / 25));
    const vectorScale = cellSize * 3;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    
    for (let i = visibleStartX + vectorSpacing; i < visibleEndX; i += vectorSpacing) {
      for (let j = visibleStartY + vectorSpacing; j < visibleEndY; j += vectorSpacing) {
        if (obstacle[i][j]) continue;
        
        const speed = Math.sqrt(ux[i][j] * ux[i][j] + uy[i][j] * uy[i][j]);
        if (speed < 0.001) continue;
        
        // Map to canvas coordinates (subtract offsets)
        const x = (i - X_OFFSET) * cellSize + cellSize / 2;
        const y = (j - Y_OFFSET) * cellSize + cellSize / 2;
        // Scale vectors by actual speed relative to DYNAMIC maximum
        const speedRatio = Math.min(speed / Math.max(maxVelocitySmoothed * 0.5, 0.01), 1.5);
        const vx = (ux[i][j] / speed) * vectorScale * speedRatio;
        const vy = (uy[i][j] / speed) * vectorScale * speedRatio;
        
        // Draw arrow
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + vx, y + vy);
        ctx.stroke();
        
        // Arrow head
        const angle = Math.atan2(vy, vx);
        const headLen = 5;
        ctx.beginPath();
        ctx.moveTo(x + vx, y + vy);
        ctx.lineTo(
          x + vx - headLen * Math.cos(angle - Math.PI / 6),
          y + vy - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x + vx, y + vy);
        ctx.lineTo(
          x + vx - headLen * Math.cos(angle + Math.PI / 6),
          y + vy - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    }
    
    // Draw animated flow particles
    drawFlowParticles(time);
  }
  
  // Particle system for flow visualization
  let particles = [];
  let NUM_PARTICLES = 1500; // Increased from 200 for more visible flow
  let PARTICLE_SPEED_MULTIPLIER = 20; // Control particle movement speed (increased for faster flow)
  
  function initParticles() {
    particles = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      particles.push({
        // Start particles in the visible region only
        x: X_OFFSET + Math.random() * NX_VISIBLE,
        y: Y_OFFSET + Math.random() * NY_VISIBLE,
        age: Math.random() * 150 // Longer max age for more particles on screen
      });
    }
  }
  
  function drawFlowParticles(time) {
    // Update and draw particles with glow effect
    particles.forEach(p => {
      const i = Math.floor(p.x);
      const j = Math.floor(p.y);
      
      if (i >= 0 && i < NX && j >= 0 && j < NY) {
        // Check if particle hit an obstacle
        if (obstacle[i][j]) {
          // Bounce particle slightly away from obstacle
          p.x -= ux[i][j] * PARTICLE_SPEED_MULTIPLIER * 2;
          p.y -= uy[i][j] * PARTICLE_SPEED_MULTIPLIER * 2;
          p.age += 2; // Age faster when hitting obstacles
        } else {
          // Move particle with flow using bilinear interpolation for smoother motion
          const fracI = p.x - i;
          const fracJ = p.y - j;
          
          // Sample velocity at current cell and neighbors
          let velX = ux[i][j];
          let velY = uy[i][j];
          
          // Bilinear interpolation if neighbors exist
          if (i + 1 < NX && j + 1 < NY) {
            velX = (1 - fracI) * (1 - fracJ) * ux[i][j] +
                   fracI * (1 - fracJ) * ux[i + 1][j] +
                   (1 - fracI) * fracJ * ux[i][j + 1] +
                   fracI * fracJ * ux[i + 1][j + 1];
            
            velY = (1 - fracI) * (1 - fracJ) * uy[i][j] +
                   fracI * (1 - fracJ) * uy[i + 1][j] +
                   (1 - fracI) * fracJ * uy[i][j + 1] +
                   fracI * fracJ * uy[i + 1][j + 1];
          }
          
          p.x += velX * PARTICLE_SPEED_MULTIPLIER;
          p.y += velY * PARTICLE_SPEED_MULTIPLIER;
          p.age += 0.3;
        }
        
        // Only draw particles in the visible region
        if (i >= X_OFFSET && i < X_OFFSET + NX_VISIBLE && 
            j >= Y_OFFSET && j < Y_OFFSET + NY_VISIBLE) {
          // Draw particle with glow
          const alpha = Math.max(0, 1 - p.age / 150);
          const size = 2.5 + Math.sin(time * 0.01 + p.age * 0.1) * 0.5;
          
          // Speed-based color (faster = more red/yellow)
          const speed = Math.sqrt(ux[i][j] * ux[i][j] + uy[i][j] * uy[i][j]);
          const speedNorm = Math.min(speed / WIND_SPEED, 1.0);
          const r = 255;
          const g = 255 - speedNorm * 100;
          const b = 150 - speedNorm * 150;
          
          // Glow effect
          ctx.shadowBlur = 10;
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.9})`;
          
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          // Map to canvas coordinates (subtract offsets)
          const canvasX = (p.x - X_OFFSET) * cellSize;
          const canvasY = (p.y - Y_OFFSET) * cellSize;
          ctx.arc(canvasX, canvasY, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.shadowBlur = 0;
        }
      }
      
      // Reset particle if it goes out of bounds or ages out
      // Allow particles to exist slightly upstream (buffer) so they can flow into the visible area
      const upstreamBuffer = 20;
      if (p.x < X_OFFSET - upstreamBuffer || p.x >= X_OFFSET + NX_VISIBLE || 
          p.y < Y_OFFSET || p.y >= Y_OFFSET + NY_VISIBLE || p.age > 150) {
        
        // Determine respawn strategy
        let respawnType = 'random';
        
        // If it flowed out the right side, respawn at inlet to maintain flow
        if (p.x >= X_OFFSET + NX_VISIBLE) {
          respawnType = 'inlet';
        }
        // If it died of age or hit other boundaries, respawn randomly
        
        if (respawnType === 'random') {
           p.x = X_OFFSET + Math.random() * NX_VISIBLE;
           p.y = Y_OFFSET + Math.random() * NY_VISIBLE;
        } else {
           // Inlet respawn: spawn slightly upstream so they flow in smoothly
           // This prevents "popping" and accumulation at the exact edge
           p.x = X_OFFSET - Math.random() * 15; 
           p.y = Y_OFFSET + Math.random() * NY_VISIBLE;
        }
        
        p.age = 0;
        
        // Ensure we don't spawn inside an obstacle
        let attempts = 0;
        while (attempts < 10) {
          const i = Math.floor(p.x);
          const j = Math.floor(p.y);
          // Check bounds and obstacles
          if (i >= 0 && i < NX && j >= 0 && j < NY && !obstacle[i][j]) {
            break;
          }
          
          // Try again with same strategy
          if (respawnType === 'random') {
             p.x = X_OFFSET + Math.random() * NX_VISIBLE;
             p.y = Y_OFFSET + Math.random() * NY_VISIBLE;
          } else {
             p.x = X_OFFSET - Math.random() * 15;
             p.y = Y_OFFSET + Math.random() * NY_VISIBLE;
          }
          attempts++;
        }
      }
    });
  }
  
  function latticeToRealSpeed(latticeSpeed) {
    // Convert lattice units to m/s based on domain scaling
    const metersPerCell = DOMAIN_WIDTH_METERS / NX_VISIBLE;
    return latticeSpeed * metersPerCell * 60; // Approximate scaling factor
  }
  
  // Legend and controls are now handled by the remote controller

  
  
  
  let simulationSteps = 0;
  const WARMUP_STEPS = 100; // Run faster during initial warmup
  
  function animate() {
    if (!isSimulating) return;
    
    const time = performance.now();
    
    // During warmup, run 3 steps per frame for faster flow development
    // After warmup, run 1 step per frame for smooth visualization
    const stepsPerFrame = simulationSteps < WARMUP_STEPS ? 3 : 1;
    
    for (let s = 0; s < stepsPerFrame; s++) {
      simulationStep();
      simulationSteps++;
    }
    
    visualize(time);
    animationFrame = requestAnimationFrame(animate);
  }
  
  function startSimulation() {
    if (isSimulating) {
      stopSimulation();
      return;
    }
    
    isSimulating = true;
    simulationSteps = 0;
    cfdCanvas.classList.add('active');
    cfdBtn.classList.add('toggled-on');
    cfdBtn.style.background = '#0078d4';
    cfdBtn.style.color = '#fff';
    
    // Play wind sound
    windAudio.play().catch(e => console.warn("Audio play failed:", e));
    
    resizeCanvas();
    initParticles();
    animate();
    
    if (typeof showToast === 'function') {
      showToast('CFD Simulation: Wind flowing left to right (screen space)', 4000);
    }
  }
  
  function stopSimulation() {
    isSimulating = false;
    cfdCanvas.classList.remove('active');
    cfdBtn.classList.remove('toggled-on');
    cfdBtn.style.background = '';
    cfdBtn.style.color = '';
    
    // Stop wind sound
    windAudio.pause();
    windAudio.currentTime = 0;
    
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    ctx.clearRect(0, 0, cfdCanvas.width, cfdCanvas.height);
    
    if (typeof showToast === 'function') {
      showToast(`CFD Simulation stopped (${simulationSteps} steps)`, 3000);
    }
  }
  
  // Wire up button
  cfdBtn.addEventListener('click', startSimulation);
  
  // Resize on window resize
  window.addEventListener('resize', () => {
    if (isSimulating) resizeCanvas();
  });
  
  console.log('CFD Simulation module loaded');
  console.log('Controls: Remote controller only');

  // Listen for remote control messages
  const channel = new BroadcastChannel('map_controller_channel');
  channel.onmessage = (event) => {
    const data = event.data;
    if (data.type === 'cfd_control') {
        switch (data.action) {
            case 'set_wind_speed':
                REAL_WIND_SPEED_MPS = parseFloat(data.value);
                // Map 0-20 m/s to 0.01-0.1 lattice units roughly
                WIND_SPEED = 0.01 + (REAL_WIND_SPEED_MPS / 20) * 0.09;
                break;
            case 'set_wind_direction':
                WIND_ANGLE = parseFloat(data.value);
                break;
            case 'set_particles':
                NUM_PARTICLES = parseInt(data.value);
                initParticles();
                break;
            case 'set_particle_speed':
                PARTICLE_SPEED_MULTIPLIER = parseFloat(data.value);
                break;
            case 'set_viscosity':
                // Map 0-1 slider to 0.5-1.9 omega (relaxation)
                // Higher omega = lower viscosity
                OMEGA = 0.5 + parseFloat(data.value) * 1.4;
                break;
            case 'set_resolution':
                GRID_RESOLUTION = parseInt(data.value);
                resizeCanvas();
                initParticles();
                break;
            case 'toggle_trees':
                toggleTrees();
                break;
        }
    }
  };
  
})();
