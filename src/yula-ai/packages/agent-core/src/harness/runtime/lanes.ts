import { piEventStream } from '../telemetry/pi-event-stream';

export type AgentLane = 'interactive' | 'background' | 'steering';

export interface LaneTask<T = any> {
  id: string;
  lane: AgentLane;
  description: string;
  execute: () => Promise<T>;
  createdAt: number;
}

export interface LaneStatus {
  lane: AgentLane;
  state: 'idle' | 'running' | 'paused';
  activeTaskCount: number;
  completedTaskCount: number;
}

export class MultiLaneScheduler {
  private queues: Record<AgentLane, LaneTask[]> = {
    steering: [],
    interactive: [],
    background: [],
  };

  private states: Record<AgentLane, 'idle' | 'running' | 'paused'> = {
    steering: 'idle',
    interactive: 'idle',
    background: 'idle',
  };

  private completedCounts: Record<AgentLane, number> = {
    steering: 0,
    interactive: 0,
    background: 0,
  };

  private isProcessing = false;
  private listeners: Set<() => void> = new Set();
  private cachedStatus?: Record<AgentLane, LaneStatus>;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.cachedStatus = undefined;
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[MultiLaneScheduler] Listener error:', err);
      }
    });
  }

  async enqueue<T>(lane: AgentLane, description: string, execute: () => Promise<T>): Promise<T> {
    const id = `task_${lane}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    return new Promise<T>((resolve, reject) => {
      const wrappedTask: LaneTask<T> = {
        id,
        lane,
        description,
        createdAt: Date.now(),
        execute: async () => {
          try {
            const result = await execute();
            resolve(result);
            return result;
          } catch (err) {
            reject(err);
            throw err;
          }
        },
      };

      this.queues[lane].push(wrappedTask);
      this.notify();
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Öncelik Sırası: Steering (Acil) > Interactive (Sohbet) > Background (Arka Plan)
      const lanesOrder: AgentLane[] = ['steering', 'interactive', 'background'];

      for (const lane of lanesOrder) {
        if (this.states[lane] === 'paused') continue;

        const task = this.queues[lane].shift();
        if (task) {
          this.states[lane] = 'running';
          this.notify();
          piEventStream.emit({
            type: 'lane_switched',
            lane,
            reason: `Görev başlatıldı: ${task.description}`,
            timestamp: Date.now(),
          });

          try {
            await task.execute();
          } catch (err) {
            console.error(`[MultiLaneScheduler] ${lane} görevi başarısız:`, err);
          } finally {
            this.states[lane] = 'idle';
            this.completedCounts[lane]++;
            this.notify();
          }

          // Steering veya interactive çalıştıktan sonra tekrar en baştan öncelikleri kontrol et
          break;
        }
      }
    } finally {
      this.isProcessing = false;
      // Kuyruklarda kalan görev varsa devam et
      const hasPending = Object.values(this.queues).some((q) => q.length > 0);
      if (hasPending) {
        setTimeout(() => this.processNext(), 10);
      }
    }
  }

  pauseLane(lane: AgentLane): void {
    this.states[lane] = 'paused';
    this.notify();
  }

  resumeLane(lane: AgentLane): void {
    if (this.states[lane] === 'paused') {
      this.states[lane] = 'idle';
      this.notify();
      this.processNext();
    }
  }

  getLaneStatus(lane: AgentLane): LaneStatus {
    return {
      lane,
      state: this.states[lane],
      activeTaskCount: this.queues[lane].length,
      completedTaskCount: this.completedCounts[lane],
    };
  }

  getAllStatus(): Record<AgentLane, LaneStatus> {
    if (!this.cachedStatus) {
      this.cachedStatus = {
        steering: this.getLaneStatus('steering'),
        interactive: this.getLaneStatus('interactive'),
        background: this.getLaneStatus('background'),
      };
    }
    return this.cachedStatus;
  }

  clear(): void {
    this.queues.steering = [];
    this.queues.interactive = [];
    this.queues.background = [];
    this.notify();
  }
}

export const multiLaneScheduler = new MultiLaneScheduler();
