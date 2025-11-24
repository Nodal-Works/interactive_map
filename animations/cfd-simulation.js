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
  
  // Simulation parameters
  let GRID_RESOLUTION = 150; // Number of cells along longer dimension (visible area) - now mutable
  const UPSTREAM_FACTOR = 3; // Extend domain 3x to the left for flow development
  let NX, NY; // Grid dimensions (including upstream extension)
  let NX_VISIBLE, NY_VISIBLE; // Visible grid dimensions
  let X_OFFSET; // Offset to start of visible region
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
  let OMEGA = 1.0; // Relaxation parameter (lower = more stable, 0.5-2.0 range)
  let WIND_SPEED = 0.03; // Inlet wind speed in lattice units (reduced for stability)
  const VISCOSITY = 0.1; // Kinematic viscosity (higher = more stable)
  const MAX_VELOCITY = 0.2; // Velocity clamp for stability
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
  let obstacle = null; // Boolean obstacle map [x][y]
  
  // Building obstacles from map
  let buildingPolygons = [];
  
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
    
    // Extend computational domain to the left (upstream)
    X_OFFSET = Math.floor(NX_VISIBLE * UPSTREAM_FACTOR);
    NX = NX_VISIBLE + X_OFFSET;
    NY = NY_VISIBLE;
    
    cellSize = s.w / NX_VISIBLE;
    
    console.log(`CFD Grid: ${NX}x${NY} (visible: ${NX_VISIBLE}x${NY_VISIBLE}, upstream offset: ${X_OFFSET})`);
    
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
    
    for (let i = 0; i < NX; i++) {
      f[i] = new Array(NY);
      fTemp[i] = new Array(NY);
      rho[i] = new Array(NY);
      ux[i] = new Array(NY);
      uy[i] = new Array(NY);
      obstacle[i] = new Array(NY);
      
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
      }
    }
    
    // Load building obstacles from map
    loadBuildingObstacles();
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
      
      // Convert to grid coordinates (account for upstream offset)
      const gridMinX = Math.max(X_OFFSET, Math.floor(minX / cellSize) + X_OFFSET);
      const gridMaxX = Math.min(NX - 1, Math.ceil(maxX / cellSize) + X_OFFSET);
      const gridMinY = Math.max(0, Math.floor(minY / cellSize));
      const gridMaxY = Math.min(NY - 1, Math.ceil(maxY / cellSize));
      
      // Fill building area with obstacles
      for (let i = gridMinX; i <= gridMaxX; i++) {
        for (let j = gridMinY; j <= gridMaxY; j++) {
          // Check if grid cell center is inside the polygon
          // Subtract offset to get canvas coordinates
          const cellCenterX = (i - X_OFFSET + 0.5) * cellSize;
          const cellCenterY = (j + 0.5) * cellSize;
          
          if (pointInScreenPolygon({x: cellCenterX, y: cellCenterY}, screenPoints)) {
            obstacle[i][j] = true;
          }
        }
      }
    });
    
    console.log('CFD: Buildings rasterized to screen-space grid');
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
          
          // Periodic boundaries in y direction, constant inflow/outflow in x
          let destI = nextI;
          let destJ = nextJ;
          
          if (nextJ < 0) destJ = NY - 1;
          else if (nextJ >= NY) destJ = 0;
          
          if (nextI >= 0 && nextI < NX && destJ >= 0 && destJ < NY) {
            fTemp[destI][destJ][k] = f[i][j][k];
          }
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
        // Handle obstacles with bounce-back
        if (obstacle[i][j]) {
          for (let k = 0; k < Q; k++) {
            fTemp[i][j][k] = f[i][j][opp[k]];
          }
          continue;
        }
        
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
        
        // Clamp velocities for stability
        const speed = Math.sqrt(u * u + v * v);
        if (speed > MAX_VELOCITY) {
          u = (u / speed) * MAX_VELOCITY;
          v = (v / speed) * MAX_VELOCITY;
        }
        
        // Inlet boundary condition (left side of screen)
        // Wind flows left-to-right in screen space (i=0 to i=NX)
        if (i === 0) {
          u = WIND_SPEED; // Horizontal flow in screen space
          v = 0.0; // No vertical component
          density = 1.0; // Keep density constant at inlet
        }
        
        // Outflow boundary condition (right side of screen)
        // Copy values from previous column for smooth outflow
        if (i === NX - 1) {
          u = ux[i-1][j];
          v = uy[i-1][j];
          density = rho[i-1][j];
        }
        
        // Clamp density for stability
        density = Math.max(0.5, Math.min(2.0, density));
        
        // Store macroscopic values
        rho[i][j] = density;
        ux[i][j] = u;
        uy[i][j] = v;
        
        // Collision step (BGK approximation)
        for (let k = 0; k < Q; k++) {
          const feq = equilibrium(k, density, u, v);
          fTemp[i][j][k] = f[i][j][k] - OMEGA * (f[i][j][k] - feq);
          // Clamp distribution functions for stability
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
    
    // Visualize velocity magnitude with color and streamlines
    // Only render the visible region (skip upstream development zone)
    for (let i = X_OFFSET; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        // Skip obstacles - we want to see the buildings underneath
        if (obstacle[i][j]) continue;
        
        const speed = Math.sqrt(ux[i][j] * ux[i][j] + uy[i][j] * uy[i][j]);
        
        // Color based on velocity magnitude with transparency
        // Normalize against FIXED maximum (MAX_VELOCITY) so colors change with wind speed
        const normalized = Math.min(speed / MAX_VELOCITY, 1.0);
        const hue = 240 - normalized * 240; // Blue (240) to Red (0)
        const saturation = 70 + normalized * 20;
        const lightness = 40 + normalized * 30;
        // Lower alpha for better transparency
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`;
        
        // Map to canvas coordinates
        const x = (i - X_OFFSET) * cellSize;
        const y = j * cellSize;
        ctx.fillRect(x, y, cellSize + 1, cellSize + 1);
      }
    }
    
    // Draw velocity vectors (streamlines) at regular intervals
    const vectorSpacing = Math.max(6, Math.floor(NX_VISIBLE / 25));
    const vectorScale = cellSize * 3;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    
    for (let i = X_OFFSET + vectorSpacing; i < NX; i += vectorSpacing) {
      for (let j = vectorSpacing; j < NY; j += vectorSpacing) {
        if (obstacle[i][j]) continue;
        
        const speed = Math.sqrt(ux[i][j] * ux[i][j] + uy[i][j] * uy[i][j]);
        if (speed < 0.001) continue;
        
        // Map to canvas coordinates
        const x = (i - X_OFFSET) * cellSize + cellSize / 2;
        const y = j * cellSize + cellSize / 2;
        // Scale vectors by actual speed relative to FIXED maximum, not current WIND_SPEED
        const speedRatio = Math.min(speed / (MAX_VELOCITY * 0.5), 1.5);
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
    
    // Add legend
    drawLegend();
  }
  
  // Particle system for flow visualization
  let particles = [];
  let NUM_PARTICLES = 800; // Increased from 200 for more visible flow
  let PARTICLE_SPEED_MULTIPLIER = 5; // Control particle movement speed
  
  function initParticles() {
    particles = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      particles.push({
        // Start particles in the visible region only
        x: X_OFFSET + Math.random() * NX_VISIBLE,
        y: Math.random() * NY,
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
        if (i >= X_OFFSET && i < NX) {
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
          // Map to canvas coordinates
          const canvasX = (p.x - X_OFFSET) * cellSize;
          const canvasY = p.y * cellSize;
          ctx.arc(canvasX, canvasY, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.shadowBlur = 0;
        }
      }
      
      // Reset particle if it goes out of bounds or ages out
      if (p.x < X_OFFSET || p.x >= NX || p.y < 0 || p.y >= NY || p.age > 150) {
        // Start at visible left edge with some vertical spread
        p.x = X_OFFSET + Math.random() * 5;
        p.y = Math.random() * NY;
        p.age = 0;
      }
    });
  }
  
  function latticeToRealSpeed(latticeSpeed) {
    // Convert lattice units to m/s based on domain scaling
    const metersPerCell = DOMAIN_WIDTH_METERS / NX_VISIBLE;
    return latticeSpeed * metersPerCell * 60; // Approximate scaling factor
  }
  
  function drawLegend() {
    const padding = 10;
    const legendWidth = 220;
    const legendHeight = 370; // Increased for resolution control
    const x = cfdCanvas.width - legendWidth - padding;
    const y = padding;
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(x, y, legendWidth, legendHeight);
    
    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, legendWidth, legendHeight);
    
    let currentY = y + 20;
    
    // Title
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Wind Flow CFD', x + 10, currentY);
    currentY += 25;
    
    // Separator
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(x + 10, currentY);
    ctx.lineTo(x + legendWidth - 10, currentY);
    ctx.stroke();
    currentY += 15;
    
    // Wind Speed Control
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Wind Speed', x + 10, currentY);
    currentY += 3;
    
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${REAL_WIND_SPEED_MPS.toFixed(1)} m/s`, x + legendWidth - 60, currentY);
    currentY += 10;
    
    // Wind speed slider bar
    drawSlider(x + 10, currentY, legendWidth - 20, REAL_WIND_SPEED_MPS, 1, 20);
    currentY += 10;
    
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.fillText('↑↓ to adjust', x + 10, currentY);
    currentY += 20;
    
    // Wind Direction Control
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Wind Direction', x + 10, currentY);
    currentY += 3;
    
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${WIND_ANGLE.toFixed(0)}°`, x + legendWidth - 60, currentY);
    currentY += 10;
    
    // Direction slider bar
    drawSlider(x + 10, currentY, legendWidth - 20, WIND_ANGLE, 0, 360);
    currentY += 10;
    
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.fillText('←→ to adjust', x + 10, currentY);
    currentY += 20;
    
    // Particles Control
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Particle Count', x + 10, currentY);
    currentY += 3;
    
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${NUM_PARTICLES}`, x + legendWidth - 60, currentY);
    currentY += 10;
    
    // Particle count indicator
    const particleRatio = (NUM_PARTICLES - 300) / (1500 - 300);
    drawSlider(x + 10, currentY, legendWidth - 20, particleRatio * 100, 0, 100);
    currentY += 10;
    
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.fillText('P to cycle', x + 10, currentY);
    currentY += 20;
    
    // Particle Speed Control
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Particle Speed', x + 10, currentY);
    currentY += 3;
    
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${PARTICLE_SPEED_MULTIPLIER}x`, x + legendWidth - 60, currentY);
    currentY += 10;
    
    const speedRatio = (PARTICLE_SPEED_MULTIPLIER - 2) / (10 - 2);
    drawSlider(x + 10, currentY, legendWidth - 20, speedRatio * 100, 0, 100);
    currentY += 10;
    
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.fillText('R to cycle', x + 10, currentY);
    currentY += 20;
    
    // Resolution Control
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Grid Resolution', x + 10, currentY);
    currentY += 3;
    
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${GRID_RESOLUTION}`, x + legendWidth - 60, currentY);
    currentY += 10;
    
    const resRatio = (GRID_RESOLUTION - 100) / (300 - 100);
    drawSlider(x + 10, currentY, legendWidth - 20, resRatio * 100, 0, 100);
    currentY += 10;
    
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.fillText('G to cycle', x + 10, currentY);
    currentY += 25;
    
    // Separator
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(x + 10, currentY);
    ctx.lineTo(x + legendWidth - 10, currentY);
    ctx.stroke();
    currentY += 15;
    
    // Velocity color scale
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    ctx.fillText('Velocity Scale', x + 10, currentY);
    currentY += 10;
    
    const gradHeight = 15;
    const gradY = currentY;
    for (let i = 0; i < legendWidth - 20; i++) {
      const normalized = i / (legendWidth - 20);
      const hue = 240 - normalized * 240;
      const saturation = 80 + normalized * 20;
      const lightness = 30 + normalized * 40;
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.fillRect(x + 10 + i, gradY, 1, gradHeight);
    }
    currentY += gradHeight + 10;
    
    // Velocity scale labels (fixed max speed regardless of current wind speed)
    ctx.fillStyle = '#fff';
    ctx.font = '9px sans-serif';
    ctx.fillText('0', x + 10, currentY);
    ctx.fillText('20 m/s', x + legendWidth - 55, currentY); // Fixed maximum
    currentY += 15;
    
    // Domain info
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.fillText(`Resolution: ${GRID_RESOLUTION} cells`, x + 10, currentY);
    currentY += 12;
    ctx.fillText(`Domain: ~${DOMAIN_WIDTH_METERS}m`, x + 10, currentY);
  }
  
  function drawSlider(x, y, width, value, min, max) {
    const barHeight = 4;
    const normalizedValue = (value - min) / (max - min);
    const fillWidth = width * normalizedValue;
    
    // Background bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(x, y, width, barHeight);
    
    // Filled portion
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, '#0088ff');
    gradient.addColorStop(1, '#00ff88');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, fillWidth, barHeight);
    
    // Thumb
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0, 255, 136, 0.8)';
    ctx.beginPath();
    ctx.arc(x + fillWidth, y + barHeight / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  
  let simulationSteps = 0;
  
  function animate() {
    if (!isSimulating) return;
    
    const time = performance.now();
    
    // Run only 1 simulation step per frame for smooth, slow animation
    simulationStep();
    simulationSteps++;
    
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
  
  // Keyboard controls for dynamic adjustment
  window.addEventListener('keydown', (e) => {
    if (!isSimulating) return;
    
    let changed = false;
    
    switch(e.key) {
      case 'ArrowUp':
        REAL_WIND_SPEED_MPS = Math.min(20, REAL_WIND_SPEED_MPS + 0.5);
        WIND_SPEED = Math.min(0.1, WIND_SPEED + 0.005);
        changed = true;
        if (typeof showToast === 'function') {
          showToast(`Wind speed: ${REAL_WIND_SPEED_MPS.toFixed(1)} m/s`, 1000);
        }
        break;
        
      case 'ArrowDown':
        REAL_WIND_SPEED_MPS = Math.max(1, REAL_WIND_SPEED_MPS - 0.5);
        WIND_SPEED = Math.max(0.01, WIND_SPEED - 0.005);
        changed = true;
        if (typeof showToast === 'function') {
          showToast(`Wind speed: ${REAL_WIND_SPEED_MPS.toFixed(1)} m/s`, 1000);
        }
        break;
        
      case 'ArrowLeft':
        WIND_ANGLE = (WIND_ANGLE - 15 + 360) % 360;
        changed = true;
        if (typeof showToast === 'function') {
          showToast(`Wind direction: ${WIND_ANGLE.toFixed(0)}°`, 1000);
        }
        break;
        
      case 'ArrowRight':
        WIND_ANGLE = (WIND_ANGLE + 15) % 360;
        changed = true;
        if (typeof showToast === 'function') {
          showToast(`Wind direction: ${WIND_ANGLE.toFixed(0)}°`, 1000);
        }
        break;
        
      case 'p':
      case 'P':
        NUM_PARTICLES = NUM_PARTICLES === 800 ? 1500 : NUM_PARTICLES === 1500 ? 300 : 800;
        initParticles();
        if (typeof showToast === 'function') {
          showToast(`Particles: ${NUM_PARTICLES}`, 1000);
        }
        break;
        
      case 'r':
      case 'R':
        PARTICLE_SPEED_MULTIPLIER = PARTICLE_SPEED_MULTIPLIER === 5 ? 10 : PARTICLE_SPEED_MULTIPLIER === 10 ? 2 : 5;
        if (typeof showToast === 'function') {
          showToast(`Particle speed: ${PARTICLE_SPEED_MULTIPLIER}x`, 1000);
        }
        break;
        
      case 'o':
      case 'O':
        OMEGA = OMEGA === 1.0 ? 1.3 : OMEGA === 1.3 ? 0.7 : 1.0;
        if (typeof showToast === 'function') {
          showToast(`Relaxation: ${OMEGA.toFixed(1)}`, 1000);
        }
        break;
        
      case 'g':
      case 'G':
        // Cycle through: 100 → 150 → 200 → 250 → 300 → 100
        if (GRID_RESOLUTION === 100) GRID_RESOLUTION = 150;
        else if (GRID_RESOLUTION === 150) GRID_RESOLUTION = 200;
        else if (GRID_RESOLUTION === 200) GRID_RESOLUTION = 250;
        else if (GRID_RESOLUTION === 250) GRID_RESOLUTION = 300;
        else GRID_RESOLUTION = 100;
        
        resizeCanvas(); // Reinitialize with new resolution
        initParticles();
        if (typeof showToast === 'function') {
          showToast(`Grid resolution: ${GRID_RESOLUTION} cells`, 2000);
        }
        break;
    }
    
    if (changed) {
      e.preventDefault();
    }
  });
  
  console.log('CFD Simulation module loaded');
  console.log('Controls: Arrow keys (wind), P (particles), R (speed), O (relaxation), G (resolution)');
  
})();
