/**
 * Yula Embedding Servisi — all-minilm:latest (384-dim vector) sürücüsü.
 *
 * Yerel Ollama (/api/embeddings veya /api/embed) üzerinden 384 boyutlu vektör dizisi
 * (FLOAT[384]) üretir. DuckDB WASM'nin native vector tipleriyle 1:1 uyumludur.
 */

const OLLAMA_HOST =
  process.env.NEXT_PUBLIC_OLLAMA_HOST || "http://localhost:11434";
const EMBEDDING_MODEL = "all-minilm:latest";
export const VECTOR_DIMENSION = 384;

/** Metni FNV-1a 32-bit ile deterministik sezgisel sayı dizisine çevirir (fallback). */
function fallbackVector(text: string): number[] {
  const vec: number[] = new Array(VECTOR_DIMENSION).fill(0);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    const idx = Math.abs(hash) % VECTOR_DIMENSION;
    vec[idx] += (text.charCodeAt(i) % 10) / 10;
  }
  // L2 Normalization (Cosine distance uyumu için)
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function getEmbedding(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) return new Array(VECTOR_DIMENSION).fill(0);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: trimmed,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { embedding?: number[] };
      if (Array.isArray(data.embedding) && data.embedding.length > 0) {
        // Eğer model 384-dim değilse boyut ayarla veya doğrudan dön
        if (data.embedding.length === VECTOR_DIMENSION) {
          return data.embedding;
        }
        return data.embedding.slice(0, VECTOR_DIMENSION);
      }
    }
  } catch (err) {
    console.warn(
      `[Yula Embedding] Ollama '${EMBEDDING_MODEL}' erişilemedi; deterministik vektör kullanılıyor:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  return fallbackVector(trimmed);
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((t) => getEmbedding(t)));
}
