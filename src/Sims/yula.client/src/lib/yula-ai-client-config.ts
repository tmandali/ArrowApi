/** Ayarlar ekranı ile sohbet API'sinin paylaştığı istemci AI tercihi. */

import type { AIProviderType } from "./yula-config";
import { normalizeProvider } from "./yula-config";

export const YULA_AI_CONFIG_KEY = "yula_ai_config";

export interface YulaClientAiConfig {
  provider?: AIProviderType;
  model?: string;
  endpoint?: string;
}

export function readYulaClientAiConfig(): YulaClientAiConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(YULA_AI_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      provider: normalizeProvider(String(parsed.provider ?? "")),
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : undefined,
    };
  } catch {
    return {};
  }
}

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

export function yulaModelsApiUrl(config: YulaClientAiConfig = readYulaClientAiConfig()): string {
  const params = new URLSearchParams();
  if (config.provider) params.set("provider", config.provider);
  if (config.endpoint) params.set("endpoint", config.endpoint);
  const q = params.toString();
  return q ? `/api/agent/models?${q}` : "/api/agent/models";
}
