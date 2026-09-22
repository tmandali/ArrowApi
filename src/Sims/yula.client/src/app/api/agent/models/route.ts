import { getYulaProviderInfo } from "@/lib/yula-provider";
import { DEFAULT_OLLAMA_URL, PROVIDER_LABELS, isEndpointCompatible } from "@/lib/yula-config";
import {
  resolveModelsConfig,
  getAvailableProviderIdsFromAuth,
} from "@/lib/yula-models-auth";
import { fetchLiveProviderModels } from "@/lib/yula-provider-models-fetcher";

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
  }).catch(() => {});
}

/** Model seçici: Sağlayıcılardan canlı çekim + 2-kademeli önbellek. */
export async function GET(req: Request) {
  try {
    const url = req?.url ? new URL(req.url) : new URL("http://localhost/api/agent/models");
    const mConfig = resolveModelsConfig();
    const authProviderIds = getAvailableProviderIdsFromAuth();
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // 1. Provider seçimi auth.json ve mConfig'e göre yapılır
    const availableProviders = authProviderIds
      .filter((id) => mConfig?.providers?.[id] || PROVIDER_LABELS[id])
      .map((id) => ({
        id,
        label: mConfig?.providers?.[id]?.name || PROVIDER_LABELS[id] || id,
      }));

    const requestedProvider = url.searchParams.get("provider");
    let provider = requestedProvider;
    if (!provider || !availableProviders.some((p) => p.id === provider)) {
      provider =
        mConfig?.defaultProvider && availableProviders.some((p) => p.id === mConfig.defaultProvider)
          ? mConfig.defaultProvider
          : availableProviders[0]?.id || "azure";
    }

    const rawEndpoint = url.searchParams.get("endpoint");
    const validEndpoint = isEndpointCompatible(rawEndpoint, provider as any) ? rawEndpoint : undefined;
    const endpoint = validEndpoint || mConfig?.providers?.[provider]?.baseUrl;
    const providerInfo = getYulaProviderInfo(provider as any);

    if (provider === "ollama") {
      const base = (endpoint || process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
      warmupLocalModel(base, providerInfo.defaultModel);
    }

    // 2. Aktif sağlayıcının modellerini canlı/önbellekten getir
    const providerModelsList = await fetchLiveProviderModels({
      provider,
      baseUrl: endpoint,
      forceRefresh,
    });

    const models = providerModelsList.map((m) => {
      const hasThinking = Boolean(m.hasThinking ?? m.capabilities?.hasThinking);
      return {
        id: m.model || m.name,
        modelId: m.model || m.name,
        name: m.name,
        model: m.model || m.name,
        description: m.description || m.name,
        provider,
        tag: m.tag || (hasThinking ? "Thinking" : "Standard"),
        capabilities: m.capabilities,
        hasThinking,
        isConfigured: Boolean(m.isConfigured),
        contextWindow: undefined,
        maxTokens: undefined,
      };
    });

    // 3. Tüm yetkili sağlayıcıların modellerini topla (canlı veya önbellek)
    // Aktif sağlayıcı önceliklidir; duplicate model ID'leri tekilleştirilir.
    const allModels: Array<{
      id: string;
      name: string;
      provider: string;
      providerLabel: string;
      hasThinking?: boolean;
      isConfigured?: boolean;
    }> = [];

    const seenModelIds = new Set<string>();

    const sortedProviders = [...availableProviders].sort((a, b) => {
      if (a.id === provider) return -1;
      if (b.id === provider) return 1;
      return 0;
    });

    for (const p of sortedProviders) {
      const pEndpoint = p.id === provider ? endpoint : mConfig?.providers?.[p.id]?.baseUrl;
      const pModels = await fetchLiveProviderModels({
        provider: p.id,
        baseUrl: pEndpoint,
        forceRefresh,
      });

      for (const m of pModels) {
        const id = m.model || m.name;
        const normId = id.toLowerCase();
        if (seenModelIds.has(normId)) continue;
        seenModelIds.add(normId);

        allModels.push({
          id,
          name: m.name,
          provider: p.id,
          providerLabel: p.label,
          hasThinking: Boolean(m.hasThinking ?? m.capabilities?.hasThinking),
          isConfigured: Boolean(m.isConfigured),
        });
      }
    }

    return Response.json({
      provider,
      defaultModel: providerInfo.defaultModel,
      isCloud: provider !== "ollama",
      vectorDimension: providerInfo.vectorDimension,
      availableProviders,
      models,
      allModels,
    });
  } catch (error) {
    return Response.json(
      { models: [], error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
    );
  }
}
