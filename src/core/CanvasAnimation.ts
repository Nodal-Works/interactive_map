/**
 * Base class for animations that use a canvas overlay
 */

import { BaseAnimation } from './BaseAnimation.js';
import type { AnimationConfig, CanvasConfig, CanvasDimensions } from '../types/index.js';

/**
 * Configuration for canvas-based animations
 */
export interface CanvasAnimationConfig extends AnimationConfig, CanvasConfig {}

/**
 * Base class for canvas animations
 */
export abstract class CanvasAnimation extends BaseAnimation {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected animationFrame: number | null = null;
  protected canvasConfig: CanvasConfig;

  constructor(config: CanvasAnimationConfig) {
    super(config);
    this.canvasConfig = {
      canvasId: config.canvasId,
      zIndex: config.zIndex,
      pointerEvents: config.pointerEvents ?? false,
    };
    
    // Get or create canvas
    let canvas = document.getElementById(config.canvasId) as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = this.createCanvas(config);
    }
    this.canvas = canvas;
    
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`Failed to get 2D context for canvas ${config.canvasId}`);
    }
    this.ctx = ctx;
    
    // Set up resize handler
    this.setupResize();
  }

  /**
   * Create canvas element
   */
  protected createCanvas(config: CanvasAnimationConfig): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.id = config.canvasId;
    canvas.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: ${config.zIndex};
      pointer-events: ${config.pointerEvents ? 'auto' : 'none'};
      display: none;
    `;
    document.body.appendChild(canvas);
    return canvas;
  }

  /**
   * Set up window resize handler
   */
  protected setupResize(): void {
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
  }

  /**
   * Resize canvas to match overlay dimensions
   */
  protected resizeCanvas(): void {
    const dims = this.getCanvasDimensions();
    this.canvas.width = dims.width;
    this.canvas.height = dims.height;
    this.canvas.style.width = `${dims.width}px`;
    this.canvas.style.height = `${dims.height}px`;
  }

  /**
   * Get canvas dimensions based on physical table size
   */
  protected getCanvasDimensions(): CanvasDimensions {
    if (window.computeOverlayPixelSize) {
      const { w, h } = window.computeOverlayPixelSize();
      return { width: w, height: h };
    }
    // Fallback to window dimensions
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  /**
   * Show the canvas
   */
  protected showCanvas(): void {
    this.canvas.style.display = 'block';
  }

  /**
   * Hide the canvas
   */
  protected hideCanvas(): void {
    this.canvas.style.display = 'none';
  }

  /**
   * Clear the canvas
   */
  protected clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Animation loop (to be implemented by subclasses)
   */
  protected abstract animate(): void;

  /**
   * Start animation
   */
  public start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    this.updateButtonState(true);
    this.notifyStateChange(true);
    this.showCanvas();
    this.resizeCanvas();
    this.startAnimationLoop();
  }

  /**
   * Stop animation
   */
  public stop(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.updateButtonState(false);
    this.notifyStateChange(false);
    this.stopAnimationLoop();
    this.clearCanvas();
    this.hideCanvas();
  }

  /**
   * Start the animation loop
   */
  protected startAnimationLoop(): void {
    const loop = () => {
      if (!this.isActive) return;
      this.animate();
      this.animationFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * Stop the animation loop
   */
  protected stopAnimationLoop(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    super.dispose();
    this.stop();
    // Note: We don't remove the canvas as it might be shared
  }
}
