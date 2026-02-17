/**
 * Grid Animation System
 * Sci-fi holographic grid overlay showing physical table tile boundaries
 */

class GridAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.channel = new BroadcastChannel('map_controller_channel');
    
    // Table physical dimensions
    this.TABLE_WIDTH_CM = 100;
    this.TABLE_HEIGHT_CM = 60;
    this.TILE_SIZE_CM = 20;
    this.COLS = Math.floor(this.TABLE_WIDTH_CM / this.TILE_SIZE_CM); // 5
    this.ROWS = Math.floor(this.TABLE_HEIGHT_CM / this.TILE_SIZE_CM); // 3
    
    this.animationFrame = null;
    this.isAnimating = false;
    this.autoStopTimeout = null;
    
    // Bind methods
    this.animate = this.animate.bind(this);
    this.handleResize = this.handleResize.bind(this);
    
    // Set up resize handler
    window.addEventListener('resize', this.handleResize);
  }
  
  resizeCanvas() {
    // Use the same calculation as table overlay
    const s = window.computeOverlayPixelSize();
    this.canvas.width = s.w;
    this.canvas.height = s.h;
    this.canvas.style.width = s.w + 'px';
    this.canvas.style.height = s.h + 'px';
  }
  
  drawGlowingGrid(time) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    this.ctx.clearRect(0, 0, width, height);
    
    // Calculate tile size in pixels
    const tileWidth = width / this.COLS;
    const tileHeight = height / this.ROWS;
    
    // Sci-fi glow effect parameters
    const baseAlpha = 0.3 + Math.sin(time * 0.002) * 0.15;
    const pulseSpeed = 0.003;
    const waveSpeed = 0.001;
    
    // Draw vertical lines
    for (let i = 0; i <= this.COLS; i++) {
      const x = i * tileWidth;
      const phase = i * 0.5;
      const pulse = Math.sin(time * pulseSpeed + phase) * 0.5 + 0.5;
      const wave = Math.sin(time * waveSpeed + phase * 2) * 0.3 + 0.7;
      
      // Multi-layer glow
      for (let layer = 0; layer < 3; layer++) {
        this.ctx.strokeStyle = `rgba(0, 255, 255, ${baseAlpha * pulse * wave * (0.4 - layer * 0.1)})`;
        this.ctx.lineWidth = 3 + layer * 2;
        this.ctx.shadowBlur = 15 + layer * 10;
        this.ctx.shadowColor = `rgba(0, 255, 255, ${pulse * 0.8})`;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();
      }
    }
    
    // Draw horizontal lines
    for (let i = 0; i <= this.ROWS; i++) {
      const y = i * tileHeight;
      const phase = i * 0.5 + this.COLS * 0.5; // Offset from vertical lines
      const pulse = Math.sin(time * pulseSpeed + phase) * 0.5 + 0.5;
      const wave = Math.sin(time * waveSpeed + phase * 2) * 0.3 + 0.7;
      
      // Multi-layer glow
      for (let layer = 0; layer < 3; layer++) {
        this.ctx.strokeStyle = `rgba(0, 255, 255, ${baseAlpha * pulse * wave * (0.4 - layer * 0.1)})`;
        this.ctx.lineWidth = 3 + layer * 2;
        this.ctx.shadowBlur = 15 + layer * 10;
        this.ctx.shadowColor = `rgba(0, 255, 255, ${pulse * 0.8})`;
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();
      }
    }
    
    // Draw corner nodes with pulsing effect
    for (let row = 0; row <= this.ROWS; row++) {
      for (let col = 0; col <= this.COLS; col++) {
        const x = col * tileWidth;
        const y = row * tileHeight;
        const phase = (row + col) * 0.3;
        const pulse = Math.sin(time * pulseSpeed * 1.5 + phase) * 0.5 + 0.5;
        
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = `rgba(0, 255, 255, ${pulse})`;
        this.ctx.fillStyle = `rgba(0, 255, 255, ${0.6 + pulse * 0.4})`;
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4 + pulse * 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Outer ring
        this.ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + pulse * 0.3})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 6 + pulse * 3, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
    
    // Reset shadow for next frame
    this.ctx.shadowBlur = 0;
  }
  
  animate() {
    if (!this.isAnimating) return;
    
    const time = performance.now();
    this.drawGlowingGrid(time);
    
    this.animationFrame = requestAnimationFrame(this.animate);
  }
  
  start() {
    if (this.isAnimating) {
      this.stop();
      return;
    }
    
    this.isAnimating = true;
    this.canvas.classList.add('active');
    this.channel.postMessage({ type: 'animation_state', animationId: 'grid-animation-btn', isActive: true });
    this.resizeCanvas();
    this.animate();
    
    // Auto-stop after 10 seconds
    this.autoStopTimeout = setTimeout(() => {
      if (this.isAnimating) this.stop();
    }, 10000);
  }
  
  stop() {
    this.isAnimating = false;
    this.canvas.classList.remove('active');
    this.channel.postMessage({ type: 'animation_state', animationId: 'grid-animation-btn', isActive: false });
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    if (this.autoStopTimeout) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
    }
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  toggle() {
    if (this.isAnimating) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  handleResize() {
    if (this.isAnimating) {
      this.resizeCanvas();
    }
  }
}

// Export the class for module usage
export { GridAnimation };
