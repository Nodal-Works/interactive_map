// ===== Grid Animation System =====
// Sci-fi holographic grid overlay showing physical table tile boundaries

const gridCanvas = document.getElementById('grid-animation-canvas');
const gridCtx = gridCanvas.getContext('2d');
const gridBtn = document.getElementById('grid-animation-btn');
const gridChannel = new BroadcastChannel('map_controller_channel');

// Table physical dimensions
let TABLE_WIDTH_CM = window.MR_CALIBRATION.dimensions.tableWidth;
let TABLE_HEIGHT_CM = window.MR_CALIBRATION.dimensions.tableHeight;
const TILE_SIZE_CM = window.APP_CONFIG.table.tileSize;
let COLS = Math.floor(TABLE_WIDTH_CM / TILE_SIZE_CM); // 5
let ROWS = Math.floor(TABLE_HEIGHT_CM / TILE_SIZE_CM); // 3

let animationFrame = null;
let isAnimating = false;

function gridCorners() {
  const rect = map.getContainer().getBoundingClientRect();
  const points = window.APP_CONFIG.area.corners.map(coordinate => {
    const p = map.project(coordinate);
    return { x: p.x + rect.left, y: p.y + rect.top };
  });
  // The table marker polygon is ordered around the footprint. Start at its
  // visible top-left so the grid labels read across the screen.
  const topLeft = points.reduce((best, p, i) => p.x + p.y < points[best].x + points[best].y ? i : best, 0);
  const next = (topLeft + 1) % 4, previous = (topLeft + 3) % 4;
  const topRight = points[next].x > points[previous].x ? next : previous;
  return [points[topLeft], points[topRight], points[(topLeft + 2) % 4], points[topRight === next ? previous : next]];
}

function gridPoint(corners, u, v) {
  const [tl, tr, br, bl] = corners;
  return {
    x: (1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x,
    y: (1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y
  };
}

function resizeGridCanvas() {
  TABLE_WIDTH_CM = window.MR_CALIBRATION.dimensions.tableWidth;
  TABLE_HEIGHT_CM = window.MR_CALIBRATION.dimensions.tableHeight;
  COLS = Math.floor(TABLE_WIDTH_CM / TILE_SIZE_CM);
  ROWS = Math.floor(TABLE_HEIGHT_CM / TILE_SIZE_CM);
  gridCanvas.width = innerWidth;
  gridCanvas.height = innerHeight;
  gridCanvas.style.width = innerWidth + 'px';
  gridCanvas.style.height = innerHeight + 'px';
}

function drawGlowingGrid(time) {
  const width = gridCanvas.width;
  const height = gridCanvas.height;
  const corners = gridCorners();
  const points = Array.from({length: ROWS + 1}, (_, row) =>
    Array.from({length: COLS + 1}, (_, col) => gridPoint(corners, col / COLS, row / ROWS)));
  const trace = (axis, index) => {
    gridCtx.beginPath();
    for (let i = 0; i <= (axis === 'column' ? ROWS : COLS); i++) {
      const p = axis === 'column' ? points[i][index] : points[index][i];
      if (i === 0) gridCtx.moveTo(p.x, p.y);
      else gridCtx.lineTo(p.x, p.y);
    }
  };
  
  gridCtx.clearRect(0, 0, width, height);
  
  // Sci-fi glow effect parameters
  const baseAlpha = 0.3 + Math.sin(time * 0.002) * 0.15;
  const pulseSpeed = 0.003;
  const waveSpeed = 0.001;
  
  // Draw vertical lines
  for (let i = 0; i <= COLS; i++) {
    const phase = i * 0.5;
    const pulse = Math.sin(time * pulseSpeed + phase) * 0.5 + 0.5;
    const wave = Math.sin(time * waveSpeed + phase * 2) * 0.3 + 0.7;
    
    // Multi-layer glow
    for (let layer = 0; layer < 3; layer++) {
      gridCtx.strokeStyle = `rgba(0, 255, 255, ${baseAlpha * pulse * wave * (0.4 - layer * 0.1)})`;
      gridCtx.lineWidth = 3 + layer * 2;
      gridCtx.shadowBlur = 15 + layer * 10;
      gridCtx.shadowColor = `rgba(0, 255, 255, ${pulse * 0.8})`;
      
      trace('column', i);
      gridCtx.stroke();
    }
  }
  
  // Draw horizontal lines
  for (let i = 0; i <= ROWS; i++) {
    const phase = i * 0.5 + COLS * 0.5; // Offset from vertical lines
    const pulse = Math.sin(time * pulseSpeed + phase) * 0.5 + 0.5;
    const wave = Math.sin(time * waveSpeed + phase * 2) * 0.3 + 0.7;
    
    // Multi-layer glow
    for (let layer = 0; layer < 3; layer++) {
      gridCtx.strokeStyle = `rgba(0, 255, 255, ${baseAlpha * pulse * wave * (0.4 - layer * 0.1)})`;
      gridCtx.lineWidth = 3 + layer * 2;
      gridCtx.shadowBlur = 15 + layer * 10;
      gridCtx.shadowColor = `rgba(0, 255, 255, ${pulse * 0.8})`;
      
      trace('row', i);
      gridCtx.stroke();
    }
  }
  
  // Draw corner nodes with pulsing effect
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      const {x, y} = points[row][col];
      const phase = (row + col) * 0.3;
      const pulse = Math.sin(time * pulseSpeed * 1.5 + phase) * 0.5 + 0.5;
      
      gridCtx.shadowBlur = 20;
      gridCtx.shadowColor = `rgba(0, 255, 255, ${pulse})`;
      gridCtx.fillStyle = `rgba(0, 255, 255, ${0.6 + pulse * 0.4})`;
      
      gridCtx.beginPath();
      gridCtx.arc(x, y, 4 + pulse * 2, 0, Math.PI * 2);
      gridCtx.fill();
      
      // Outer ring
      gridCtx.strokeStyle = `rgba(0, 255, 255, ${0.3 + pulse * 0.3})`;
      gridCtx.lineWidth = 2;
      gridCtx.beginPath();
      gridCtx.arc(x, y, 6 + pulse * 3, 0, Math.PI * 2);
      gridCtx.stroke();
    }
  }
  
  // Reset shadow for next frame
  gridCtx.shadowBlur = 0;
}

function animateGrid() {
  if (!isAnimating) return;
  
  const time = performance.now();
  drawGlowingGrid(time);
  
  animationFrame = requestAnimationFrame(animateGrid);
}

function startGridAnimation() {
  if (isAnimating) {
    stopGridAnimation();
    return;
  }
  
  isAnimating = true;
  gridCanvas.classList.add('active');
  gridChannel.postMessage({ type: 'animation_state', animationId: 'grid-animation-btn', isActive: true });
  resizeGridCanvas();
  animateGrid();
  
  // Auto-stop after 10 seconds
  setTimeout(() => {
    if (isAnimating) stopGridAnimation();
  }, 10000);
}

function stopGridAnimation() {
  isAnimating = false;
  gridCanvas.classList.remove('active');
  gridChannel.postMessage({ type: 'animation_state', animationId: 'grid-animation-btn', isActive: false });
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
}

// Wire up grid animation button
gridBtn.addEventListener('click', startGridAnimation);

// Resize canvas on window resize
window.addEventListener('resize', () => {
  if (isAnimating) resizeGridCanvas();
});
