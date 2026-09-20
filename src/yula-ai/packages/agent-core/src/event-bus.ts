import { UIEvent, UIAction, IEventBus, RecordTelemetryOptions } from './types';

export { type RecordTelemetryOptions };

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

function arePayloadsEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export class UIEventBus implements IEventBus {
  private subscribers: Map<string, ActionHandler[]> = new Map();
  private telemetryListeners: Set<TelemetryListener> = new Set();
  private ringBuffer: UIEvent[] = [];
  private readonly bufferLimit: number = 10;
  private dedupWindowMs: number = 250;
  private pendingNotificationTimer: any = null;
  private pendingNotificationEvent: UIEvent | null = null;

  setDedupWindow(ms: number): void {
    this.dedupWindowMs = Math.max(0, ms);
  }

  getDedupWindow(): number {
    return this.dedupWindowMs;
  }

  private notifyListeners(event: UIEvent): void {
    this.telemetryListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[UIEventBus] Telemetry listener hatası:', err);
      }
    });
  }

  private flushPendingNotification(): void {
    if (this.pendingNotificationTimer) {
      clearTimeout(this.pendingNotificationTimer);
      this.pendingNotificationTimer = null;
    }
    if (this.pendingNotificationEvent) {
      const ev = this.pendingNotificationEvent;
      this.pendingNotificationEvent = null;
      this.notifyListeners(ev);
    }
  }

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

  recordTelemetry(event: Omit<UIEvent, 'timestamp'>, options?: RecordTelemetryOptions): void {
    const now = Date.now();
    const windowMs = options?.dedupWindowMs ?? this.dedupWindowMs;
    const shouldCoalesce = options?.coalesce ?? true;
    const isForced = options?.force === true;

    if (!isForced && windowMs > 0 && this.ringBuffer.length > 0) {
      const last = this.ringBuffer[this.ringBuffer.length - 1];
      const isWithinWindow = (now - last.timestamp) <= windowMs;

      if (isWithinWindow && last.source === event.source && last.type === event.type) {
        // Durum 1: Birebir aynı payload -> Tam Tekilleştirme (Identical Dedup)
        if (arePayloadsEqual(last.payload, event.payload)) {
          last.timestamp = now;
          return;
        }

        // Durum 2: Aynı kaynak ve tip, değişen değer -> Yerinde Birleştirme (In-Place Coalescing)
        if (shouldCoalesce) {
          last.payload = event.payload;
          last.timestamp = now;

          // Dinleyicileri sakinleştiren mikro trailing debounce (UI bildirim fırtınasını önler)
          this.pendingNotificationEvent = last;
          if (this.pendingNotificationTimer) {
            clearTimeout(this.pendingNotificationTimer);
          }
          this.pendingNotificationTimer = setTimeout(() => {
            this.pendingNotificationTimer = null;
            if (this.pendingNotificationEvent) {
              const ev = this.pendingNotificationEvent;
              this.pendingNotificationEvent = null;
              this.notifyListeners(ev);
            }
          }, Math.min(50, windowMs));
          return;
        }
      }
    }

    // Önceki bekleyen birleştirilmiş bildirim varsa önce onu yay
    this.flushPendingNotification();

    // Durum 3: Yeni / farklı olay veya tekilleştirme penceresi dışı
    const fullEvent: UIEvent = { ...event, timestamp: now };
    this.ringBuffer.push(fullEvent);
    if (this.ringBuffer.length > this.bufferLimit) {
      this.ringBuffer.shift();
    }
    this.notifyListeners(fullEvent);
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
    this.flushPendingNotification();
    if (this.pendingNotificationTimer) {
      clearTimeout(this.pendingNotificationTimer);
      this.pendingNotificationTimer = null;
    }
    this.pendingNotificationEvent = null;
    this.ringBuffer = [];
  }

  clear(): void {
    this.subscribers.clear();
    this.telemetryListeners.clear();
    this.clearTelemetry();
  }
}

export const uiEventBus = new UIEventBus();

