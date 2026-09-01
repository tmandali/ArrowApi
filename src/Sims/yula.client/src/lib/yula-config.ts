export type AIProviderType = "azure" | "ollama" | "openai";

export const PROVIDER_LABELS: Record<AIProviderType, string> = {
  azure: "Microsoft Foundry",
  ollama: "Ollama",
  openai: "OpenAI",
};

/** İstekte / ayarda gelen ad (foundry ≡ azure). */
export function normalizeProvider(requested?: string | null): AIProviderType | undefined {
  const r = (requested ?? "").toLowerCase().trim();
  if (r === "azure" || r === "foundry") return "azure";
  if (r === "ollama") return "ollama";
  if (r === "openai") return "openai";
  return undefined;
}

/** İstekte gelen sağlayıcı; yoksa env. */
export function resolveProvider(requested?: string | null): AIProviderType {
  return normalizeProvider(requested) ?? getActiveProvider();
}

function hasAzureEnv(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_API_KEY ||
      process.env.AZURE_OPENAI_ENDPOINT ||
      process.env.NEXT_PUBLIC_AZURE_OPENAI_ENDPOINT,
  );
}

function hasOpenAiEnv(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function hasOllamaEnv(): boolean {
  return Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL);
}

/** Env’de kimlik bilgisi / uç noktası olan sağlayıcılar (seçici için). */
export function listConfiguredProviders(): AIProviderType[] {
  const out: AIProviderType[] = [];
  if (hasAzureEnv()) out.push("azure");
  if (hasOpenAiEnv()) out.push("openai");
  if (hasOllamaEnv()) out.push("ollama");
  if (out.length === 0) out.push(getActiveProvider());
  return out;
}

/** Aktif AI sağlayıcısı. Varsayılan: Microsoft Foundry (Azure) env varsa. */
export function getActiveProvider(): AIProviderType {
  const fromEnv = normalizeProvider(
    process.env.AI_PROVIDER || process.env.NEXT_PUBLIC_AI_PROVIDER,
  );
  if (fromEnv) return fromEnv;
  if (hasAzureEnv()) return "azure";
  if (hasOpenAiEnv() && !hasAzureEnv()) return "openai";
  if (hasOllamaEnv()) return "ollama";
  if (hasOpenAiEnv()) return "openai";
  return "azure";
}

/** Varsayılan model adı (sağlayıcıya göre env üzerinden çözülür).
 *  Bulut sağlayıcılarda genel YULA_MODEL sızması engellenir — o yalnızca
 *  yerel Ollama varsayılanıdır; bulutta sağlayıcıya özgü env kullanılır. */
export function getDefaultModel(provider: AIProviderType = getActiveProvider()): string {
  if (provider === "azure") {
    return process.env.AZURE_OPENAI_MODEL ?? "gpt-5.4";
  }
  if (provider === "openai") {
    return process.env.OPENAI_MODEL ?? "gpt-4o";
  }
  return (
    process.env.OLLAMA_MODEL ??
    process.env.NEXT_PUBLIC_YULA_MODEL ??
    process.env.YULA_MODEL ??
    "gemma4:12b-mlx"
  );
}

/** Varsayılan embedding modeli. */
export function getDefaultEmbeddingModel(provider: AIProviderType = getActiveProvider()): string {
  if (provider === "azure") {
    return process.env.AZURE_OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }
  if (provider === "openai") {
    return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }
  return (
    process.env.OLLAMA_EMBEDDING_MODEL ??
    process.env.NEXT_PUBLIC_EMBEDDING_MODEL ??
    "all-minilm:latest"
  );
}

/** Varsayılan embedding vektör boyutu (DuckDB WASM & RAG için). */
export function getVectorDimension(provider: AIProviderType = getActiveProvider()): number {
  const rawDim =
    process.env.VECTOR_DIMENSION || process.env.NEXT_PUBLIC_VECTOR_DIMENSION;
  if (rawDim) {
    const dim = Number(rawDim);
    if (!Number.isNaN(dim) && dim > 0) return dim;
  }
  return provider === "azure" || provider === "openai" ? 1536 : 384;
}

export const DEFAULT_YULA_MODEL = getDefaultModel();
export const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
