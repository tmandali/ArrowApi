/**
 * AI↔UI geçici handoff standardı.
 *
 * Kural: ekrandan ekrana tek seferlik taşıma gerektiren her şey
 * (execution focus, AI görünüm isteği, …) bu fabrikadan açılır;
 * el yapımı `CustomEvent` + modül-değişkeni bus yazılmaz.
 *
 * - `request`: kuyruğa koy + monteli dinleyicilere anında dağıt.
 * - `take`: tek atışlık tüket (navigasyon sonrası mount okur).
 * - `subscribe`: aynı sayfada zaten monteli bileşeni besler.
 * - TTL + scope eşleşmesi bayat/yanlış hedefe dağıtımı engeller.
 * - SSR-güvenli: `window` yoksa no-op.
 */

export interface AiChannelOptions<TDetail> {
  /** Benzersiz olay adı, örn. `"yula:select-execution-job"`. */
  name: string;
  /** Kuyruk ömrü (ms). Süresi dolan istek sessizce düşer. */
  ttlMs?: number;
  /** İsteğin hedef kapsamı (scope filtresi için okunur). */
  scopeOf?: (detail: TDetail) => string | undefined;
}

export interface AiChannel<TDetail> {
  request: (detail: TDetail) => void;
  take: (scope?: string) => TDetail | null;
  subscribe: (handler: (detail: TDetail) => void) => () => void;
  clear: () => void;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function sameScope(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function createAiChannel<TDetail>(
  options: AiChannelOptions<TDetail>,
): AiChannel<TDetail> {
  const { name, ttlMs = DEFAULT_TTL_MS, scopeOf } = options;
  let pending: TDetail | null = null;
  let pendingAt = 0;

  function take(scope?: string): TDetail | null {
    if (!pending) return null;
    if (Date.now() - pendingAt > ttlMs) {
      pending = null;
      return null;
    }
    if (scopeOf && !sameScope(scopeOf(pending), scope)) return null;
    const next = pending;
    pending = null;
    return next;
  }

  return {
    request(detail: TDetail): void {
      pending = detail;
      pendingAt = Date.now();
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent<TDetail>(name, { detail }));
    },
    take,
    subscribe(handler: (detail: TDetail) => void): () => void {
      if (typeof window === "undefined") return () => {};
      const onEvent = (event: Event) => {
        const detail = (event as CustomEvent<TDetail>).detail;
        if (!detail) return;
        pending = null;
        handler(detail);
      };
      window.addEventListener(name, onEvent);
      return () => window.removeEventListener(name, onEvent);
    },
    clear(): void {
      pending = null;
    },
  };
}
