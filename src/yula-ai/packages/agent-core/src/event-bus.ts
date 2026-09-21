import {
  UIEvent,
  UIAction,
  IEventBus,
  RecordTelemetryOptions,
  AppTelemetryEvent,
  TelemetryTopic,
  GetRecentEventsOptions,
} from './types';

export { type RecordTelemetryOptions, type AppTelemetryEvent, type TelemetryTopic, type GetRecentEventsOptions };

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

export function inferTelemetryTopic(source: string, type?: string): TelemetryTopic {
  if (
    source === 'arrow_job' ||
    source.startsWith('arrow_job') ||
    type?.startsWith('REPORT_') ||
    type === 'JOB_SELECTED'
  ) {
    return 'jobs';
  }
  if (
    source === 'result_grid' ||
    source.startsWith('result_grid') ||
    type?.startsWith('GRID_') ||
    type === 'ROW_SELECTED' ||
    type === 'FILTER_APPLIED' ||
    type === 'SORT_CHANGED' ||
    type === 'VIEW_TRANSFORMED' ||
    type === 'EXPORT_TRIGGERED'
  ) {
    return 'data';
  }
  if (
    source === 'criteria_form' ||
    source.startsWith('criteria_form') ||
    type?.startsWith('CRITERIA_')
  ) {
    return 'form';
  }
  if (
    source === 'app_router' ||
    source.startsWith('app_router') ||
    type === 'ROUTE_CHANGED'
  ) {
    return 'navigation';
  }
  return 'system';
}

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
  private readonly bufferLimit: number = 50;
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

  recordTelemetry(event: AppTelemetryEvent | Omit<UIEvent, 'timestamp'>, options?: RecordTelemetryOptions): void {
    const now = Date.now();
    const windowMs = options?.dedupWindowMs ?? this.dedupWindowMs;
    const shouldCoalesce = options?.coalesce ?? true;
    const isForced = options?.force === true;
    const topic: TelemetryTopic = (event as any).topic ?? inferTelemetryTopic(event.source, event.type);
    const coalesceKey = options?.coalesceKey;

    // Özel tekilleştirme/birleştirme anahtarı varsa ringBuffer içinde eşleşeni doğrudan güncelle
    if (!isForced && coalesceKey) {
      const match = this.ringBuffer.find((e) => (e as any)._coalesceKey === coalesceKey);
      if (match) {
        match.payload = event.payload;
        match.timestamp = now;
        match.topic = topic;
        this.notifyListeners(match);
        return;
      }
    }

    if (!isForced && windowMs > 0 && this.ringBuffer.length > 0) {
      const last = this.ringBuffer[this.ringBuffer.length - 1];
      const isWithinWindow = (now - last.timestamp) <= windowMs;

      if (isWithinWindow && last.source === event.source && last.type === event.type) {
        // Durum 1: Birebir aynı payload -> Tam Tekilleştirme (Identical Dedup)
        if (arePayloadsEqual(last.payload, event.payload)) {
          last.timestamp = now;
          last.topic = topic;
          return;
        }

        // Durum 2: Aynı kaynak ve tip, değişen değer -> Yerinde Birleştirme (In-Place Coalescing)
        if (shouldCoalesce) {
          last.payload = event.payload;
          last.timestamp = now;
          last.topic = topic;

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
    const fullEvent: UIEvent = { ...event, topic, timestamp: now };
    if (coalesceKey) {
      Object.defineProperty(fullEvent, '_coalesceKey', {
        value: coalesceKey,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
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

  getRecentEvents(options?: GetRecentEventsOptions): UIEvent[] {
    let result = [...this.ringBuffer];
    if (options?.topic) {
      result = result.filter((e) => e.topic === options.topic);
    }
    if (options?.source) {
      result = result.filter((e) => e.source === options.source || e.source.startsWith(options.source));
    }
    if (options?.type) {
      result = result.filter((e) => e.type === options.type);
    }

    // Aynı topic içinde her farklı olay tipinin (type) yalnızca en sonuncusunu tut
    if (options?.distinctByType) {
      const seen = new Set<string>();
      const distinctReversed: UIEvent[] = [];
      for (let i = result.length - 1; i >= 0; i--) {
        const ev = result[i];
        const key = `${ev.topic ?? 'system'}:${ev.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          distinctReversed.push(ev);
        }
      }
      result = distinctReversed.reverse();
    }

    // Topic bazında dengeli seçim (her aktif topic'ten en son N olay)
    if (options?.balanced) {
      const perTopic = options.limit ?? 2;
      const byTopic = new Map<string, UIEvent[]>();
      for (const ev of result) {
        const t = ev.topic ?? 'system';
        if (!byTopic.has(t)) byTopic.set(t, []);
        byTopic.get(t)!.push(ev);
      }
      const balancedList: UIEvent[] = [];
      for (const [, events] of byTopic) {
        balancedList.push(...events.slice(-perTopic));
      }
      result = balancedList.sort((a, b) => a.timestamp - b.timestamp);
    } else if (options?.limit && options.limit > 0) {
      result = result.slice(-options.limit);
    } else if (!options) {
      result = result.slice(-10);
    }

    return result;
  }

  getTopicBalancedEvents(perTopicLimit: number = 2, distinctByType: boolean = true): UIEvent[] {
    return this.getRecentEvents({
      balanced: true,
      distinctByType,
      limit: perTopicLimit,
    });
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

