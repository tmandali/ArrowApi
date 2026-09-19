import { UIEvent, UIAction, IEventBus } from './types';

export interface DispatchResult {
  success: boolean;
  result?: any;
  error?: string;
}

export type ActionHandler = (
  action: string,
  payload: any
) => { success?: boolean; error?: string; [key: string]: any } | boolean | void;

type TelemetryListener = (event: UIEvent) => void;

export class UIEventBus implements IEventBus {
  private subscribers: Map<string, ActionHandler[]> = new Map();
  private telemetryListeners: Set<TelemetryListener> = new Set();
  private ringBuffer: UIEvent[] = [];
  private readonly bufferLimit: number = 10;

  subscribe(componentId: string, handler: ActionHandler): () => void {
    const list = this.subscribers.get(componentId) || [];
    list.push(handler);
    this.subscribers.set(componentId, list);
    return () => {
      const current = this.subscribers.get(componentId) || [];
      const updated = current.filter((h) => h !== handler);
      if (updated.length === 0) {
        this.subscribers.delete(componentId);
      } else {
        this.subscribers.set(componentId, updated);
      }
    };
  }

  /**
   * Hedef bileşene aksiyon gönderir ve bileşenin döndürdüğü sonucu (başarı/hata)
   * Pi değerlendirme döngüsüne iletilmek üzere geri döner.
   */
  dispatch(actionPayload: UIAction): DispatchResult {
    const list = this.subscribers.get(actionPayload.component_id);
    if (!list || list.length === 0) {
      const err = `[UIEventBus] Hedef bileşen bulunamadı: ${actionPayload.component_id}`;
      console.warn(err);
      return { success: false, error: err };
    }

    const handler = list[list.length - 1];

    try {
      const outcome = handler(actionPayload.action, actionPayload.payload);

      // Bileşen açıkça false döndüyse
      if (outcome === false) {
        return { success: false, error: `Bileşen "${actionPayload.component_id}" eylemi reddetti.` };
      }

      // Bileşen { success: false, error: "..." } nesnesi döndüyse (Validasyon hatası vb.)
      if (outcome && typeof outcome === 'object' && outcome.success === false) {
        return {
          success: false,
          error: outcome.error || `Bileşen "${actionPayload.component_id}" eylemi başarısız oldu.`,
          result: outcome,
        };
      }

      return { success: true, result: outcome };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`[UIEventBus] Eylem işleme hatası:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  recordTelemetry(event: Omit<UIEvent, 'timestamp'>): void {
    const fullEvent: UIEvent = { ...event, timestamp: Date.now() };
    this.ringBuffer.push(fullEvent);
    if (this.ringBuffer.length > this.bufferLimit) {
      this.ringBuffer.shift();
    }
    this.telemetryListeners.forEach((listener) => {
      try {
        listener(fullEvent);
      } catch (err) {
        console.error('[UIEventBus] Telemetry listener hatası:', err);
      }
    });
  }

  onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => {
      this.telemetryListeners.delete(listener);
    };
  }

  getRecentEvents(): UIEvent[] {
    return [...this.ringBuffer];
  }

  clearTelemetry(): void {
    this.ringBuffer = [];
  }

  clear(): void {
    this.subscribers.clear();
    this.telemetryListeners.clear();
    this.ringBuffer = [];
  }
}

export const uiEventBus = new UIEventBus();
