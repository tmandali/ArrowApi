import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";
import {
  getActiveProvider,
  getDefaultModel,
  getDefaultEmbeddingModel,
  getAzureDeployments,
  getAgnesModels,
  getVectorDimension,
  DEFAULT_AGNES_BASE_URL,
  DEFAULT_OLLAMA_URL,
  type AIProviderType,
} from "./yula-config";

export interface ProviderModelCapability {
  name: string;
  model?: string;
  description?: string;
  size?: number;
  tag?: string;
  provider: AIProviderType;
  capabilities: {
    hasThinking: boolean;
    hasVision: boolean;
    hasTools: boolean;
    hasAudio?: boolean;
    hasEmbedding?: boolean;
    isMlx?: boolean;
    isCloud?: boolean;
  };
  hasThinking?: boolean;
}

export type YulaModelRequestOptions = {
  provider?: AIProviderType;
  baseUrl?: string;
};

let localChatInstance: ReturnType<typeof createOllama> | null = null;
let localChatBoundBase = "";
let cloudInstance: ReturnType<typeof createAzure> | ReturnType<typeof createOpenAI> | null =
  null;
let cloudBoundKey = "";
let agnesInstance: ReturnType<typeof createOpenAI> | null = null;
let agnesBoundKey = "";

function getOllamaProvider(baseUrl?: string) {
  const keepAlive = process.env.OLLAMA_KEEP_ALIVE ?? "30m";
  const numCtx = Number(process.env.YULA_NUM_CTX ?? 8192);
  const resolved = (baseUrl || process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(
    /\/+$/,
    "",
  );
  if (!localChatInstance || localChatBoundBase !== resolved) {
    localChatBoundBase = resolved;
    localChatInstance = createOllama({
      baseURL: `${resolved}/api`,
      fetch: async (input, init) => {
        try {
          if (typeof init?.body === "string") {
            const bodyObj = JSON.parse(init.body) as Record<string, unknown>;
            if (bodyObj.model) {
              if (bodyObj.keep_alive === undefined) bodyObj.keep_alive = keepAlive;
              const opts =
                bodyObj.options && typeof bodyObj.options === "object"
                  ? { ...(bodyObj.options as Record<string, unknown>) }
                  : {};
              if (opts.num_ctx === undefined) opts.num_ctx = numCtx;
              bodyObj.options = opts;
              init = { ...init, body: JSON.stringify(bodyObj) };
            }
          }
        } catch {
          // JSON değilse geç
        }
        const res = await fetch(input, init);
        if (!res.ok) {
          const errText = await res.clone().text();
          console.error(`🤖 [Local LLM API Error ${res.status}]:`, errText);
        }
        return res;
      },
    });
  }
  return localChatInstance;
}

/**
 * Agnes AI — OpenAI-uyumlu gateway (docs: agnes-ai cid1 + opencode cid7).
 * Base URL her zaman `/v1` ile biter (`/v1/chat/completions` yazılmaz);
 * auth `Authorization: Bearer <AGNES_API_KEY>` (Bearer öneki key'e eklenmez).
 * Ayrı `@ai-sdk/openai-compatible` paketi yerine mevcut `createOpenAI`
 * kullanılır — tel protokolü aynı (chat completions + tools + vision).
 */
function getAgnesProvider(baseUrl?: string): ReturnType<typeof createOpenAI> {
  const resolved = (
    baseUrl ||
    process.env.AGNES_BASE_URL ||
    DEFAULT_AGNES_BASE_URL
  ).replace(/\/+$/, "");
  const apiKey = process.env.AGNES_API_KEY ?? "";
  const key = `${resolved}:${apiKey.length > 0 ? "set" : "empty"}`;
  if (!agnesInstance || agnesBoundKey !== key) {
    agnesBoundKey = key;
    agnesInstance = createOpenAI({ baseURL: resolved, apiKey });
  }
  return agnesInstance;
}

function getCloudProvider(
  provider: AIProviderType,
  baseUrl?: string,
): ReturnType<typeof createAzure> | ReturnType<typeof createOpenAI> {
  const key = `${provider}:${baseUrl ?? ""}`;
  if (!cloudInstance || cloudBoundKey !== key) {
    cloudBoundKey = key;
    if (provider === "azure") {
      const endpoint = (
        baseUrl ||
        process.env.AZURE_OPENAI_ENDPOINT ||
        "https://tmandali-resource.openai.azure.com/openai/v1"
      ).replace(/\/+$/, "");
      cloudInstance = createAzure({
        baseURL: endpoint,
        apiKey: process.env.AZURE_OPENAI_API_KEY ?? process.env.AZURE_API_KEY ?? "",
      });
    } else {
      const apiKey = process.env.OPENAI_API_KEY ?? "";
      const resolved = (baseUrl || process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
      cloudInstance = createOpenAI({
        apiKey,
        ...(resolved ? { baseURL: resolved } : {}),
      });
    }
  }
  return cloudInstance;
}

/** Dil modeli — sohbet rotası yalnızca LanguageModel alır. */
export function getYulaLanguageModel(
  requestedModel?: string,
  options?: YulaModelRequestOptions,
) {
  const provider = options?.provider ?? getActiveProvider();
  const defaultModel = getDefaultModel(provider);
  const activeModel =
    requestedModel && requestedModel.length > 0 ? requestedModel : defaultModel;

  switch (provider) {
    case "azure":
    case "openai":
      return getCloudProvider(provider, options?.baseUrl)(activeModel);
    case "agnes":
      // Agnes: Chat Completions yolu kullanılır. SDK'nın varsayılan
      // Responses API'si (`provider(model)`) Agnes'in `reasoning` öğesi
      // şekliyle uyumsuzdur (HTTP 200'de bile parse hatası verir);
      // `.chat(model)` Chat Completions (`/v1/chat/completions`) kullanır.
      return getAgnesProvider(options?.baseUrl).chat(activeModel);
    case "ollama":
      return getOllamaProvider(options?.baseUrl)(activeModel);
    default: {
      const _never: never = provider;
      return _never;
    }
  }
}

/** Embedding modeli */
export function getYulaEmbeddingModel(
  requestedModel?: string,
  options?: YulaModelRequestOptions,
) {
  const provider = options?.provider ?? getActiveProvider();
  const defaultEmbedModel = getDefaultEmbeddingModel(provider);
  const activeModel =
    requestedModel && requestedModel.length > 0 ? requestedModel : defaultEmbedModel;

  switch (provider) {
    case "azure":
    case "openai":
      return getCloudProvider(provider, options?.baseUrl).textEmbeddingModel(activeModel);
    case "agnes":
      return getAgnesProvider(options?.baseUrl).textEmbeddingModel(activeModel);
    case "ollama":
      return getOllamaProvider(options?.baseUrl).embedding(activeModel);
    default: {
      const _never: never = provider;
      return _never;
    }
  }
}

/** Aktif sağlayıcı bilgilerini döndürür */
export function getYulaProviderInfo(provider: AIProviderType = getActiveProvider()) {
  return {
    provider,
    defaultModel: getDefaultModel(provider),
    defaultEmbeddingModel: getDefaultEmbeddingModel(provider),
    vectorDimension: getVectorDimension(provider),
    isCloud: provider === "azure" || provider === "openai" || provider === "agnes",
  };
}

let tagsCache: { base: string; names: string[]; at: number } | null = null;

/** Yerel Ollama üzerindeki modelleri listeler */
async function fetchOllamaModels(baseUrl?: string): Promise<string[]> {
  const resolved = (baseUrl || process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
  if (tagsCache && tagsCache.base === resolved && Date.now() - tagsCache.at < 60_000) {
    return tagsCache.names;
  }
  try {
    const res = await fetch(`${resolved}/api/tags`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    tagsCache = { base: resolved, names, at: Date.now() };
    return names;
  } catch {
    return [];
  }
}

/** Aktif sağlayıcıya göre kullanılabilir model listesini ve yeteneklerini döndürür */
export async function getAvailableProviderModels(options?: {
  provider?: AIProviderType;
  baseUrl?: string;
}): Promise<ProviderModelCapability[]> {
  const provider = options?.provider ?? getActiveProvider();

  if (provider === "azure") {
    const isReasoningModel = (name: string) => /gpt-5|o[13](-mini|-preview)?$/i.test(name);
    const models: ProviderModelCapability[] = getAzureDeployments().map((name, index) => {
      const hasThinking = isReasoningModel(name);
      return {
        name,
        model: name,
        description:
          index === 0
            ? `Azure Microsoft Foundry (${name})`
            : `Azure OpenAI (${name})`,
        provider: "azure",
        tag: index === 0 ? "Azure" : hasThinking ? "Azure Thinking" : "Azure Pro",
        capabilities: {
          hasThinking,
          hasVision: true,
          hasTools: true,
          isCloud: true,
        },
        hasThinking,
      };
    });

    // Tekrar edenleri temizle
    const uniqueMap = new Map<string, ProviderModelCapability>();
    models.forEach((m) => uniqueMap.set(m.name, m));
    return Array.from(uniqueMap.values());
  }

  if (provider === "openai") {
    const primaryModel = process.env.OPENAI_MODEL ?? "gpt-4o";
    const models: ProviderModelCapability[] = [
      {
        name: primaryModel,
        model: primaryModel,
        description: `OpenAI (${primaryModel})`,
        provider: "openai",
        tag: "OpenAI",
        capabilities: {
          hasThinking: primaryModel.includes("o1") || primaryModel.includes("o3"),
          hasVision: true,
          hasTools: true,
          isCloud: true,
        },
        hasThinking: primaryModel.includes("o1") || primaryModel.includes("o3"),
      },
      {
        name: "gpt-4o",
        model: "gpt-4o",
        description: "OpenAI GPT-4o Amiral Gemisi",
        provider: "openai",
        tag: "Pro",
        capabilities: {
          hasThinking: false,
          hasVision: true,
          hasTools: true,
          isCloud: true,
        },
        hasThinking: false,
      },
      {
        name: "gpt-4o-mini",
        model: "gpt-4o-mini",
        description: "OpenAI GPT-4o Mini",
        provider: "openai",
        tag: "Fast",
        capabilities: {
          hasThinking: false,
          hasVision: true,
          hasTools: true,
          isCloud: true,
        },
        hasThinking: false,
      },
      {
        name: "o3-mini",
        model: "o3-mini",
        description: "OpenAI o3-mini Reasoning",
        provider: "openai",
        tag: "Thinking",
        capabilities: {
          hasThinking: true,
          hasVision: false,
          hasTools: true,
          isCloud: true,
        },
        hasThinking: true,
      },
    ];
    const uniqueMap = new Map<string, ProviderModelCapability>();
    models.forEach((m) => uniqueMap.set(m.name, m));
    return Array.from(uniqueMap.values());
  }

  if (provider === "agnes") {
    // Agnes modelleri: tool-calling + vision + streaming destekler (cid7).
    // Liste sağlayıcı varsayılanı + bilinen modeller + AGNES_MODELS
    // ekstralarından beslenir (getAgnesModels).
    const models: ProviderModelCapability[] = getAgnesModels().map((name, index) => ({
      name,
      model: name,
      description: index === 0 ? `Agnes (${name})` : `Agnes ${name}`,
      provider: "agnes",
      tag: index === 0 ? "Agnes" : "Agnes Pro",
      capabilities: {
        hasThinking: true,
        hasVision: true,
        hasTools: true,
        isCloud: true,
      },
      hasThinking: true,
    }));
    const uniqueMap = new Map<string, ProviderModelCapability>();
    models.forEach((m) => uniqueMap.set(m.name, m));
    return Array.from(uniqueMap.values());
  }

  // Ollama
  const names = await fetchOllamaModels(options?.baseUrl);
  const defaultMod = getDefaultModel(provider);
  const effectiveNames = names.length > 0 ? names : [defaultMod];

  return effectiveNames.map((name) => {
    const lowerName = name.toLowerCase();
    const isMlx = lowerName.includes("mlx");
    const isEmbed =
      lowerName.includes("embed") ||
      lowerName.includes("bge") ||
      lowerName.includes("minilm") ||
      lowerName.includes("nomic") ||
      lowerName.includes("reranker");

    const isGemma4 = lowerName.includes("gemma4") || lowerName.includes("gemma-4");
    const hasThinking =
      !isEmbed &&
      (isGemma4 ||
        lowerName.includes("deepseek") ||
        lowerName.includes("r1") ||
        lowerName.includes("think") ||
        lowerName.includes("reason") ||
        lowerName.includes("qwen") ||
        lowerName.includes("llama"));

    const hasVision =
      !isEmbed &&
      !isMlx &&
      (lowerName.includes("vision") ||
        lowerName.includes("llava") ||
        lowerName.includes("bakllava") ||
        lowerName.includes("moondream") ||
        lowerName.includes("minicpm-v"));

    const hasTools =
      !isEmbed &&
      (isGemma4 ||
        lowerName.includes("qwen") ||
        lowerName.includes("llama") ||
        lowerName.includes("mistral") ||
        lowerName.includes("agent"));

    return {
      name,
      model: name,
      provider: "ollama",
      tag: isMlx ? "MLX" : hasThinking ? "Thinking" : "Yerel",
      capabilities: {
        hasThinking,
        hasVision,
        hasTools,
        hasEmbedding: isEmbed,
        isMlx,
        isCloud: false,
      },
      hasThinking,
    };
  });
}
