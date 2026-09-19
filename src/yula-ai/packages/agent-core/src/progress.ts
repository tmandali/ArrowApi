import { piEventStream } from './pi-event-stream';

export interface ToolProgressUpdate {
  toolCallId: string;
  toolName: string;
  percentage: number; // 0 - 100
  message: string;
  data?: any;
  timestamp: number;
}

export interface ProgressReporter {
  report(percentage: number, message: string, data?: any): void;
  done(message?: string): void;
}

export type ProgressListener = (update: ToolProgressUpdate) => void;

class ProgressManager {
  private activeProgress: Map<string, ToolProgressUpdate> = new Map();
  private listeners: Set<ProgressListener> = new Set();

  createReporter(toolCallId: string, toolName: string): ProgressReporter {
    return {
      report: (percentage: number, message: string, data?: any) => {
        const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
        const update: ToolProgressUpdate = {
          toolCallId,
          toolName,
          percentage: clamped,
          message,
          data,
          timestamp: Date.now(),
        };

        this.activeProgress.set(toolCallId, update);
        this.notify(update);

        piEventStream.emit({
          type: 'tool_progress',
          toolCallId,
          toolName,
          percentage: clamped,
          message,
          data,
          timestamp: update.timestamp,
        });
      },
      done: (message = 'Tamamlandı') => {
        const update: ToolProgressUpdate = {
          toolCallId,
          toolName,
          percentage: 100,
          message,
          timestamp: Date.now(),
        };
        this.activeProgress.set(toolCallId, update);
        this.notify(update);

        piEventStream.emit({
          type: 'tool_progress',
          toolCallId,
          toolName,
          percentage: 100,
          message,
          timestamp: update.timestamp,
        });

        setTimeout(() => {
          this.activeProgress.delete(toolCallId);
        }, 3000);
      },
    };
  }

  getActiveProgress(toolCallId: string): ToolProgressUpdate | undefined {
    return this.activeProgress.get(toolCallId);
  }

  getAllActive(): ToolProgressUpdate[] {
    return Array.from(this.activeProgress.values());
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(update: ToolProgressUpdate): void {
    this.listeners.forEach((l) => {
      try {
        l(update);
      } catch (err) {
        console.error('[ProgressManager] Listener hatası:', err);
      }
    });
  }

  clear(): void {
    this.activeProgress.clear();
  }
}

export const progressManager = new ProgressManager();
