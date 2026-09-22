import {
  DEFAULT_AGNES_BASE_URL,
  DEFAULT_OLLAMA_URL,
  getConfiguredModels,
  getAzureDeployments,
  getAgnesModels,
  getDefaultModel,
  type AIProviderType,
} from "./yula-config";
import { getAuthKeyForProvider, resolveModelsConfig } from "./yula-models-auth";
import type { ProviderModelCapability } from "./yula-provider";

export interface ModelCapabilities {
  hasThinking: boolean;
  hasVision: boolean;
  hasTools: boolean;
  hasAudio?: boolean;
  hasEmbedding?: boolean;
  isMlx?: boolean;
  isCloud?: boolean;
}

/** Model yeteneklerini isme ve sağlayıcıya göre sınıflandırır */
export function classifyModelCapabilities(
  name: string,
  provider: string,
): { capabilities: ModelCapabilities; tag: string; hasThinking: boolean } {
  const lower = name.toLowerCase();
  const isCloud = provider !== "ollama";
  const isMlx = lower.includes("mlx");
  const isEmbed =
    lower.includes("embed") ||
    lower.includes("bge") ||
    lower.includes("minilm") ||
    lower.includes("nomic") ||
    lower.includes("reranker");

  const isGemma4 = lower.includes("gemma4") || lower.includes("gemma-4");
  const isReasoning =
    !isEmbed &&
    (isGemma4 ||
      lower.includes("deepseek") ||
      lower.includes("r1") ||
      lower.includes("think") ||
      lower.includes("reason") ||
      lower.includes("qwen") ||
      lower.includes("gpt-5") ||
      /o[13](-mini|-preview)?$/i.test(name));

  const hasVision =
    !isEmbed &&
    !isMlx &&
    (lower.includes("vision") ||
      lower.includes("llava") ||
      lower.includes("bakllava") ||
      lower.includes("moondream") ||
      lower.includes("minicpm-v") ||
      lower.includes("gpt-4o") ||
      lower.includes("gpt-5"));

  const hasTools =
    !isEmbed &&
    (isGemma4 ||
      lower.includes("qwen") ||
      lower.includes("llama") ||
      lower.includes("mistral") ||
      lower.includes("agent") ||
      lower.includes("gpt-") ||
      lower.includes("o3"));

  const tag = isMlx
    ? "MLX"
    : isReasoning
      ? "Thinking"
      : isCloud
        ? "Cloud"
        : "Yerel";

  return {
    capabilities: {
      hasThinking: isReasoning,
      hasVision,
      hasTools,
      hasEmbedding: isEmbed,
      isMlx,
      isCloud,
    },
    tag,
    hasThinking: isReasoning,
  };
}

interface ServerCacheEntry {
  models: ProviderModelCapability[];
  fetchedAt: number;
}

const serverProviderModelsCache = new Map<string, ServerCacheEntry>();
const serverInFlightFetches = new Map<string, Promise<ProviderModelCapability[]>>();

export function clearServerProviderModelsCache(): void {
  serverProviderModelsCache.clear();
  serverInFlightFetches.clear();
}

/**
 * Sağlayıcının canlı API uç noktasını sorgular.
 * Başarılı olursa bellek içi önbelleğe alır ve sonraki çağrılarda ağ trafiği üretmez.
 * Ulaşılamazsa models.json veya varsayılan katalog modellerine düşer.
 */
