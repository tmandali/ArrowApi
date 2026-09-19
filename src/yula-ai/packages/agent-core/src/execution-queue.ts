import { ExecutionMode, UIAction } from './types';
import { uiRegistry } from './component-registry';

type ActionTask = () => Promise<any>;

/**
 * Pi-Style Tool Execution Coordinator (Parallel vs Sequential Mode)
 * Reference: earendil-works/pi/packages/agent/src/harness/execution/tools.ts
 */
export class ActionExecutionCoordinator {
  private globalMode: ExecutionMode = 'sequential';
  private queue: ActionTask[] = [];
  private isProcessing = false;

  setGlobalMode(mode: ExecutionMode): void {
    this.globalMode = mode;
  }

  getGlobalMode(): ExecutionMode {
    return this.globalMode;
  }

  async coordinateExecution<T>(action: UIAction, executor: () => Promise<T>): Promise<T> {
    const comp = uiRegistry.get(action.component_id);
    const mode = comp?.executionMode || this.globalMode;

    if (mode === 'parallel') {
      return executor();
    }

    // Sequential Queue execution
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await executor();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (err) {
          console.error('[ActionExecutionCoordinator] Sequential execution error:', err);
        }
      }
    }

    this.isProcessing = false;
  }
}

export const executionCoordinator = new ActionExecutionCoordinator();
