import { QueueItem } from './types';
import { piEventStream } from './pi-event-stream';

/**
 * Pi-Style Steering and Follow-up Queue Manager
 * Reference: earendil-works/pi/packages/agent/README.md (Steering and Follow-up)
 */
export class SteeringQueueManager {
  private steeringQueue: QueueItem[] = [];
  private followUpQueue: QueueItem[] = [];

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
    return this.steeringQueue.shift();
  }

  popFollowUp(): QueueItem | undefined {
    return this.followUpQueue.shift();
  }

  peekSteer(): QueueItem | undefined {
    return this.steeringQueue[0];
  }

  peekFollowUp(): QueueItem | undefined {
    return this.followUpQueue[0];
  }

  getSteeringQueue(): QueueItem[] {
    return [...this.steeringQueue];
  }

  getFollowUpQueue(): QueueItem[] {
    return [...this.followUpQueue];
  }

  clearSteering(): void {
    this.steeringQueue = [];
  }

  clearFollowUp(): void {
    this.followUpQueue = [];
  }

  clearAll(): void {
    this.clearSteering();
    this.clearFollowUp();
  }

  clear(): void {
    this.clearAll();
  }
}

export const steeringManager = new SteeringQueueManager();
