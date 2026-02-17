/**
 * Animation Registry
 * Central management system for all animations
 */

import type { IAnimation } from './types/index.js';

/**
 * Animation registry singleton
 */
class AnimationRegistry {
  private static instance: AnimationRegistry;
  private animations: Map<string, IAnimation>;
  private activeAnimation: IAnimation | null = null;

  private constructor() {
    this.animations = new Map();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AnimationRegistry {
    if (!AnimationRegistry.instance) {
      AnimationRegistry.instance = new AnimationRegistry();
    }
    return AnimationRegistry.instance;
  }

  /**
   * Register an animation
   */
  public register(animation: IAnimation): void {
    if (this.animations.has(animation.id)) {
      console.warn(`Animation ${animation.id} is already registered`);
      return;
    }
    this.animations.set(animation.id, animation);
    console.log(`✓ Registered animation: ${animation.name} (${animation.id})`);
  }

  /**
   * Unregister an animation
   */
  public unregister(animationId: string): void {
    const animation = this.animations.get(animationId);
    if (animation) {
      animation.dispose();
      this.animations.delete(animationId);
      console.log(`✓ Unregistered animation: ${animation.name}`);
    }
  }

  /**
   * Get an animation by ID
   */
  public get(animationId: string): IAnimation | undefined {
    return this.animations.get(animationId);
  }

  /**
   * Get all registered animations
   */
  public getAll(): IAnimation[] {
    return Array.from(this.animations.values());
  }

  /**
   * Get currently active animation
   */
  public getActive(): IAnimation | null {
    return this.activeAnimation;
  }

  /**
   * Start an animation (stops any currently active animation first)
   */
  public async start(animationId: string): Promise<void> {
    const animation = this.animations.get(animationId);
    if (!animation) {
      console.warn(`Animation ${animationId} not found`);
      return;
    }

    // Stop current animation if different
    if (this.activeAnimation && this.activeAnimation.id !== animation.id) {
      await this.activeAnimation.stop();
    }

    await animation.start();
    this.activeAnimation = animation;
  }

  /**
   * Stop an animation
   */
  public async stop(animationId: string): Promise<void> {
    const animation = this.animations.get(animationId);
    if (!animation) {
      console.warn(`Animation ${animationId} not found`);
      return;
    }

    await animation.stop();
    if (this.activeAnimation?.id === animation.id) {
      this.activeAnimation = null;
    }
  }

  /**
   * Toggle an animation
   */
  public async toggle(animationId: string): Promise<void> {
    const animation = this.animations.get(animationId);
    if (!animation) {
      console.warn(`Animation ${animationId} not found`);
      return;
    }

    await animation.toggle();
    if (animation.isActive) {
      this.activeAnimation = animation;
    } else if (this.activeAnimation?.id === animation.id) {
      this.activeAnimation = null;
    }
  }

  /**
   * Stop all animations
   */
  public async stopAll(): Promise<void> {
    for (const animation of this.animations.values()) {
      if (animation.isActive) {
        await animation.stop();
      }
    }
    this.activeAnimation = null;
  }

  /**
   * Dispose all animations
   */
  public disposeAll(): void {
    for (const animation of this.animations.values()) {
      animation.dispose();
    }
    this.animations.clear();
    this.activeAnimation = null;
  }
}

// Export singleton instance
export const animationRegistry = AnimationRegistry.getInstance();
