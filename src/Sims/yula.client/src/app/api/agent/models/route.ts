import {
  getAvailableProviderModels,
  getYulaProviderInfo,
} from "@/lib/yula-provider";
import { DEFAULT_OLLAMA_URL } from "@/lib/yula-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Soğuk başlangıç ısıtması (Yalnızca Ollama için):
 */
function warmupModel(base: string, defaultModel: string) {
  void fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: defaultModel,
      keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
    }),
    cache: "no-store",
  }).catch(() => {
    // Isıtma best-effort: Ollama kapalıysa sessizce yut
  });
}

/** Model seçici için sağlayıcı köprüsü — aktif sağlayıcının modellerini ve yeteneklerini döndürür. */
export async function GET() {
  try {
    const providerInfo = getYulaProviderInfo();

    if (providerInfo.provider === "ollama") {
      const base = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
      warmupModel(base, providerInfo.defaultModel);
    }

    const models = await getAvailableProviderModels();

    return Response.json({
      provider: providerInfo.provider,
      defaultModel: providerInfo.defaultModel,
      isCloud: providerInfo.isCloud,
      vectorDimension: providerInfo.vectorDimension,
      models,
    });
  } catch (error) {
    return Response.json(
      { models: [], error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

