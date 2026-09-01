import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel, EmbeddingModel } from "ai";
import {
  getActiveProvider,
  getDefaultModel,
  getDefaultEmbeddingModel,
  getVectorDimension,
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

let ollamaInstance: ReturnType<typeof createOllama> | null = null;
let openaiInstance: ReturnType<typeof createOpenAI> | null = null;

function getOllamaProvider() {
  if (!ollamaInstance) {
    const keepAlive = process.env.OLLAMA_KEEP_ALIVE ?? "30m";
    const baseUrl = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
    ollamaInstance = createOllama({
      baseURL: `${baseUrl.replace(/\/+$/, "")}/api`,
      fetch: async (input, init) => {
        let bodyObj: Record<string, unknown> | null = null;
        try {
          if (typeof init?.body === "string") {
            bodyObj = JSON.parse(init.body) as Record<string, unknown>;
            if (bodyObj.model && bodyObj.keep_alive === undefined) {
              bodyObj.keep_alive = keepAlive;
              init = { ...init, body: JSON.stringify(bodyObj) };
            }
          }
        } catch {
          // JSON değilse geç
        }
        const res = await fetch(input, init);
        if (!res.ok) {
          const errText = await res.clone().text();
          console.error(`🤖 [Ollama API Error ${res.status}]:`, errText);
        }
        return res;
      },
    });
  }
  return ollamaInstance;
}

function getAzureOrOpenAIProvider() {
  if (!openaiInstance) {
    const provider = getActiveProvider();
    if (provider === "azure") {
      const endpoint =
        process.env.AZURE_OPENAI_ENDPOINT ??
        "https://tmandali-resource.openai.azure.com/openai/v1";
      const apiKey = process.env.AZURE_OPENAI_API_KEY ?? "";
      openaiInstance = createOpenAI({
        baseURL: endpoint.replace(/\/+$/, ""),
        apiKey,
      });
    } else {
      const apiKey = process.env.OPENAI_API_KEY ?? "";
      const baseURL = process.env.OPENAI_BASE_URL;
      openaiInstance = createOpenAI({
        apiKey,
        ...(baseURL ? { baseURL: baseURL.replace(/\/+$/, "") } : {}),
      });
    }
  }
  return openaiInstance;
}

/** Aktif sağlayıcıya göre Dil Modelini (LLM) döndürür */
export function getYulaLanguageModel(requestedModel?: string) {
  const provider = getActiveProvider();
  const defaultModel = getDefaultModel();
  const activeModel = requestedModel && requestedModel.trim().length > 0 ? requestedModel : defaultModel;

  if (provider === "azure" || provider === "openai") {
    const openai = getAzureOrOpenAIProvider();
    return openai(activeModel);
  }

  const ollama = getOllamaProvider();
  return ollama(activeModel);
}

/** Aktif sağlayıcıya göre Embedding Modelini döndürür */
export function getYulaEmbeddingModel(requestedModel?: string) {
  const provider = getActiveProvider();
  const defaultEmbedModel = getDefaultEmbeddingModel();
  const activeModel = requestedModel && requestedModel.trim().length > 0 ? requestedModel : defaultEmbedModel;

  if (provider === "azure" || provider === "openai") {
    const openai = getAzureOrOpenAIProvider();
    return openai.textEmbeddingModel(activeModel);
  }

  const ollama = getOllamaProvider();
  return ollama.embedding(activeModel);
}

/** Aktif sağlayıcı bilgilerini döndürür */
export function getYulaProviderInfo() {
  const provider = getActiveProvider();
  return {
    provider,
    defaultModel: getDefaultModel(),
    defaultEmbeddingModel: getDefaultEmbeddingModel(),
    vectorDimension: getVectorDimension(),
    isCloud: provider === "azure" || provider === "openai",
  };
}

let tagsCache: { names: string[]; at: number } | null = null;

/** Yerel Ollama üzerindeki modelleri listeler */
async function fetchOllamaModels(): Promise<string[]> {
  if (tagsCache && Date.now() - tagsCache.at < 60_000) return tagsCache.names;
  try {
    const baseUrl = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    tagsCache = { names, at: Date.now() };
    return names;
  } catch {
    return [];
  }
}

/** Aktif sağlayıcıya göre kullanılabilir model listesini ve yeteneklerini döndürür */
export async function getAvailableProviderModels(): Promise<ProviderModelCapability[]> {
  const provider = getActiveProvider();

  if (provider === "azure") {
    const primaryModel = process.env.AZURE_OPENAI_MODEL ?? "gpt-5.4";
    const models: ProviderModelCapability[] = [
      {
        name: primaryModel,
        model: primaryModel,
        description: `Azure Microsoft Foundry (${primaryModel})`,
        provider: "azure",
        tag: "Azure",
        capabilities: {
          hasThinking: true,
          hasVision: true,
          hasTools: true,
          isCloud: true,
        },
        hasThinking: true,
      },
      {
        name: "gpt-4o",
        model: "gpt-4o",
        description: "Azure OpenAI GPT-4o Omnimodal",
        provider: "azure",
        tag: "Azure Pro",
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
        description: "Azure OpenAI Hızlı & Ekonomik",
        provider: "azure",
        tag: "Azure Fast",
        capabilities: {
          hasThinking: false,
          hasVision: true,
          hasTools: true,
          isCloud: true,
        },
        hasThinking: false,
      },
    ];

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

  // Ollama
  const names = await fetchOllamaModels();
  const defaultMod = getDefaultModel();
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
