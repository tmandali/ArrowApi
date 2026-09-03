import { getVectorDimension } from "./yula-config";

/**
 * Yula Embedding Servisi — Çoklu Sağlayıcı Destekli (Azure / OpenAI / Ollama).
 *
 * /api/agent/embed rotası üzerinden aktif sağlayıcı modeliyle (örn: text-embedding-3-small,
 * all-minilm) vektör üretir. WASM vector store ile tam uyumludur.
 */

export const VECTOR_DIMENSION = getVectorDimension();

/**
 * Devre kesici (circuit breaker): sağlayıcı kimlik (401/403) veya kota hatası
 * bir kez alındığında embedding uç noktası oturum boyunca devre dışı kalır;
 * sonraki tüm çağrılar yerel deterministik fallback vektörle karşılanır.
 * Böylece 401 döngüsü (her menü öğesi için tekrar eden istekler) kesilir.
 */
let embedEndpointDisabled = false;

function isAuthOrQuotaStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429;
}

function disableEmbedEndpoint(status: number): void {
  if (embedEndpointDisabled) return;
  embedEndpointDisabled = true;
  console.warn(
    `[Yula Embedding] Sağlayıcı istekleri reddetti (HTTP ${status}) — bu oturumda embedding uç noktası devre dışı; yerel fallback vektör kullanılacak. Lütfen API anahtarını/sağlayıcı env ayarlarını kontrol edin (örn. OpenRouter anahtarı OpenAI uç noktasına gönderiliyor olabilir).`,
  );
}

/** Metni FNV-1a 32-bit ile deterministik sezgisel sayı dizisine çevirir (offline fallback). */
function fallbackVector(text: string, dimension = VECTOR_DIMENSION): number[] {
  const vec: number[] = new Array(dimension).fill(0);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    const idx = Math.abs(hash) % dimension;
    vec[idx] += (text.charCodeAt(i) % 10) / 10;
  }
  // L2 Normalization (Cosine distance uyumu için)
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function getEmbedding(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) return new Array(VECTOR_DIMENSION).fill(0);

  // Devre kesici: kimlik/kota hatası bir kez tespit edildiyse bu oturumda
  // tekrar ağa çıkma — 401 fırtınası ve konsol spam'i oluşmasın.
  if (embedEndpointDisabled) return fallbackVector(trimmed);

  try {
    const res = await fetch("/api/agent/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });

    if (res.ok) {
      const data = (await res.json()) as { embedding?: number[]; dimension?: number };
      if (Array.isArray(data.embedding) && data.embedding.length > 0) {
        return data.embedding;
      }
    } else if (isAuthOrQuotaStatus(res.status)) {
      disableEmbedEndpoint(res.status);
    }
  } catch (err) {
    console.warn(
      "[Yula Embedding] /api/agent/embed erişilemedi; deterministik fallback vektör kullanılıyor:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return fallbackVector(trimmed);
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const validTexts = texts.map((t) => t.trim());
  if (validTexts.length === 0) return [];

  if (embedEndpointDisabled) {
    return validTexts.map((t) => fallbackVector(t));
  }

  try {
    const res = await fetch("/api/agent/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: validTexts }),
    });

    if (res.ok) {
      const data = (await res.json()) as { embeddings?: number[][] };
      if (Array.isArray(data.embeddings) && data.embeddings.length === validTexts.length) {
        return data.embeddings;
      }
    } else if (isAuthOrQuotaStatus(res.status)) {
      disableEmbedEndpoint(res.status);
      return validTexts.map((t) => fallbackVector(t));
    }
  } catch (err) {
    console.warn(
      "[Yula Embedding] Batched /api/agent/embed erişilemedi; fallback vektörler üretiliyor:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Not: toplu istek başarısızsa öğe başına ağa ÇIKILMAZ (hata fırtınası);
  // doğrudan yerel deterministik fallback vektörler üretilir.
  return validTexts.map((t) => (t ? fallbackVector(t) : new Array(VECTOR_DIMENSION).fill(0)));
}

