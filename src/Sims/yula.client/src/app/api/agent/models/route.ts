export const runtime = "nodejs";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = process.env.YULA_MODEL ?? "gemma4:12b-mlx";

/**
 * Soğuk başlangıç ısıtması: dock açılır açılmaz varsayılan modeli Ollama
 * belleğine yükler (boş prompt = yalnız yükleme, üretim yok). Böylece
 * kullanıcının İLK mesajı da sonrakiler kadar hızlı döner — aksi halde ilk
 * istek model yükleme süresini (10-60 sn) bekler.
 */
function warmupModel(base: string) {
  void fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
    }),
    cache: "no-store",
  }).catch(() => {
    // Isıtma best-effort: Ollama kapalıysa sessizce yut
  });
}

/** Model seçici için Ollama /api/tags köprüsü — modelin TÜM özelliklerini ve yeteneklerini döndürür. */
export async function GET() {
  const base = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
  warmupModel(base);

  try {
    const res = await fetch(`${base}/api/tags`, { cache: "no-store" });
    if (!res.ok) {
      return Response.json(
        { models: [], error: `ollama ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      models?: Array<{
        name: string;
        model?: string;
        size?: number;
        modified_at?: string;
        digest?: string;
        details?: {
          parent_model?: string;
          format?: string;
          family?: string;
          families?: string[];
          parameter_size?: string;
          quantization_level?: string;
        };
      }>;
    };

    const enrichedModels = (data.models ?? []).map((m) => {
      const lowerName = m.name.toLowerCase();
      const familyStr = (m.details?.family ?? "").toLowerCase();
      const familiesStr = (m.details?.families ?? []).join(" ").toLowerCase();

      const isMlx = lowerName.includes("mlx");
      const isEmbed =
        lowerName.includes("embed") ||
        lowerName.includes("bge") ||
        lowerName.includes("minilm") ||
        lowerName.includes("nomic") ||
        lowerName.includes("reranker");

      const isGemma4 =
        lowerName.includes("gemma4") ||
        lowerName.includes("gemma-4") ||
        familyStr.includes("gemma4") ||
        familiesStr.includes("gemma4");

      const hasThinking =
        !isEmbed &&
        (isGemma4 ||
          lowerName.includes("deepseek") ||
          lowerName.includes("r1") ||
          lowerName.includes("think") ||
          lowerName.includes("reason") ||
          lowerName.includes("qwen") ||
          lowerName.includes("llama") ||
          lowerName.includes("laguna") ||
          lowerName.includes("glm") ||
          lowerName.includes("kimi") ||
          lowerName.includes("minimax") ||
          lowerName.includes("cloud"));

      const hasVision =
        !isEmbed &&
        !isMlx &&
        (lowerName.includes("vision") ||
          lowerName.includes("llava") ||
          lowerName.includes("bakllava") ||
          lowerName.includes("moondream") ||
          lowerName.includes("minicpm-v") ||
          familiesStr.includes("clip"));

      const hasTools =
        !isEmbed &&
        (isGemma4 ||
          lowerName.includes("qwen") ||
          lowerName.includes("llama") ||
          lowerName.includes("laguna") ||
          lowerName.includes("mistral") ||
          lowerName.includes("command-r") ||
          lowerName.includes("firefunction") ||
          lowerName.includes("agent"));

      const hasAudio =
        !isEmbed &&
        (isGemma4 ||
          lowerName.includes("audio") ||
          lowerName.includes("whisper") ||
          lowerName.includes("voxta"));

      const hasEmbedding = isEmbed;

      return {
        name: m.name,
        model: m.model ?? m.name,
        size: m.size,
        modifiedAt: m.modified_at,
        digest: m.digest,
        details: {
          parentModel: m.details?.parent_model,
          format: m.details?.format,
          family: m.details?.family,
          families: m.details?.families,
          parameterSize: m.details?.parameter_size,
          quantizationLevel: m.details?.quantization_level,
        },
        capabilities: {
          hasThinking,
          hasVision,
          hasTools,
          hasAudio,
          hasEmbedding,
          isMlx,
        },
        // Geriye dönük uyumluluk
        hasThinking,
      };
    });

    return Response.json({ models: enrichedModels });
  } catch (error) {
    return Response.json(
      { models: [], error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
