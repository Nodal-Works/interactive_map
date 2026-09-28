// ===== Grid Animation System =====
// Sci-fi holographic grid overlay showing physical table tile boundaries

const gridCanvas = document.getElementById('grid-animation-canvas');
const gridCtx = gridCanvas.getContext('2d');
const gridBtn = document.getElementById('grid-animation-btn');
const gridChannel = new BroadcastChannel('map_controller_channel');

const gridDimensions = () => window.MR_TABLE.grid(window.MR_CALIBRATION.dimensions);
let COLS = gridDimensions().columns;
let ROWS = gridDimensions().rows;

let animationFrame = null;
let isAnimating = false, gridStopTimer = null;
window.MR_GRID_HOLD = false;

function resizeGridCanvas() {
  COLS = gridDimensions().columns;
  ROWS = gridDimensions().rows;
  gridCanvas.width = innerWidth;
  gridCanvas.height = innerHeight;
  gridCanvas.style.width = innerWidth + 'px';
  gridCanvas.style.height = innerHeight + 'px';
}

function drawGlowingGrid(time) {
  const scale = (window.mrTableScale?.() ?? 1);
  const width = gridCanvas.width;
  const height = gridCanvas.height;
  const rect = map.getContainer().getBoundingClientRect();
  const corners = window.MR_TABLE.gridCorners(window.APP_CONFIG.area.corners.map(geo => {
    const p = map.project(geo);
    return {x: p.x + rect.left, y: p.y + rect.top};
  }));
  const point = (u,v) => window.MR_TABLE.gridPoint(corners,u,v);
  const points = Array.from({length: ROWS + 1}, (_, row) =>
    Array.from({length: COLS + 1}, (_, col) => point(col / COLS, row / ROWS)));
  const centers = Array.from({length: ROWS}, (_, row) =>
    Array.from({length: COLS}, (_, col) => point((col + .5) / COLS, (row + .5) / ROWS)));
  const trace = (axis, index) => {
    gridCtx.beginPath();
    for (let i = 0; i <= (axis === 'column' ? ROWS : COLS); i++) {
      const p = axis === 'column' ? points[i][index] : points[index][i];
      if (i === 0) gridCtx.moveTo(p.x, p.y);
      else gridCtx.lineTo(p.x, p.y);
    }
  };
  
  gridCtx.clearRect(0, 0, width, height);
  
  if(window.MR_GRID_HOLD){
    gridCtx.shadowBlur=0;gridCtx.strokeStyle='#ffffff';gridCtx.lineWidth=1;
    for(let x=0;x<=COLS;x++){trace('column',x);gridCtx.stroke();}
    for(let y=0;y<=ROWS;y++){trace('row',y);gridCtx.stroke();}
    gridCtx.font='600 18px system-ui';gridCtx.textAlign='center';gridCtx.textBaseline='middle';
    for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){const {x,y}=centers[row][col];gridCtx.fillStyle='#07111ecc';gridCtx.fillRect(x-25,y-16,50,32);gridCtx.fillStyle='#fff';gridCtx.fillText(String.fromCharCode(65+row)+(col+1),x,y);}return;
  }
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
      gridCtx.lineWidth = (3 + layer * 2) * scale;
      gridCtx.shadowBlur = (15 + layer * 10) * scale;
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
      gridCtx.lineWidth = (3 + layer * 2) * scale;
      gridCtx.shadowBlur = (15 + layer * 10) * scale;
      gridCtx.shadowColor = `rgba(0, 255, 255, ${pulse * 0.8})`;
      
      trace('row', i);
      gridCtx.stroke();
    }
  }
  
  // Draw corner nodes with pulsing effect
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      const {x,y} = points[row][col];
      const phase = (row + col) * 0.3;
      const pulse = Math.sin(time * pulseSpeed * 1.5 + phase) * 0.5 + 0.5;
      
      gridCtx.shadowBlur = 20 * scale;
      gridCtx.shadowColor = `rgba(0, 255, 255, ${pulse})`;
      gridCtx.fillStyle = `rgba(0, 255, 255, ${0.6 + pulse * 0.4})`;
      
      gridCtx.beginPath();
      gridCtx.arc(x, y, (4 + pulse * 2) * scale, 0, Math.PI * 2);
      gridCtx.fill();
      
      // Outer ring
      gridCtx.strokeStyle = `rgba(0, 255, 255, ${0.3 + pulse * 0.3})`;
      gridCtx.lineWidth = 2 * scale;
      gridCtx.beginPath();
      gridCtx.arc(x, y, (6 + pulse * 3) * scale, 0, Math.PI * 2);
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
  if(window.MR_GRID_HOLD){animationFrame=null;return;}
  animationFrame = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'grid') : requestAnimationFrame)(animateGrid);
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
  clearTimeout(gridStopTimer);
  gridStopTimer=setTimeout(() => {
    if (isAnimating && !window.MR_GRID_HOLD) stopGridAnimation();
  }, 10000);
}

function stopGridAnimation() {
  clearTimeout(gridStopTimer);
  isAnimating = false;
  gridCanvas.classList.remove('active');
  gridChannel.postMessage({ type: 'animation_state', animationId: 'grid-animation-btn', isActive: false });
  if (animationFrame) {
    (window.MR_FRAMES ? window.MR_FRAMES.cancel.bind(window.MR_FRAMES) : cancelAnimationFrame)(animationFrame);
    animationFrame = null;
  }
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
}

// Wire up grid animation button
gridBtn.addEventListener('click', startGridAnimation);
window.MR_LAYERS?.register('grid-animation-btn',{getEnabled:()=>isAnimating,enable:()=>{if(!isAnimating)startGridAnimation();},disable:stopGridAnimation});

// Resize canvas on window resize
window.addEventListener('resize', () => {
  if (isAnimating) {resizeGridCanvas();if(window.MR_GRID_HOLD)drawGlowingGrid(performance.now());}
});

window.addEventListener('mr-grid-mode',()=>{if(isAnimating)animateGrid();});
map.on('move',()=>{if(isAnimating && window.MR_GRID_HOLD)drawGlowingGrid(performance.now());});
