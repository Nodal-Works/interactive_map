/**
 * Singleton wrapper for BroadcastChannel communication
 * Manages message passing between main display and controller
 */

import type { Message } from '../types/index.js';

/**
 * Callback function type for message handlers
 */
type MessageHandler = (message: Message) => void;

/**
 * BroadcastChannel messenger singleton
 */
class ChannelMessenger {
  private static instance: ChannelMessenger;
  private channel: BroadcastChannel;
  private handlers: Map<string, Set<MessageHandler>>;

  private constructor() {
    this.channel = new BroadcastChannel('map_controller_channel');
    this.handlers = new Map();
    
    // Set up message routing
    this.channel.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      const messageType = message.type;
      
      // Call registered handlers for this message type
      const typeHandlers = this.handlers.get(messageType);
      if (typeHandlers) {
        typeHandlers.forEach(handler => handler(message));
      }
      
      // Call wildcard handlers
      const wildcardHandlers = this.handlers.get('*');
      if (wildcardHandlers) {
        wildcardHandlers.forEach(handler => handler(message));
      }
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ChannelMessenger {
    if (!ChannelMessenger.instance) {
      ChannelMessenger.instance = new ChannelMessenger();
    }
    return ChannelMessenger.instance;
  }

  /**
   * Send a message to all listeners
   */
  public send(message: Message): void {
    this.channel.postMessage(message);
  }

  /**
   * Register a message handler for a specific message type
   * @param messageType Type of message to listen for (use '*' for all messages)
   * @param handler Callback function
   * @returns Unsubscribe function
   */
  public on(messageType: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, new Set());
    }
    
    const handlers = this.handlers.get(messageType)!;
    handlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(messageType);
      }
    };
  }

  /**
   * Remove a specific handler
   */
  public off(messageType: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(messageType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(messageType);
      }
    }
  }

  /**
   * Remove all handlers for a message type
   */
  public offAll(messageType: string): void {
    this.handlers.delete(messageType);
  }

  /**
   * Close the channel (cleanup)
   */
  public close(): void {
    this.channel.close();
    this.handlers.clear();
  }
}

// Export singleton instance
export const channelMessenger = ChannelMessenger.getInstance();
