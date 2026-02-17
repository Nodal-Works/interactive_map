/**
 * Abstract base class for all animations
 * Provides common lifecycle management and messaging
 */

import type { IAnimation, AnimationConfig, Message } from '../types/index.js';
import { MessageType } from '../types/index.js';
import { channelMessenger } from '../utils/ChannelMessenger.js';

/**
 * Base animation class
 */
export abstract class BaseAnimation implements IAnimation {
  public readonly id: string;
  public readonly name: string;
  public isActive: boolean = false;
  
  protected buttonId?: string;
  protected button?: HTMLElement | null;
  protected unsubscribe?: () => void;

  constructor(config: AnimationConfig) {
    this.id = config.id;
    this.name = config.name;
    this.buttonId = config.buttonId;
    
    if (this.buttonId) {
      this.setupButton();
    }
  }

  /**
   * Set up button event listener
   */
  protected setupButton(): void {
    if (!this.buttonId) return;
    
    this.button = document.getElementById(this.buttonId);
    if (this.button) {
      this.button.addEventListener('click', () => {
        this.toggle();
      });
    }
  }

  /**
   * Update button visual state
   */
  protected updateButtonState(active: boolean): void {
    if (this.button) {
      if (active) {
        this.button.classList.add('active');
      } else {
        this.button.classList.remove('active');
      }
    }
  }

  /**
   * Send animation state message to controller
   */
  protected notifyStateChange(isActive: boolean): void {
    channelMessenger.send({
      type: MessageType.ANIMATION_STATE,
      animationId: this.buttonId || this.id,
      isActive,
    });
  }

  /**
   * Send custom message
   */
  protected sendMessage(message: Message): void {
    channelMessenger.send(message);
  }

  /**
   * Subscribe to messages from controller
   */
  protected subscribeToMessages(messageType: string, handler: (message: Message) => void): void {
    this.unsubscribe = channelMessenger.on(messageType, handler);
  }

  /**
   * Start the animation (to be implemented by subclasses)
   */
  public abstract start(): Promise<void> | void;

  /**
   * Stop the animation (to be implemented by subclasses)
   */
  public abstract stop(): Promise<void> | void;

  /**
   * Toggle animation on/off
   */
  public async toggle(): Promise<void> {
    if (this.isActive) {
      await this.stop();
    } else {
      await this.start();
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    if (this.button) {
      // Remove event listeners by replacing the element
      const newButton = this.button.cloneNode(true);
      this.button.parentNode?.replaceChild(newButton, this.button);
      this.button = null;
    }
  }
}
