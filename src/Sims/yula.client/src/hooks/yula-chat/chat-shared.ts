import { extractAgentIdFromPath } from "@/lib/workspace-paths";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { getMessageText } from "@my-agent/core";
import type { YulaChatContextValue } from "../yula-chat-context";

/** ChatInstance onContextReady imzasındaki canlı yardımcı alt kümesi. */
export type LiveHelpers = Omit<
  YulaChatContextValue,
  | "conversations" | "activeId" | "selectConversation"
  | "deleteConversation" | "newConversation" | "model" | "setModel"
  | "isThinkingEnabled" | "setThinkingEnabled"
>;

export const RESPONSE_TIMEOUT_MS = 45000;

/** İstek başlangıç anı — provider tekildir; render sırasında ref geçişi gerekmez. */
let requestStartMs: number | null = null;

export function markRequestStart() {
  if (requestStartMs === null) requestStartMs = Date.now();
}

export function getRequestStartMs() {
  return requestStartMs;
}

export function clearRequestStart() {
  requestStartMs = null;
}

/** Aktif sohbet kimliği — transport kapanışları ref yerine erişimci okur. */
let activeConversationId = "";

export function getActiveConversationId() {
  return activeConversationId;
}

export function setActiveConversationId(id: string) {
  activeConversationId = id;
}

/**
 * Güncel ajan kimliği: /agents/<id> sayfasındayken URL kazanır (ayrı session),
 * diğer sayfalarda global seçim geçerlidir. null = varsayılan Yula.
 */
export function resolveCurrentAgentId(hrefOrPath: string): string | null {
  const fromUrl = extractAgentIdFromPath(hrefOrPath.split("?")[0] || "/");
  if (fromUrl) return fromUrl;
  try {
    return useUserAgentsStore.getState().activeAgentId ?? null;
  } catch {
    return null;
  }
} // 45 saniye azami yanıt süresi eşiği (yerel Ollama model soğuk yükleme payı)

/** Anahtar sırasından bağımsız, kararlı JSON imzası (tekrar-çağrı dedupe'ı). */
export function stableSignature(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableSignature).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableSignature(obj[k])}`)
    .join(",")}}`;
}

/** Wait for arrival at the target pathname so the apply→navigate chain resumes with fresh context. */
export function waitForPathname(
  target: string,
  timeoutMs = 7000,
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const wanted = norm(target);
  return new Promise((resolve) => {
    if (norm(window.location.pathname) === wanted) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (norm(window.location.pathname) === wanted) {
        window.clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

/** Does the apply_criteria output carry navigation to another screen? (only when no required fields are missing) */
export function isApplyNavigateOutput(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  return (
    o.status === "ok" &&
    typeof o.navigateTo === "string" &&
    (!Array.isArray(o.missingRequired) || o.missingRequired.length === 0)
  );
}

/** Sohbetin ilk kullanıcı mesajının metnini döner (geçmiş indeksleme bağlamı için). */
export function firstUserMessageText(messages?: YulaMessage[]): string {
  const firstUser = messages?.find((m) => m.role === "user");
  return getMessageText(firstUser);
}

export const customFetchWithTimeout: typeof fetch = async (url, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Yula AI yanıt süresi azami eşiği (45s) aşıldı."));
  }, RESPONSE_TIMEOUT_MS);

  if (init?.signal) {
    init.signal.addEventListener("abort", () =>
      controller.abort(init.signal?.reason),
    );
  }

  const startMs = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.info(
      `🤖 [Yula Response Telemetry] Stream response started in ${Math.round(performance.now() - startMs)} ms.`,
    );
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      console.warn(
        `🤖 [Yula Timeout Telemetry] Request aborted due to 45s timeout threshold.`,
      );
      throw new Error("Yula yanıt süresi eşiği (45s) aşıldı. Lütfen tekrar deneyin.");
    }
    throw err;
  }
};
