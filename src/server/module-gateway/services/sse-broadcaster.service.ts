/**
 * SSE Broadcaster Service
 *
 * Manages SSE connections and broadcasts new logs to all connected clients
 * Uses a callback pattern to ensure writes happen in the correct context
 */

import type { RequestLog } from '@shared/types';

// Callback type: receives log data as string, returns true if successful
type LogCallback = (logData: string) => Promise<boolean>;

class SSEBroadcasterService {
  private callbacks: Set<LogCallback> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Start sending heartbeats to keep connections alive
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      if (this.callbacks.size === 0) return;

      // SSE comment message for heartbeat
      const heartbeatMessage = ': heartbeat\n\n';
      
      const promises = Array.from(this.callbacks).map(async (callback) => {
        try {
          return await callback(heartbeatMessage);
        } catch {
          return false;
        }
      });

      const results = await Promise.all(promises);
      
      // Clean up failed callbacks (though registerCallback handles disconnection via stream.onAbort)
      // This is a safety measure
    }, 15000); // Every 15 seconds
  }

  /**
   * Register a callback to be called when new logs arrive
   * Returns an unregister function
   */
  registerCallback(callback: LogCallback): () => void {
    this.callbacks.add(callback);

    // Return cleanup function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Broadcast a new log to all registered callbacks
   */
  async broadcastNewLog(log: RequestLog): Promise<void> {
    if (this.callbacks.size === 0) {
      return;
    }

    const message = `data: ${JSON.stringify(log)}\n\n`;

    // Call all callbacks
    const promises = Array.from(this.callbacks).map(async (callback, index) => {
      try {
        const success = await callback(message);
        return { callback, success };
      } catch (error) {
        console.error(`[SSEBroadcaster] Callback ${index + 1} threw error:`, error);
        return { callback, success: false, error };
      }
    });

    const results = await Promise.allSettled(promises);

    // Remove failed callbacks
    const failedCallbacks: LogCallback[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { success } = result.value;
        if (!success) {
          const callback = Array.from(this.callbacks)[index];
          if (callback) failedCallbacks.push(callback);
        }
      } else {
        const callback = Array.from(this.callbacks)[index];
        if (callback) failedCallbacks.push(callback);
      }
    });

    if (failedCallbacks.length > 0) {
      failedCallbacks.forEach(cb => this.callbacks.delete(cb));
    }
  }

  /**
   * Get current connection count
   */
  getConnectionCount(): number {
    return this.callbacks.size;
  }
}

// Export singleton instance
export const sseBroadcasterService = new SSEBroadcasterService();
