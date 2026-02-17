/**
 * Grid Animation System
 * Sci-fi holographic grid overlay showing physical table tile boundaries
 */

import { CanvasAnimation, type CanvasAnimationConfig } from '../core/CanvasAnimation.js';

/**
 * Table physical dimensions (in cm)
 */
interface TableConfig {
  widthCm: number;
  heightCm: number;
  tileSizeCm: number;
}

/**
 * Grid animation configuration
 */
interface GridAnimationConfig extends CanvasAnimationConfig {
  table?: TableConfig;
  autoStopDelay?: number;
}

/**
 * Grid animation class
 */
export class GridAnimation extends CanvasAnimation {
  private readonly tableConfig: TableConfig;
  private readonly cols: number;
  private readonly rows: number;
  private readonly autoStopDelay: number;
  private autoStopTimer: number | null = null;

  constructor(config: GridAnimationConfig) {
    super(config);

    // Default table dimensions
    this.tableConfig = config.table ?? {
      widthCm: 100,
      heightCm: 60,
      tileSizeCm: 20,
    };

    this.cols = Math.floor(this.tableConfig.widthCm / this.tableConfig.tileSizeCm);
    this.rows = Math.floor(this.tableConfig.heightCm / this.tableConfig.tileSizeCm);
    this.autoStopDelay = config.autoStopDelay ?? 10000; // Default 10 seconds
  }

  /**
   * Start the grid animation
   */
  public start(): void {
    super.start();
    this.canvas.classList.add('active');

    // Auto-stop after configured delay
    this.autoStopTimer = window.setTimeout(() => {
      if (this.isActive) {
        this.stop();
      }
    }, this.autoStopDelay);
  }

  /**
   * Stop the grid animation
   */
  public stop(): void {
    this.canvas.classList.remove('active');

    // Clear auto-stop timer
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    super.stop();
  }

  /**
   * Animation loop - draws the glowing grid
   */
  protected animate(): void {
    const time = performance.now();
    this.drawGlowingGrid(time);
  }

  /**
   * Draw glowing sci-fi grid with pulsing effects
   */
  private drawGlowingGrid(time: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.clearRect(0, 0, width, height);

    // Calculate tile size in pixels
    const tileWidth = width / this.cols;
    const tileHeight = height / this.rows;

    // Sci-fi glow effect parameters
    const baseAlpha = 0.3 + Math.sin(time * 0.002) * 0.15;
    const pulseSpeed = 0.003;
    const waveSpeed = 0.001;

    // Draw vertical lines
    for (let i = 0; i <= this.cols; i++) {
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
    for (let i = 0; i <= this.rows; i++) {
      const y = i * tileHeight;
      const phase = i * 0.5 + this.cols * 0.5; // Offset from vertical lines
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
    for (let row = 0; row <= this.rows; row++) {
      for (let col = 0; col <= this.cols; col++) {
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

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    super.dispose();
  }
}
