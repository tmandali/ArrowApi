import { piEventStream } from '../telemetry/pi-event-stream';

export type DeferredStatus = 'suspended' | 'resumed' | 'cancelled' | 'timed_out';

export interface DeferredHandle<T = any> {
  handleId: string;
  name: string;
  status: DeferredStatus;
  createdAt: number;
  metadata?: any;
  result?: T;
  resolve?: (value: T) => void;
  reject?: (reason?: any) => void;
  timeoutId?: any;
}

export class DeferredManager {
  private handles: Map<string, DeferredHandle> = new Map();

  private findHandle(idOrKey: string): DeferredHandle | undefined {
    let handle = this.handles.get(idOrKey);
    if (handle) return handle;

    for (const h of this.handles.values()) {
      if (
        h.handleId === idOrKey ||
        h.name === idOrKey ||
        h.metadata?.jobId === idOrKey ||
        h.metadata?.taskId === idOrKey
      ) {
        return h;
      }
    }
    return undefined;
  }

  createDeferred<T = any>(
    name: string,
    metadata?: any,
    timeoutMs: number = 30000,
    customHandleId?: string
  ): { handle: DeferredHandle<T>; promise: Promise<T> } {
    const handleId =
      customHandleId ||
      metadata?.handleId ||
      metadata?.jobId ||
      `def_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let resolver!: (value: T) => void;
    let rejecter!: (reason?: any) => void;

    const promise = new Promise<T>((res, rej) => {
      resolver = res;
      rejecter = rej;
    });

    const handle: DeferredHandle<T> = {
      handleId,
      name,
      status: 'suspended',
      createdAt: Date.now(),
      metadata,
      resolve: resolver,
      reject: rejecter,
    };

    if (timeoutMs > 0) {
      handle.timeoutId = setTimeout(() => {
        if (handle.status === 'suspended') {
          handle.status = 'timed_out';
          const timeoutError = new Error(`[DeferredManager] "${name}" zaman aşımına uğradı (${timeoutMs}ms)`);

          piEventStream.emit({
            type: 'task_timed_out',
            taskId: handle.handleId,
            handleId: handle.handleId,
            metadata: { name, ...metadata },
            timestamp: Date.now(),
          });

          handle.reject?.(timeoutError);
          this.handles.delete(handle.handleId);
        }
      }, timeoutMs);
    }

    this.handles.set(handleId, handle);

    piEventStream.emit({
      type: 'task_suspended',
      taskId: handleId,
      handleId,
      metadata: { name, ...metadata },
      timestamp: Date.now(),
    });

    return { handle, promise };
  }

  resume<T = any>(idOrKey: string, result: T): boolean {
    const handle = this.findHandle(idOrKey);
    if (!handle || handle.status !== 'suspended') {
      console.warn(`[DeferredManager] Askıda olmayan görev sürdürülemez: ${idOrKey}`);
      return false;
    }

    if (handle.timeoutId) clearTimeout(handle.timeoutId);
    handle.status = 'resumed';
    handle.result = result;
    handle.resolve?.(result);

    piEventStream.emit({
      type: 'task_resumed',
      taskId: handle.handleId,
      handleId: handle.handleId,
      result,
      timestamp: Date.now(),
    });

    this.handles.delete(handle.handleId);
    return true;
  }

  cancel(idOrKey: string, reason: string = 'Kullanıcı tarafından iptal edildi'): boolean {
    const handle = this.findHandle(idOrKey);
    if (!handle || handle.status !== 'suspended') return false;

    if (handle.timeoutId) clearTimeout(handle.timeoutId);
    handle.status = 'cancelled';
    handle.reject?.(new Error(reason));

    piEventStream.emit({
      type: 'task_cancelled',
      taskId: handle.handleId,
      handleId: handle.handleId,
      reason,
      timestamp: Date.now(),
    });

    this.handles.delete(handle.handleId);
    return true;
  }

  getSuspendedHandles(): DeferredHandle[] {
    return Array.from(this.handles.values()).filter((h) => h.status === 'suspended');
  }

  clear(): void {
    this.handles.forEach((h) => {
      if (h.timeoutId) clearTimeout(h.timeoutId);
      if (h.status === 'suspended') h.reject?.(new Error('DeferredManager temizlendi'));
    });
    this.handles.clear();
  }
}

export const deferredManager = new DeferredManager();
