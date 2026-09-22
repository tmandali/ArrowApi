import { AgentEvent } from '../../types';

export type AgentEventListener = (event: AgentEvent) => void;

class PiEventStream {
  private listeners: Set<AgentEventListener> = new Set();
  private history: AgentEvent[] = [];
  private readonly maxHistory: number = 50;

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: AgentEvent): void {
    const stampedEvent: AgentEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
    };
    this.history.push(stampedEvent);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.listeners.forEach((listener) => {
      try {
        listener(stampedEvent);
      } catch (err) {
        console.error('[PiEventStream] Listener hatası:', err);
      }
    });
  }

  getHistory(): AgentEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}

export const piEventStream = new PiEventStream();
