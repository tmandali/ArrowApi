import {
  getAvailableProviderModels,
  getYulaProviderInfo,
} from "@/lib/yula-provider";
import {
  DEFAULT_OLLAMA_URL,
  PROVIDER_LABELS,
  listConfiguredProviders,
  resolveProvider,
} from "@/lib/yula-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function warmupLocalModel(base: string, defaultModel: string) {
  void fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: defaultModel,
      keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
    }),
    cache: "no-store",
  }).catch(() => {
    // Isıtma best-effort
  });
}

/** Model seçici: env’de tanımlı sağlayıcılar + aktif listenin modelleri. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const provider = resolveProvider(url.searchParams.get("provider"));
    const endpoint = url.searchParams.get("endpoint") || undefined;
    const providerInfo = getYulaProviderInfo(provider);
    const availableProviders = listConfiguredProviders().map((id) => ({
      id,
      label: PROVIDER_LABELS[id],
    }));

    if (provider === "ollama") {
      const base = (endpoint || process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(
        /\/+$/,
        "",
      );
      warmupLocalModel(base, providerInfo.defaultModel);
    }

    const models = await getAvailableProviderModels({
      provider,
      baseUrl: endpoint,
    });

    return Response.json({
      provider: providerInfo.provider,
      defaultModel: providerInfo.defaultModel,
      isCloud: providerInfo.isCloud,
      vectorDimension: providerInfo.vectorDimension,
      availableProviders,
      models,
    });
  } catch (error) {
    return Response.json(
      { models: [], error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
