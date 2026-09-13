import { normalizeEffort } from "@/lib/yula-reasoning";
import {
  CONFIG_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  type AiProviderConfig,
  type ProfileLanguage,
  type ProfileTimeZone,
  type SettingsApiRow,
} from "./settings-types";

export const SETTINGS_USER_ID = "local";
export const SETTINGS_API_URL = `/api/my/settings?userId=${SETTINGS_USER_ID}`;

export type SettingsSnapshot = {
  email: string;
  fullName: string;
  language: ProfileLanguage;
  timeZone: ProfileTimeZone;
  aiProvider: AiProviderConfig["provider"];
  aiModel: string;
  aiEndpoint: string;
  thinkingLevel: NonNullable<AiProviderConfig["thinkingLevel"]>;
  systemFacts: Record<string, string>;
};

/**
 * Önbellek okuması — formun anlık ilk değeri için. Doğruluk kaynağı DB'dir
 * (`GET /api/my/settings`); form localStorage'a doğrudan yazmaz, PUT/GET
 * sonrası `cacheYulaClientAiConfigFromDb` aynalar.
 */
export function loadStoredAiConfig(): AiProviderConfig {
  const defaults: AiProviderConfig = { ...DEFAULT_AI_CONFIG };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = { ...defaults, ...JSON.parse(raw) } as AiProviderConfig & {
        effort?: unknown;
      };
      if (String(parsed.provider) === "foundry") parsed.provider = "azure";
      // Eski `effort` anahtarı `thinkingLevel`'e migrate edilir (değerler birebir).
      const migrated = normalizeEffort(parsed.effort ?? parsed.thinkingLevel ?? "");
      return {
        ...parsed,
        apiKey: "",
        thinkingLevel: migrated ?? parsed.thinkingLevel ?? "low",
      };
    }
  } catch {
    // fallback
  }
  return defaults;
}

/** API'ye tam snapshot yazar; sunucunun döndüğü satırı verir (önbellek senkronu için).
 * Offline/hatada null döner — çağrıcı önbelleğe dokunmaz (son iyi değer kalır). */
export async function putSettingsToApi(
  snapshot: SettingsSnapshot
): Promise<SettingsApiRow | null> {
  // Kişisel tercihler (AI config, dil, tz, systemFacts) → user_settings
  try {
    const res = await fetch("/api/my/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: SETTINGS_USER_ID,
        language: snapshot.language,
        timeZone: snapshot.timeZone,
        aiProvider: snapshot.aiProvider,
        aiModel: snapshot.aiModel,
        aiEndpoint: snapshot.aiEndpoint,
        thinkingLevel: snapshot.thinkingLevel,
        systemFacts: snapshot.systemFacts,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { settings?: SettingsApiRow | null };
      return data?.settings ?? null;
    }
    return null;
  } catch {
    // offline (Tauri) veya backend kapalı — önbellek aynalanmaz
    return null;
  }
}
