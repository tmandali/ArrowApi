export type AIProviderType = "azure" | "ollama" | "openai";

/** Aktif AI sağlayıcısını belirler (azure | ollama | openai). */
export function getActiveProvider(): AIProviderType {
  const provider = (
    process.env.AI_PROVIDER ||
    process.env.NEXT_PUBLIC_AI_PROVIDER ||
    ""
  )
    .toLowerCase()
    .trim();
  if (provider === "azure" || provider === "ollama" || provider === "openai") {
    return provider as AIProviderType;
  }
  if (
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.AZURE_OPENAI_ENDPOINT ||
    process.env.NEXT_PUBLIC_AZURE_OPENAI_ENDPOINT
  ) {
    return "azure";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  return "ollama";
}

/** Varsayılan model adı (sağlayıcıya göre env üzerinden çözülür). */
export function getDefaultModel(): string {
  const provider = getActiveProvider();
  if (provider === "azure") {
    return (
      process.env.AZURE_OPENAI_MODEL ??
      process.env.NEXT_PUBLIC_YULA_MODEL ??
      process.env.YULA_MODEL ??
      "gpt-5.4"
    );
  }
  if (provider === "openai") {
    return (
      process.env.OPENAI_MODEL ??
      process.env.NEXT_PUBLIC_YULA_MODEL ??
      process.env.YULA_MODEL ??
      "gpt-4o"
    );
  }
  return (
    process.env.OLLAMA_MODEL ??
    process.env.NEXT_PUBLIC_YULA_MODEL ??
    process.env.YULA_MODEL ??
    "gemma4:12b-mlx"
  );
}

/** Varsayılan embedding modeli. */
export function getDefaultEmbeddingModel(): string {
  const provider = getActiveProvider();
  if (provider === "azure") {
    return (
      process.env.AZURE_OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"
    );
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
export function getVectorDimension(): number {
  const rawDim =
    process.env.VECTOR_DIMENSION || process.env.NEXT_PUBLIC_VECTOR_DIMENSION;
  if (rawDim) {
    const dim = Number(rawDim);
    if (!Number.isNaN(dim) && dim > 0) return dim;
  }
  const provider = getActiveProvider();
  return provider === "azure" || provider === "openai" ? 1536 : 384;
}

export const DEFAULT_YULA_MODEL = getDefaultModel();
export const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

