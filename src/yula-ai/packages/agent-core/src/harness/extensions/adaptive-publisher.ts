export interface AdaptivePublisherOptions<T> {
  publish: (value: T) => void;
  minIntervalMs?: number;
}

/**
 * Pi Adaptive Publisher (60 FPS Akış Dengeleyici)
 * Reference: earendil-works/pi/packages/agent/src/harness/utils/adaptive-publisher.ts
 */
export class AdaptivePublisher<T> {
  private publishFn: (value: T) => void;
  private minIntervalMs: number;
  private pendingValue: T | undefined;
  private timer: any = null;
  private lastEmitTime = 0;

  constructor(options: AdaptivePublisherOptions<T>) {
    this.publishFn = options.publish;
    this.minIntervalMs = options.minIntervalMs ?? 16; // ~60 FPS (16ms)
  }

  publish(value: T, forceImmediate = false): void {
    this.emit(value, forceImmediate);
  }

  emit(value: T, forceImmediate = false): void {
    this.pendingValue = value;
    const now = Date.now();
    const elapsed = now - this.lastEmitTime;

    if (forceImmediate || elapsed >= this.minIntervalMs) {
      this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.minIntervalMs - elapsed);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingValue !== undefined) {
      this.lastEmitTime = Date.now();
      const val = this.pendingValue;
      this.pendingValue = undefined;
      this.publishFn(val);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingValue = undefined;
  }
}

import { piEventStream } from '../telemetry/pi-event-stream';

export const adaptivePublisher = new AdaptivePublisher<any>({
  publish: (event) => piEventStream.emit(event),
});
