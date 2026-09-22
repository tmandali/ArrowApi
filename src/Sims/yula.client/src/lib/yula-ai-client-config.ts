import * as React from "react";
import type { AIProviderType } from "./yula-config";
import { normalizeProvider, isEndpointCompatible } from "./yula-config";
import { normalizeEffort, type YulaEffort } from "./yula-reasoning";

export const YULA_AI_CONFIG_KEY = "yula_ai_config";
export const YULA_AI_PROFILE_KEY = "yula_ai_profile_defaults";
export const PROVIDER_ENDPOINTS_KEY = "yula_provider_endpoints";

export function getSavedEndpointForProvider(prov: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROVIDER_ENDPOINTS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[prov] || null;
  } catch {
    return null;
  }
}

export function saveEndpointForProvider(prov: string, url: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PROVIDER_ENDPOINTS_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, string>;
    map[prov] = url;
    localStorage.setItem(PROVIDER_ENDPOINTS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export interface YulaClientAiConfig {
  provider?: AIProviderType;
  model?: string;
  endpoint?: string;
  effort?: YulaEffort;
  thinking?: boolean;
}

export function readYulaProfileAiConfig(): YulaClientAiConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(YULA_AI_PROFILE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const effortRaw = parsed.effort ?? parsed.thinkingLevel;
    const thinkingRaw = typeof parsed.thinking === "boolean" ? parsed.thinking : undefined;
    return {
      provider: normalizeProvider(String(parsed.provider ?? "")),
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : undefined,
      effort: normalizeEffort(effortRaw ?? ""),
      thinking: thinkingRaw,
    };
  } catch {
    return {};
  }
}

export function readYulaClientAiConfig(): YulaClientAiConfig {
  if (typeof window === "undefined") return {};
  try {
    const profile = readYulaProfileAiConfig();
    const raw = localStorage.getItem(YULA_AI_CONFIG_KEY);
    if (!raw) return profile;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const effortRaw = parsed.effort ?? parsed.thinkingLevel;
    const clientProvider = normalizeProvider(String(parsed.provider ?? ""));
    const activeProvider = clientProvider ?? profile.provider;
    const clientModel = typeof parsed.model === "string" && parsed.model ? parsed.model : undefined;
    let clientEndpoint = typeof parsed.endpoint === "string" && parsed.endpoint ? parsed.endpoint : undefined;
    const clientEffort = normalizeEffort(effortRaw ?? "");
    const clientThinking = typeof parsed.thinking === "boolean" ? parsed.thinking : undefined;

    if (activeProvider) {
      const savedForProv = getSavedEndpointForProvider(activeProvider);
      if (savedForProv) {
        clientEndpoint = savedForProv;
      } else if (clientEndpoint && !isEndpointCompatible(clientEndpoint, activeProvider)) {
        clientEndpoint = undefined;
      }
    }

    return {
      provider: activeProvider,
      model: clientModel ?? profile.model,
      endpoint: clientEndpoint ?? (profile.endpoint && isEndpointCompatible(profile.endpoint, activeProvider || "") ? profile.endpoint : undefined),
      effort: clientEffort || profile.effort,
      thinking: clientThinking !== undefined ? clientThinking : profile.thinking,
    };
  } catch {
    return {};
  }
}

/**
 * Oturumluk geçersiz kılma (örn. sohbet model seçici) için birleştirerek yazar.
 * Ekranda yapılan seçimler burada saklanır ve profildeki varsayılanların üzerine geçer.
 */
export function writeYulaClientAiConfig(patch: Partial<YulaClientAiConfig>) {
  if (typeof window === "undefined") return;
  try {
    let prev: Record<string, unknown> = {};
    const raw = localStorage.getItem(YULA_AI_CONFIG_KEY);
    if (raw) prev = JSON.parse(raw) as Record<string, unknown>;

    const prevProvider = normalizeProvider(String(prev.provider ?? ""));
    const newProvider = patch.provider !== undefined ? normalizeProvider(patch.provider) : prevProvider;
    const providerChanged = Boolean(newProvider && prevProvider && newProvider !== prevProvider);

    const merged = { ...prev, ...patch };

    if (newProvider) {
      if (patch.endpoint !== undefined) {
        merged.endpoint = patch.endpoint;
        if (patch.endpoint) {
          saveEndpointForProvider(newProvider, patch.endpoint);
        }
      } else if (providerChanged) {
        // Sağlayıcı değiştiğinde önceki sağlayıcının uç noktasını miras alma!
        const saved = getSavedEndpointForProvider(newProvider);
        merged.endpoint = saved || undefined;
      } else if (merged.endpoint && !isEndpointCompatible(String(merged.endpoint), newProvider)) {
        const saved = getSavedEndpointForProvider(newProvider);
        merged.endpoint = saved || undefined;
      }
    }

    localStorage.setItem(YULA_AI_CONFIG_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("yula-ai-config-changed", { detail: merged }));
  } catch {
    // storage unavailable
  }
}

/**
 * Reaktif AI istemci tercihi hook'u (sağlayıcı, model, uç nokta).
 */
export function useYulaAiConfig(): YulaClientAiConfig {
  const [config, setConfig] = React.useState<YulaClientAiConfig>(() =>
    typeof window === "undefined" ? {} : readYulaClientAiConfig(),
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUpdate = () => {
      setConfig(readYulaClientAiConfig());
    };
    window.addEventListener("yula-ai-config-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("yula-ai-config-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return config;
}

/**
 * DB → profil varsayılanları senkronu.
 *
 * Profildeki ayarlar YALNIZCA varsayılan (fallback) olarak çalışır.
 * Ekrandaki aktif kullanıcı seçimlerini ezmez; yalnızca aktif seçim
 * bulunmadığında devreye girer.
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

    // 1. Profil varsayılanını sakla
    localStorage.setItem(YULA_AI_PROFILE_KEY, JSON.stringify(snapshot));

    // 2. Eğer ekranda henüz aktif bir model seçimi yoksa, profille başlat
    const currentActiveRaw = localStorage.getItem(YULA_AI_CONFIG_KEY);
    if (!currentActiveRaw) {
      localStorage.setItem(YULA_AI_CONFIG_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // storage unavailable
  }
}

export function yulaModelsApiUrl(config: YulaClientAiConfig = readYulaClientAiConfig()): string {
  const params = new URLSearchParams();
  if (config.provider) params.set("provider", config.provider);
  if (config.endpoint && isEndpointCompatible(config.endpoint, config.provider || "")) {
    params.set("endpoint", config.endpoint);
  }
  const q = params.toString();
  return q ? `/api/agent/models?${q}` : "/api/agent/models";
}

export interface YulaModelApiResponse {
  provider?: AIProviderType;
  defaultModel?: string;
  availableProviders?: Array<{ id: AIProviderType; label: string }>;
  models?: Array<{
    name: string;
    capabilities?: {
      hasThinking?: boolean;
      hasVision?: boolean;
      hasTools?: boolean;
      hasAudio?: boolean;
      hasEmbedding?: boolean;
      isMlx?: boolean;
    };
    isConfigured?: boolean;
  }>;
  allModels?: Array<{
    id: string;
    name: string;
    provider: string;
    providerLabel?: string;
    hasThinking?: boolean;
    isConfigured?: boolean;
  }>;
}

const YULA_MODELS_CACHE_STORAGE_KEY = "yula_models_cache_v1";

const modelsCache = new Map<string, { data: YulaModelApiResponse; expiresAt: number }>();
const pendingFetches = new Map<string, Promise<YulaModelApiResponse | null>>();

let latestAllModels: Array<{
  id: string;
  name: string;
  provider: string;
  providerLabel?: string;
  hasThinking?: boolean;
  isConfigured?: boolean;
}> = [];

function deduplicateAllModels<T extends { id?: string; name?: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((m) => {
    const key = (m.id || m.name || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadModelsFromStorage(url: string): YulaModelApiResponse | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(YULA_MODELS_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: string; data?: YulaModelApiResponse };
    if (parsed.data && (!parsed.url || parsed.url === url)) {
      if (Array.isArray(parsed.data.allModels)) {
        parsed.data.allModels = deduplicateAllModels(parsed.data.allModels);
      }
      return parsed.data;
    }
  } catch {}
  return null;
}

function saveModelsToStorage(url: string, data: YulaModelApiResponse): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(
      YULA_MODELS_CACHE_STORAGE_KEY,
      JSON.stringify({ url, data, at: Date.now() }),
    );
  } catch {}
}

export function getCachedAllModels() {
  if (latestAllModels.length === 0 && typeof window !== "undefined") {
    const fromStorage = loadModelsFromStorage("");
    if (Array.isArray(fromStorage?.allModels) && fromStorage.allModels.length > 0) {
      latestAllModels = deduplicateAllModels(fromStorage.allModels);
    }
  }
  return latestAllModels;
}

const LOGGED_OUT_PROVIDERS_KEY = "yula_logged_out_providers_v1";

export function getLoggedOutProviders(): Set<string> {
  if (typeof window === "undefined" || !window.localStorage) return new Set();
  try {
    const raw = localStorage.getItem(LOGGED_OUT_PROVIDERS_KEY);
    return raw ? new Set((JSON.parse(raw) as string[]).map((s) => s.toLowerCase())) : new Set();
  } catch { return new Set(); }
}

export function markProviderLoggedOut(provider: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const current = getLoggedOutProviders();
    current.add(provider.toLowerCase());
    localStorage.setItem(LOGGED_OUT_PROVIDERS_KEY, JSON.stringify(Array.from(current)));
    deleteClientSecretForProvider(provider);
    window.dispatchEvent(new CustomEvent("yula-ai-config-changed"));
  } catch {}
}

export function unmarkProviderLoggedOut(provider: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const current = getLoggedOutProviders();
    current.delete(provider.toLowerCase());
    localStorage.setItem(LOGGED_OUT_PROVIDERS_KEY, JSON.stringify(Array.from(current)));
    window.dispatchEvent(new CustomEvent("yula-ai-config-changed"));
  } catch {}
}

export function getClientSecretForProvider(provider: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(`yula_ai_key_${provider.toLowerCase()}`) || sessionStorage.getItem("yula_ai_api_key");
  } catch { return null; }
}

export function saveClientSecretForProvider(provider: string, key: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    if (trimmed) {
      sessionStorage.setItem(`yula_ai_key_${provider.toLowerCase()}`, trimmed);
      sessionStorage.setItem("yula_ai_api_key", trimmed);
      unmarkProviderLoggedOut(provider);
    } else {
      deleteClientSecretForProvider(provider);
    }
  } catch {}
}

export function deleteClientSecretForProvider(provider: string): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(`yula_ai_key_${provider.toLowerCase()}`); } catch {}
}

export function isProviderLoggedIn(providerId: string): boolean {
  const norm = (providerId || "").toLowerCase();
  if (!norm) return false;
  if (getLoggedOutProviders().has(norm)) return false;
  if (getClientSecretForProvider(norm)) return true;
  return getCachedAvailableProviders().some((p) => p.id.toLowerCase() === norm);
}

let latestAvailableProviders: Array<{ id: string; label: string }> = [];

export function getCachedAvailableProviders(): Array<{ id: string; label: string }> {
  if (latestAvailableProviders.length === 0 && typeof window !== "undefined") {
    const fromStorage = loadModelsFromStorage("");
    if (Array.isArray(fromStorage?.availableProviders) && fromStorage.availableProviders.length > 0) {
      latestAvailableProviders = fromStorage.availableProviders as Array<{ id: string; label: string }>;
    }
  }
  const loggedOut = getLoggedOutProviders();
  return latestAvailableProviders.filter((p) => !loggedOut.has(p.id.toLowerCase()));
}

export function setCachedAvailableProviders(providers: Array<{ id: string; label: string }>): void {
  latestAvailableProviders = providers;
}

export function setCachedAllModels(
  models: Array<{
    id: string;
    name: string;
    provider: string;
    providerLabel?: string;
    hasThinking?: boolean;
  }>
) {
  latestAllModels = models;
}

/**
 * Model listesini 2-kademeli (bellek içi + localStorage) önbellekleme ile getirir.
 * forceRefresh true verilirse sağlayıcılardan canlı çekim tetiklenir ve önbellek tazelenir.
 */
export async function fetchCachedYulaModels(
  config?: YulaClientAiConfig,
  forceRefresh = false,
): Promise<YulaModelApiResponse | null> {
  const baseUrl = yulaModelsApiUrl(config);
  const fetchUrl = forceRefresh
    ? baseUrl.includes("?")
      ? `${baseUrl}&refresh=true`
      : `${baseUrl}?refresh=true`
    : baseUrl;

  if (!forceRefresh) {
    const cached = modelsCache.get(baseUrl);
    if (cached && cached.data) {
      return cached.data;
    }

    const stored = loadModelsFromStorage(baseUrl);
    if (stored) {
      modelsCache.set(baseUrl, { data: stored, expiresAt: Infinity });
      if (Array.isArray(stored.allModels) && stored.allModels.length > 0) {
        latestAllModels = stored.allModels;
      }
      if (Array.isArray(stored.availableProviders) && stored.availableProviders.length > 0) {
        latestAvailableProviders = stored.availableProviders as Array<{ id: string; label: string }>;
      }
      return stored;
    }
  }

  const pending = pendingFetches.get(fetchUrl);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) return null;
      const data = (await res.json()) as YulaModelApiResponse;
      modelsCache.set(baseUrl, { data, expiresAt: Infinity });
      saveModelsToStorage(baseUrl, data);

      if (Array.isArray(data.allModels) && data.allModels.length > 0) {
        data.allModels = deduplicateAllModels(data.allModels);
        latestAllModels = data.allModels;
      }
      if (Array.isArray(data.availableProviders) && data.availableProviders.length > 0) {
        latestAvailableProviders = data.availableProviders as Array<{ id: string; label: string }>;
      }
      return data;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(fetchUrl);
    }
  })();

  pendingFetches.set(fetchUrl, promise);
  return promise;
}

export function invalidateYulaModelsCache() {
  modelsCache.clear();
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.removeItem(YULA_MODELS_CACHE_STORAGE_KEY);
    } catch {}
  }
}

