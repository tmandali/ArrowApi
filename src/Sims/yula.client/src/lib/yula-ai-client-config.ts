/** Ayarlar ekranı ile sohbet API'sinin paylaştığı istemci AI tercihi. */

import type { AIProviderType } from "./yula-config";
import { normalizeProvider } from "./yula-config";
import { normalizeEffort, type YulaEffort } from "./yula-reasoning";

export const YULA_AI_CONFIG_KEY = "yula_ai_config";

export interface YulaClientAiConfig {
  provider?: AIProviderType;
  model?: string;
  endpoint?: string;
  effort?: YulaEffort;
}

export function readYulaClientAiConfig(): YulaClientAiConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(YULA_AI_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Eski anahtar: MySettingsForm `thinkingLevel` yazıyordu — effort'a migrate edilir.
    const effortRaw = parsed.effort ?? parsed.thinkingLevel;
    return {
      provider: normalizeProvider(String(parsed.provider ?? "")),
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : undefined,
      effort: normalizeEffort(effortRaw ?? ""),
    };
  } catch {
    return {};
  }
}

/**
 * Oturumluk geçersiz kılma (örn. sohbet model seçici) için birleştirerek yazar.
 * Kalıcı ayar yazımı için DEĞİL — kalıcı kaynak DB'dir, aynalama için
 * `cacheYulaClientAiConfigFromDb` kullanılır.
 */
export function writeYulaClientAiConfig(patch: Partial<YulaClientAiConfig>) {
  if (typeof window === "undefined") return;
  try {
    let prev: Record<string, unknown> = {};
    const raw = localStorage.getItem(YULA_AI_CONFIG_KEY);
    if (raw) prev = JSON.parse(raw) as Record<string, unknown>;
    localStorage.setItem(YULA_AI_CONFIG_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    // storage unavailable
  }
}

/**
 * DB → önbellek senkronu (tek yön, replace — merge değil).
 *
 * `user_settings` tek doğruluk kaynağıdır; localStorage yalnızca sohbet
 * sıcak yolunun senkron okuduğu + offline'da yaşayan önbellektir. Form
 * localStorage'a doğrudan yazmaz; PUT/GET sonrası bu fonksiyonla aynalar.
 * Başarısız PUT/offline'da çağrılmaz — önbellekte son bilinen iyi değer kalır.
 * Bayat anahtar kalmasın diye içerik tamamen değiştirilir (undefined düşer).
 */
export function cacheYulaClientAiConfigFromDb(row: {
  aiProvider?: string | null;
  aiModel?: string | null;
  aiEndpoint?: string | null;
  thinkingLevel?: string | null;
}) {
  if (typeof window === "undefined") return;
  try {
    const snapshot: Record<string, string> = {};
    const provider = normalizeProvider(row.aiProvider ?? "");
    if (provider) snapshot.provider = provider;
    if (typeof row.aiModel === "string" && row.aiModel) snapshot.model = row.aiModel;
    if (typeof row.aiEndpoint === "string" && row.aiEndpoint) snapshot.endpoint = row.aiEndpoint;
    const effort = normalizeEffort(row.thinkingLevel ?? "");
    if (effort) snapshot.effort = effort;
    localStorage.setItem(YULA_AI_CONFIG_KEY, JSON.stringify(snapshot));
  } catch {
    // storage unavailable
  }
}

export function yulaModelsApiUrl(config: YulaClientAiConfig = readYulaClientAiConfig()): string {
  const params = new URLSearchParams();
  if (config.provider) params.set("provider", config.provider);
  if (config.endpoint) params.set("endpoint", config.endpoint);
  const q = params.toString();
  return q ? `/api/agent/models?${q}` : "/api/agent/models";
}