export async function fetchLiveProviderModels(options: {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  forceRefresh?: boolean;
}): Promise<ProviderModelCapability[]> {
  const { provider, forceRefresh } = options;
  const baseUrl = options.baseUrl?.replace(/\/+$/, "");
  const cacheKey = `${provider}:${baseUrl ?? "default"}`;

  if (!forceRefresh) {
    const cached = serverProviderModelsCache.get(cacheKey);
    if (cached && cached.models.length > 0) {
      return cached.models;
    }

    const inFlight = serverInFlightFetches.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const fetchPromise = (async () => {
    let fetched: ProviderModelCapability[] = [];

    try {
      if (provider === "ollama") {
        fetched = await fetchOllamaLive(baseUrl);
      } else if (provider === "azure") {
        fetched = await fetchAzureLive(baseUrl, options.apiKey);
      } else if (provider === "openai" || provider === "agnes") {
        fetched = await fetchOpenAiCompatibleLive(provider, baseUrl, options.apiKey);
      } else {
        // models.json içinde kayıtlı harici sağlayıcı (openrouter, nvidia vb.)
        fetched = await fetchOpenAiCompatibleLive(provider, baseUrl, options.apiKey);
      }
    } catch {
      // Ağ hatası durumunda sessizce fallback'e geç
      fetched = [];
    }

    // Canlı uçtan model alınamadıysa fallback katalogundan doldur
    if (fetched.length === 0) {
      fetched = getFallbackModelsForProvider(provider, baseUrl);
    }

    const mConfig = resolveModelsConfig();
    const configuredModels = mConfig?.providers?.[provider]?.models || [];
    const configuredIds = new Set(configuredModels.map((m) => m.id.toLowerCase()));

    // models.json içinde tanımlı olan modelleri işaretle
    for (const item of fetched) {
      const id = (item.model || item.name).toLowerCase();
      if (configuredIds.has(id)) {
        item.isConfigured = true;
      }
    }

    // models.json içinde elle tanımlanmış ama canlı uçtan dönmemiş modelleri ekle
    for (const cm of configuredModels) {
      if (!fetched.some((m) => (m.model || m.name).toLowerCase() === cm.id.toLowerCase())) {
        const { capabilities, tag } = classifyModelCapabilities(cm.id, provider);
        fetched.push({
          name: cm.name || cm.id,
          model: cm.id,
          description: cm.name ? `${mConfig?.providers?.[provider]?.name || provider} (${cm.name})` : cm.id,
          provider: provider as AIProviderType,
          tag: cm.reasoning ? "Thinking" : tag,
          capabilities: {
            ...capabilities,
            hasThinking: Boolean(cm.reasoning),
          },
          hasThinking: Boolean(cm.reasoning),
          isConfigured: true,
        });
      }
    }

    // Tekil model garantisi (aynı sağlayıcı uç noktasından dönebilecek duplikasyonları önle)
    const seen = new Set<string>();
    const deduplicated: ProviderModelCapability[] = [];
    for (const item of fetched) {
      const key = (item.model || item.name).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }

    if (deduplicated.length > 0) {
      serverProviderModelsCache.set(cacheKey, {
        models: deduplicated,
        fetchedAt: Date.now(),
      });
    }

    return deduplicated;
  })().finally(() => {
    serverInFlightFetches.delete(cacheKey);
  });

  if (!forceRefresh) {
    serverInFlightFetches.set(cacheKey, fetchPromise);
  }

  return fetchPromise;
}

async function fetchOllamaLive(baseUrl?: string): Promise<ProviderModelCapability[]> {
  const target = (baseUrl || process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
  const res = await fetch(`${target}/api/tags`, {
    signal: AbortSignal.timeout(3000),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { models?: Array<{ name: string; size?: number }> };
  const rawList = Array.isArray(data?.models) ? data.models : [];

  return rawList.map((item) => {
    const name = item.name;
    const { capabilities, tag, hasThinking } = classifyModelCapabilities(name, "ollama");
    return {
      name,
      model: name,
      description: `Ollama (${name})`,
      provider: "ollama" as AIProviderType,
      size: item.size,
      tag,
      capabilities,
      hasThinking,
    };
  });
}

async function fetchAzureLive(
  baseUrl?: string,
  apiKey?: string,
): Promise<ProviderModelCapability[]> {
  const mConfig = resolveModelsConfig();
  const endpoint = (
    baseUrl ||
    process.env.AZURE_OPENAI_ENDPOINT ||
    mConfig?.providers?.azure?.baseUrl ||
    ""
  ).replace(/\/+$/, "");

  const key =
    apiKey ||
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.AZURE_API_KEY ||
    getAuthKeyForProvider("azure") ||
    "";

  if (!endpoint || !key) return [];

  // 1. Azure OpenAI deployments API'sini dene
  const depUrl = `${endpoint}/openai/deployments?api-version=2023-03-15-preview`;
  const res = await fetch(depUrl, {
    headers: { "api-key": key },
    signal: AbortSignal.timeout(3500),
    cache: "no-store",
  });

  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: Array<{ id: string; model?: string }>;
  };

  const list = Array.isArray(json?.data) ? json.data : [];
  return list.map((item) => {
    const name = item.id;
    const { capabilities, tag, hasThinking } = classifyModelCapabilities(name, "azure");
    return {
      name,
      model: name,
      description: item.model ? `Azure (${name} - ${item.model})` : `Azure (${name})`,
      provider: "azure" as AIProviderType,
      tag,
      capabilities,
      hasThinking,
    };
  });
}

async function fetchOpenAiCompatibleLive(
  provider: string,
  baseUrl?: string,
  apiKey?: string,
): Promise<ProviderModelCapability[]> {
  const mConfig = resolveModelsConfig();
  const pConfig = mConfig?.providers?.[provider];

  let endpoint = (
    baseUrl ||
    pConfig?.baseUrl ||
    (provider === "openai" ? "https://api.openai.com/v1" : "") ||
    (provider === "agnes" ? DEFAULT_AGNES_BASE_URL : "")
  ).replace(/\/+$/, "");

  const key =
    apiKey ||
    (provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "agnes"
        ? process.env.AGNES_API_KEY
        : "") ||
    getAuthKeyForProvider(provider) ||
    "";

  if (!endpoint) return [];

  if (!endpoint.endsWith("/v1") && !endpoint.includes("/v1/")) {
    endpoint = `${endpoint}/v1`;
  }

  const modelsUrl = `${endpoint}/models`;
  const headers: Record<string, string> = {};
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const res = await fetch(modelsUrl, {
    headers,
    signal: AbortSignal.timeout(3500),
    cache: "no-store",
  });

  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: Array<{ id: string }>;
  };

  const list = Array.isArray(json?.data) ? json.data : [];
  const nonChatFilter = /whisper|dall-e|tts|embedding|bge|moderation|curie|davinci|babbage/i;

  const valid = list.filter((m) => !nonChatFilter.test(m.id));

  return valid.map((item) => {
    const name = item.id;
    const { capabilities, tag, hasThinking } = classifyModelCapabilities(name, provider);
    return {
      name,
      model: name,
      description: `${pConfig?.name || provider} (${name})`,
      provider: provider as AIProviderType,
      tag,
      capabilities,
      hasThinking,
    };
  });
}

function getFallbackModelsForProvider(
  provider: string,
  _baseUrl?: string,
): ProviderModelCapability[] {
  const mConfig = resolveModelsConfig();
  const pConfig = mConfig?.providers?.[provider];

  if (pConfig && Array.isArray(pConfig.models) && pConfig.models.length > 0) {
    return pConfig.models.map((m) => {
      const { capabilities, tag } = classifyModelCapabilities(m.id, provider);
      return {
        name: m.name || m.id,
        model: m.id,
        description: m.name ? `${pConfig.name || provider} (${m.name})` : m.id,
        provider: provider as AIProviderType,
        tag: m.reasoning ? "Thinking" : tag,
        capabilities: {
          ...capabilities,
          hasThinking: Boolean(m.reasoning),
        },
        hasThinking: Boolean(m.reasoning),
      };
    });
  }

  if (provider === "azure") {
    return getAzureDeployments().map((name) => {
      const { capabilities, tag, hasThinking } = classifyModelCapabilities(name, "azure");
      return {
        name,
        model: name,
        description: `Azure (${name})`,
        provider: "azure",
        tag,
        capabilities,
        hasThinking,
      };
    });
  }

  if (provider === "openai") {
    return getConfiguredModels("openai").map((name) => {
      const { capabilities, tag, hasThinking } = classifyModelCapabilities(name, "openai");
      return {
        name,
        model: name,
        description: `OpenAI (${name})`,
        provider: "openai",
        tag,
        capabilities,
        hasThinking,
      };
    });
  }

  if (provider === "agnes") {
    return getAgnesModels().map((name) => {
      const { capabilities, tag, hasThinking } = classifyModelCapabilities(name, "agnes");
      return {
        name,
        model: name,
        description: `Agnes (${name})`,
        provider: "agnes",
        tag,
        capabilities,
        hasThinking,
      };
    });
  }

  return [getDefaultModel(provider as AIProviderType)].map((name) => {
    const { capabilities, tag, hasThinking } = classifyModelCapabilities(name, provider);
    return {
      name,
      model: name,
      description: name,
      provider: provider as AIProviderType,
      tag,
      capabilities,
      hasThinking,
    };
  });
}
