import { EventBusMessage } from '@types';

type EventCallback = (message: EventBusMessage) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    // Initialize BroadcastChannel for cross-window communication
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('map_controller_channel');
      this.broadcastChannel.onmessage = (event) => {
        this.emit(event.data.type, event.data);
      };
    }
  }

  on(eventType: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  emit(eventType: string, payload?: any): void {
    const message: EventBusMessage = { type: eventType, payload };
    
    // Emit to local listeners
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(message);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }

    // Also broadcast to other windows if BroadcastChannel is available
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    }
  }

  off(eventType: string, callback?: EventCallback): void {
    if (!callback) {
      this.listeners.delete(eventType);
    } else {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    }
  }

  cleanup(): void {
    this.listeners.clear();
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }
}

export const eventBus = new EventBus();
