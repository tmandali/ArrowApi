export type AIProviderType = "azure" | "ollama" | "openai" | "agnes";

export const PROVIDER_LABELS: Record<AIProviderType, string> = {
  azure: "Microsoft Foundry",
  ollama: "Ollama",
  openai: "OpenAI",
  agnes: "Agnes",
};

/** Agnes AI gateway (OpenAI-uyumlu). Kaynak: agnes-ai docs cid1/cid7. */
export const DEFAULT_AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";
export const DEFAULT_AGNES_MODEL = "agnes-2.5-flash";
/** Sağlayıcı bazında bilinen Agnes modelleri (seçicide env'siz görünür). */
export const DEFAULT_AGNES_MODELS: readonly string[] = [
  "agnes-2.5-flash",
  "agnes-3.0-flash",
] as const;

/** İstekte / ayarda gelen ad (foundry ≡ azure). */
export function normalizeProvider(requested?: string | null): AIProviderType | undefined {
  const r = (requested ?? "").toLowerCase().trim();
  if (r === "azure" || r === "foundry") return "azure";
  if (r === "ollama") return "ollama";
  if (r === "openai") return "openai";
  if (r === "agnes") return "agnes";
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

function hasAgnesEnv(): boolean {
  return Boolean(process.env.AGNES_API_KEY);
}

function hasOllamaEnv(): boolean {
  return Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL);
}

/** Env’de kimlik bilgisi / uç noktası olan sağlayıcılar (seçici için). */
export function listConfiguredProviders(): AIProviderType[] {
  const out: AIProviderType[] = [];
  if (hasAzureEnv()) out.push("azure");
  if (hasOpenAiEnv()) out.push("openai");
  if (hasAgnesEnv()) out.push("agnes");
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
  if (hasAgnesEnv() && !hasAzureEnv() && !hasOpenAiEnv()) return "agnes";
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
  if (provider === "agnes") {
    return process.env.AGNES_MODEL ?? DEFAULT_AGNES_MODEL;
  }
  return (
    process.env.OLLAMA_MODEL ??
    process.env.NEXT_PUBLIC_YULA_MODEL ??
    process.env.YULA_MODEL ??
    "gemma4:12b-mlx"
  );
}

/** Azure/Foundry'de kullanılabilir deployment adları (sıra korunur).
 *  AZURE_OPENAI_DEPLOYMENTS="gpt-5.4,gpt-4o" gibi virgüllü liste;
 *  boşsa yalnızca varsayılan model döner. Deployment adı ≠ model adı:
 *  Azure kaynağında tanımlı deployment adları yazılmalıdır. */
export function getAzureDeployments(): string[] {
  const primary = getDefaultModel("azure");
  const extras = (process.env.AZURE_OPENAI_DEPLOYMENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== primary);
  return [primary, ...extras];
}

/** Agnes'te kullanılabilir model adları (sıra korunur).
 *  Birincil model sağlayıcı varsayılanıdır (`AGNES_MODEL`, yoksa
 *  `agnes-2.5-flash`); ardından bilinen modeller, en sonda `AGNES_MODELS`
 *  env'inden ekstralar (`"agnes-2.5-pro,..."` gibi virgüllü liste) gelir. */
export function getAgnesModels(): string[] {
  const primary = getDefaultModel("agnes");
  const extras = (process.env.AGNES_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const out = [primary];
  for (const name of [...DEFAULT_AGNES_MODELS, ...extras]) {
    if (name !== primary && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Varsayılan embedding modeli. */
export function getDefaultEmbeddingModel(provider: AIProviderType = getActiveProvider()): string {
  if (provider === "azure") {
    return process.env.AZURE_OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }
  if (provider === "openai") {
    return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }
  if (provider === "agnes") {
    return process.env.AGNES_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }
  return (
    process.env.OLLAMA_EMBEDDING_MODEL ??
    process.env.NEXT_PUBLIC_EMBEDDING_MODEL ??
    "all-minilm:latest"
  );
}

/** Varsayılan embedding vektör boyutu (WASM & RAG için). */
export function getVectorDimension(provider: AIProviderType = getActiveProvider()): number {
  const rawDim =
    process.env.VECTOR_DIMENSION || process.env.NEXT_PUBLIC_VECTOR_DIMENSION;
  if (rawDim) {
    const dim = Number(rawDim);
    if (!Number.isNaN(dim) && dim > 0) return dim;
  }
  return provider === "azure" || provider === "openai" || provider === "agnes" ? 1536 : 384;
}

export const DEFAULT_YULA_MODEL = getDefaultModel();
export const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

/** Düşünme bayrağı önceliği: YULA_THINKING set ise env kazanır
 *  (dağıtım politikası), yoksa istek gövdesi (varsayılan açık). */
export function resolveThinkingEnabled(bodyValue?: boolean): boolean {
  const env = process.env.YULA_THINKING;
  if (env !== undefined) {
    const v = env.trim().toLowerCase();
    if (["0", "false", "no", "off"].includes(v)) return false;
    if (["1", "true", "yes", "on"].includes(v)) return true;
  }
  return bodyValue !== false;
}
