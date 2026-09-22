import { piEventStream } from '../telemetry/pi-event-stream';

export type DurableTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'interrupted';

export interface DurableTaskCheckpoint<S = any> {
  progressPct?: number; // 0 - 100
  stage?: string; // e.g., 'querying_backend', 'ingesting_duckdb', 'rendering'
  cursor?: Record<string, any>;
  state?: S;
  updatedAt: number;
}

export interface DurableTaskRecord<I = any, S = any, R = any> {
  id: string;
  kind: string;
  idempotencyKey?: string;
  input: I;
  status: DurableTaskStatus;
  checkpoint?: DurableTaskCheckpoint<S>;
  result?: R;
  error?: {
    message: string;
    details?: any;
  };
  memos: Record<string, any>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
}

export interface DurableTaskOptions<I = any> {
  id?: string;
  kind: string;
  input: I;
  idempotencyKey?: string;
  maxRetries?: number;
  initialCheckpoint?: Partial<DurableTaskCheckpoint>;
  memos?: Record<string, any>;
}

export interface TaskExecutionContext<I = any, S = any> {
  taskId: string;
  kind: string;
  input: I;
  checkpoint?: DurableTaskCheckpoint<S>;
  saveCheckpoint: (checkpoint: Partial<DurableTaskCheckpoint<S>>) => Promise<void>;
  setMemo: (key: string, value: any) => Promise<void>;
  getMemo: <T = any>(key: string) => T | undefined;
  signal: AbortSignal;
}

export type DurableTaskRunner<I = any, S = any, R = any> = (
  ctx: TaskExecutionContext<I, S>
) => Promise<R>;

export interface DurableStorageDriver {
  saveTask(task: DurableTaskRecord): Promise<void>;
  getTask(id: string): Promise<DurableTaskRecord | null>;
  listTasks(): Promise<DurableTaskRecord[]>;
  deleteTask(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryDurableStorageDriver implements DurableStorageDriver {
  private tasks: Map<string, DurableTaskRecord> = new Map();

  async saveTask(task: DurableTaskRecord): Promise<void> {
    this.tasks.set(task.id, JSON.parse(JSON.stringify(task)));
  }

  async getTask(id: string): Promise<DurableTaskRecord | null> {
    const task = this.tasks.get(id);
    return task ? JSON.parse(JSON.stringify(task)) : null;
  }

  async listTasks(): Promise<DurableTaskRecord[]> {
    return Array.from(this.tasks.values()).map((t) => JSON.parse(JSON.stringify(t)));
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async clear(): Promise<void> {
    this.tasks.clear();
  }
}

/**
 * Pi-Style Durable Lane & Task Recovery
 * Provides crash-resilient, checkpointed execution for long-running operations
 * (Arrow Jobs, DuckDB ETL, report generators, background sync).
 */
export class DurableLaneManager {
  private storage: DurableStorageDriver;
  private runners: Map<string, DurableTaskRunner> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private activeExecutions: Map<string, Promise<any>> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor(storageDriver?: DurableStorageDriver) {
    this.storage = storageDriver ?? new MemoryDurableStorageDriver();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[DurableLaneManager] Listener error:', err);
      }
    });
  }

  registerRunner<I = any, S = any, R = any>(
    kind: string,
    runner: DurableTaskRunner<I, S, R>
  ): void {
    this.runners.set(kind, runner);
  }

  hasRunner(kind: string): boolean {
    return this.runners.has(kind);
  }

