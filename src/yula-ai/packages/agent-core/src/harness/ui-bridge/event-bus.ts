import {
  UIEvent,
  UIAction,
  IEventBus,
  RecordTelemetryOptions,
  AppTelemetryEvent,
  TelemetryTopic,
  TelemetrySeverity,
  GetRecentEventsOptions,
} from '../../types';

export function formatRelativeAge(timestamp: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}h ago`;
}

export function inferTelemetrySeverity(type?: string, explicit?: TelemetrySeverity): TelemetrySeverity {
  if (explicit) return explicit;
  if (type === 'REPORT_FAILED') return 'critical';
  if (type === 'REPORT_CANCELLED') return 'warn';
  return 'info';
}

export const SEVERITY_RANK: Record<TelemetrySeverity, number> = {
  info: 1,
  warn: 2,
  critical: 3,
};

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

export function canonicalStringify(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'object') return String(val);
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  try {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify((val as Record<string, unknown>)[k])).join(',') + '}';
  } catch {
    return String(val);
  }
}

export function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeEventHash(source: string, type: string, payload?: unknown): string {
  const serialized = canonicalStringify(payload);
  return fnv1a32(`${source}:${type}:${serialized}`);
}

function arePayloadsEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return canonicalStringify(a) === canonicalStringify(b);
}

export class UIEventBus implements IEventBus {
  private subscribers: Map<string, ActionHandler[]> = new Map();
  private telemetryListeners: Set<TelemetryListener> = new Set();
  private criticalListeners: Set<TelemetryListener> = new Set();
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

  private notifyCritical(event: UIEvent): void {
    this.criticalListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[UIEventBus] Critical telemetry listener hatası:', err);
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
      if (ev.severity === 'critical') {
        this.notifyCritical(ev);
      }
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
   * standartlaştırılmış DispatchResult formatında geri iletir.
   */
  dispatch(actionPayload: UIAction): DispatchResult;
  dispatch(componentId: string, action: string, payload?: any): DispatchResult;
  dispatch(first: UIAction | string, second?: string, third?: any): DispatchResult {
    const actionPayload: UIAction =
      typeof first === 'string'
        ? { component_id: first, action: second!, payload: third }
        : first;

    const list = this.subscribers.get(actionPayload.component_id);
    if (!list || list.length === 0) {
      return {
        success: false,
        error: `Bileşen "${actionPayload.component_id}" bulunamadı veya dinleyicisi yok.`,
      };
    }

    try {
      // Bileşen eylemleri RPC semantiğine sahiptir; birden fazla dinleyici varsa son aktif dinleyici işletilir
      const handler = list[list.length - 1];
      const outcome = handler(actionPayload.action, actionPayload.payload);

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
    const severity: TelemetrySeverity = inferTelemetrySeverity(event.type, (event as any).severity ?? options?.severity);
    const correlationId: string | undefined = (event as any).correlationId ?? options?.correlationId;
    const coalesceKey = options?.coalesceKey;
    const eventHash = (event as any).eventHash ?? computeEventHash(event.source, event.type, event.payload);

    // Özel tekilleştirme/birleştirme anahtarı varsa ringBuffer içinde eşleşeni doğrudan güncelle
    if (!isForced && coalesceKey) {
      const match = this.ringBuffer.find((e) => (e as any)._coalesceKey === coalesceKey);
      if (match) {
        match.payload = event.payload;
        match.timestamp = now;
        match.topic = topic;
        match.eventHash = eventHash;
        match.repeatCount = (match.repeatCount || 1) + 1;
        if (correlationId) match.correlationId = correlationId;
        if (severity) match.severity = severity;
        this.notifyListeners(match);
        if (severity === 'critical') this.notifyCritical(match);
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
          last.eventHash = eventHash;
          last.repeatCount = (last.repeatCount || 1) + 1;
          if (correlationId) last.correlationId = correlationId;
          if (severity) last.severity = severity;
          return;
        }

        // Durum 2: Aynı kaynak ve tip, değişen değer -> Yerinde Birleştirme (In-Place Coalescing)
        if (shouldCoalesce) {
          last.payload = event.payload;
          last.timestamp = now;
          last.topic = topic;
          last.eventHash = eventHash;
          last.repeatCount = (last.repeatCount || 1) + 1;
          if (correlationId) last.correlationId = correlationId;
          if (severity) last.severity = severity;

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
              if (ev.severity === 'critical') this.notifyCritical(ev);
            }
          }, Math.min(50, windowMs));
          return;
        }
      }
    }

    // Önceki bekleyen birleştirilmiş bildirim varsa önce onu yay
    this.flushPendingNotification();

    // Durum 3: Yeni / farklı olay veya tekilleştirme penceresi dışı
    const fullEvent: UIEvent = {
      ...event,
      topic,
      timestamp: now,
      severity,
      correlationId,
      eventHash,
      repeatCount: 1,
      firstTimestamp: now,
    };
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
    if (severity === 'critical') this.notifyCritical(fullEvent);
  }

  onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => {
      this.telemetryListeners.delete(listener);
    };
  }

  onCritical(listener: TelemetryListener): () => void {
    this.criticalListeners.add(listener);
    return () => {
      this.criticalListeners.delete(listener);
    };
  }

  getRecentEvents(options?: GetRecentEventsOptions): UIEvent[] {
    let result = [...this.ringBuffer];
    if (options?.topic) {
      result = result.filter((e) => e.topic === options.topic);
    }
    if (options?.source) {
      const src = options.source;
      result = result.filter((e) => e.source === src || e.source.startsWith(src) || src.startsWith(e.source));
    }
    if (options?.type) {
      const targetType = options.type.toLowerCase();
      result = result.filter((e) => e.type.toLowerCase() === targetType);
    }
    if (options?.correlationId) {
      result = result.filter((e) => e.correlationId === options.correlationId);
    }
    if (options?.minSeverity) {
      const minRank = SEVERITY_RANK[options.minSeverity] ?? 1;
      result = result.filter((e) => (SEVERITY_RANK[e.severity ?? 'info'] ?? 1) >= minRank);
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

    const now = Date.now();
    return result.map((e) => ({
      ...e,
      age: formatRelativeAge(e.timestamp, now),
      ageMs: Math.max(0, now - e.timestamp),
    }));
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
    this.criticalListeners.clear();
    this.clearTelemetry();
  }
}

export const uiEventBus = new UIEventBus();
