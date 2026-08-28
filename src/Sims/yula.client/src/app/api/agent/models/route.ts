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

/** Model seçici için Ollama /api/tags köprüsü (referans repo deseni). */
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
    return Response.json(await res.json());
  } catch (error) {
    return Response.json(
      { models: [], error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