  async submitTask<I = any, S = any, R = any>(
    options: DurableTaskOptions<I>
  ): Promise<DurableTaskRecord<I, S, R>> {
    // 1. Idempotency Check
    if (options.idempotencyKey) {
      const all = await this.storage.listTasks();
      const existing = all.find(
        (t) =>
          t.idempotencyKey === options.idempotencyKey &&
          (t.status === 'pending' || t.status === 'running' || t.status === 'completed')
      );
      if (existing) {
        return existing as DurableTaskRecord<I, S, R>;
      }
    }

    const taskId =
      options.id ||
      `durable_${options.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const record: DurableTaskRecord<I, S, R> = {
      id: taskId,
      kind: options.kind,
      idempotencyKey: options.idempotencyKey,
      input: options.input,
      status: 'pending',
      checkpoint: options.initialCheckpoint
        ? {
            progressPct: options.initialCheckpoint.progressPct ?? 0,
            stage: options.initialCheckpoint.stage ?? 'initialized',
            cursor: options.initialCheckpoint.cursor,
            state: options.initialCheckpoint.state,
            updatedAt: Date.now(),
          }
        : undefined,
      memos: options.memos ? { ...options.memos } : {},
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
    };

    await this.storage.saveTask(record);
    piEventStream.emit({
      type: 'lane_switched',
      lane: 'background',
      reason: `Durable task enqueued: ${record.id} (${record.kind})`,
      timestamp: Date.now(),
    });

    this.notify();
    return record;
  }

  async runTask<R = any>(taskId: string): Promise<R> {
    if (this.activeExecutions.has(taskId)) {
      return this.activeExecutions.get(taskId)!;
    }

    let controller = this.abortControllers.get(taskId);
    if (!controller) {
      controller = new AbortController();
      this.abortControllers.set(taskId, controller);
    }

    const promise = (async () => {
      const task = await this.storage.getTask(taskId);
      if (!task) {
        throw new Error(`[DurableLaneManager] Task not found: ${taskId}`);
      }

      const runner = this.runners.get(task.kind);
      if (!runner) {
        throw new Error(`[DurableLaneManager] No runner registered for kind: ${task.kind}`);
      }

      if (controller!.signal.aborted) {
        const reasonMsg =
          controller!.signal.reason instanceof Error
            ? controller!.signal.reason.message
            : typeof controller!.signal.reason === 'string'
              ? controller!.signal.reason
              : 'Task aborted';
        task.status = 'aborted';
        task.error = { message: reasonMsg };
        await this.storage.saveTask(task);
        this.notify();
        throw controller!.signal.reason instanceof Error
          ? controller!.signal.reason
          : new Error(reasonMsg);
      }

      task.status = 'running';
      task.startedAt = Date.now();
      await this.storage.saveTask(task);
      this.notify();

      const context: TaskExecutionContext = {
        taskId: task.id,
        kind: task.kind,
        input: task.input,
        checkpoint: task.checkpoint,
        saveCheckpoint: async (partial) => {
          task.checkpoint = {
            progressPct: partial.progressPct ?? task.checkpoint?.progressPct ?? 0,
            stage: partial.stage ?? task.checkpoint?.stage,
            cursor: partial.cursor ?? task.checkpoint?.cursor,
            state: partial.state ?? task.checkpoint?.state,
            updatedAt: Date.now(),
          };
          await this.storage.saveTask(task);
          this.notify();
        },
        setMemo: async (key, val) => {
          task.memos[key] = val;
          await this.storage.saveTask(task);
        },
        getMemo: (key) => task.memos[key],
        signal: controller.signal,
      };

      try {
        if (controller.signal.aborted) {
          throw new Error('Task aborted');
        }

        const result = await runner(context);

        task.status = 'completed';
        task.result = result;
        task.completedAt = Date.now();
        task.checkpoint = {
          ...(task.checkpoint || {}),
          progressPct: 100,
          stage: 'completed',
          updatedAt: Date.now(),
        };
        await this.storage.saveTask(task);
        this.notify();
        return result;
      } catch (err: any) {
        if (controller.signal.aborted) {
          task.status = 'aborted';
          task.error = { message: err?.message || 'Task aborted' };
        } else if (task.retryCount < task.maxRetries) {
          task.retryCount += 1;
          task.status = 'pending';
          task.error = {
            message: err?.message || 'Execution failed',
            details: String(err?.stack || err),
          };
        } else {
          task.status = 'failed';
          task.error = {
            message: err?.message || 'Execution failed',
            details: String(err?.stack || err),
          };
        }
        task.completedAt = Date.now();
        await this.storage.saveTask(task);
        this.notify();
        throw err;
      } finally {
        this.abortControllers.delete(taskId);
        this.activeExecutions.delete(taskId);
      }
    })();

    this.activeExecutions.set(taskId, promise);
    return promise;
  }

  async checkpoint(taskId: string, partial: Partial<DurableTaskCheckpoint>): Promise<void> {
    const task = await this.storage.getTask(taskId);
    if (!task) return;

    task.checkpoint = {
      progressPct: partial.progressPct ?? task.checkpoint?.progressPct ?? 0,
      stage: partial.stage ?? task.checkpoint?.stage,
      cursor: partial.cursor ?? task.checkpoint?.cursor,
      state: partial.state ?? task.checkpoint?.state,
      updatedAt: Date.now(),
    };

    await this.storage.saveTask(task);
    this.notify();
  }

  abortTask(taskId: string, reason: string = 'User aborted'): boolean {
    let controller = this.abortControllers.get(taskId);
    if (!controller) {
      controller = new AbortController();
      this.abortControllers.set(taskId, controller);
    }
    controller.abort(new Error(reason));
    return true;
  }

  async recoverInterruptedTasks(autoResume = false): Promise<DurableTaskRecord[]> {
    const all = await this.storage.listTasks();
    const interruptedTasks: DurableTaskRecord[] = [];

    for (const task of all) {
      if (task.status === 'running' || task.status === 'pending') {
        task.status = 'interrupted';
        task.error = { message: 'Process terminated unexpectedly during execution' };
        await this.storage.saveTask(task);
        interruptedTasks.push(task);

        if (autoResume && this.runners.has(task.kind)) {
          task.status = 'pending';
          await this.storage.saveTask(task);
          // Resume execution in background
          void this.runTask(task.id);
        }
      }
    }

    if (interruptedTasks.length > 0) {
      this.notify();
    }
    return interruptedTasks;
  }

  async getTask<I = any, S = any, R = any>(
    id: string
  ): Promise<DurableTaskRecord<I, S, R> | null> {
    return (await this.storage.getTask(id)) as DurableTaskRecord<I, S, R> | null;
  }

  async listTasks(filter?: {
    kind?: string;
    status?: DurableTaskStatus;
  }): Promise<DurableTaskRecord[]> {
    const all = await this.storage.listTasks();
    return all.filter((task) => {
      if (filter?.kind && task.kind !== filter.kind) return false;
      if (filter?.status && task.status !== filter.status) return false;
      return true;
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.storage.deleteTask(id);
    this.notify();
  }

  async clear(): Promise<void> {
    await this.storage.clear();
    this.notify();
  }
}

export const durableLane = new DurableLaneManager();
