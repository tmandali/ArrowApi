import { QueueItem } from './types';
import { piEventStream } from './pi-event-stream';

/**
 * Pi-Style Steering and Follow-up Queue Manager
 * Reference: earendil-works/pi/packages/agent/README.md (Steering and Follow-up)
 */
export class SteeringQueueManager {
  private steeringQueue: QueueItem[] = [];
  private followUpQueue: QueueItem[] = [];
  private listeners: Set<() => void> = new Set();
  private cachedSteering?: QueueItem[];
  private cachedFollowUp?: QueueItem[];

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.cachedSteering = undefined;
    this.cachedFollowUp = undefined;
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[SteeringQueueManager] Listener error:', err);
      }
    });
  }

  /**
   * Yüksek öncelikli araya girme mesajı ekler (Agent araçları çalıştırırken yönünü değiştirir).
   */
  steer(content: string): QueueItem {
    const item: QueueItem = {
      id: `steer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      role: 'user',
      timestamp: Date.now(),
    };
    this.steeringQueue.push(item);
    this.notify();
    piEventStream.emit({
      type: 'steer_injected',
      message: content,
    });
    return item;
  }

  /**
   * Takip işi kuyruğuna mesaj ekler (Agent mevcut işini bitirdikten sonra sıradaki işe geçer).
   */
  followUp(content: string): QueueItem {
    const item: QueueItem = {
      id: `follow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      role: 'user',
      timestamp: Date.now(),
    };
    this.followUpQueue.push(item);
    this.notify();
    piEventStream.emit({
      type: 'follow_up_queued',
      message: content,
    });
    return item;
  }

  hasSteering(): boolean {
    return this.steeringQueue.length > 0;
  }

  hasFollowUp(): boolean {
    return this.followUpQueue.length > 0;
  }

  popSteer(): QueueItem | undefined {
    const item = this.steeringQueue.shift();
    if (item) this.notify();
    return item;
  }

  popFollowUp(): QueueItem | undefined {
    const item = this.followUpQueue.shift();
    if (item) this.notify();
    return item;
  }

  peekSteer(): QueueItem | undefined {
    return this.steeringQueue[0];
  }

  peekFollowUp(): QueueItem | undefined {
    return this.followUpQueue[0];
  }

  getSteeringQueue(): QueueItem[] {
    if (!this.cachedSteering) {
      this.cachedSteering = [...this.steeringQueue];
    }
    return this.cachedSteering;
  }

  getFollowUpQueue(): QueueItem[] {
    if (!this.cachedFollowUp) {
      this.cachedFollowUp = [...this.followUpQueue];
    }
    return this.cachedFollowUp;
  }

  clearSteering(): void {
    if (this.steeringQueue.length > 0) {
      this.steeringQueue = [];
      this.notify();
    }
  }

  clearFollowUp(): void {
    if (this.followUpQueue.length > 0) {
      this.followUpQueue = [];
      this.notify();
    }
  }

  clearAll(): void {
    const hadItems = this.steeringQueue.length > 0 || this.followUpQueue.length > 0;
    this.steeringQueue = [];
    this.followUpQueue = [];
    if (hadItems) this.notify();
  }

  clear(): void {
    this.clearAll();
  }
}

export const steeringManager = new SteeringQueueManager();
