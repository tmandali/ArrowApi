import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyModelCapabilities,
  fetchLiveProviderModels,
  clearServerProviderModelsCache,
} from "./yula-provider-models-fetcher";

describe("Yula Provider Models Fetcher & In-Memory Cache Suite", () => {
  it("classifyModelCapabilities identifies thinking and tools correctly", () => {
    const qwen = classifyModelCapabilities("qwen2.5:32b", "ollama");
    assert.equal(qwen.hasThinking, true);
    assert.equal(qwen.capabilities.hasTools, true);
    assert.equal(qwen.capabilities.isCloud, false);

    const gpt4o = classifyModelCapabilities("gpt-4o", "azure");
    assert.equal(gpt4o.hasThinking, false);
    assert.equal(gpt4o.capabilities.hasVision, true);
    assert.equal(gpt4o.capabilities.isCloud, true);

    const o3 = classifyModelCapabilities("o3-mini", "azure");
    assert.equal(o3.hasThinking, true);

    const mlx = classifyModelCapabilities("gemma4:12b-mlx", "ollama");
    assert.equal(mlx.tag, "MLX");
    assert.equal(mlx.capabilities.isMlx, true);
  });

  it("fetchLiveProviderModels falls back gracefully when endpoint is unreachable", async () => {
    clearServerProviderModelsCache();
    const models = await fetchLiveProviderModels({
      provider: "ollama",
      baseUrl: "http://127.0.0.1:59999", // Unreachable port
    });

    assert.ok(Array.isArray(models));
    assert.ok(models.length > 0, "Should fall back to default/configured models");
    assert.ok(models.some((m) => m.provider === "ollama"));
  });

  it("fetchLiveProviderModels caches results in memory and skips network on repeated calls", async () => {
    clearServerProviderModelsCache();
    const firstCall = await fetchLiveProviderModels({
      provider: "azure",
      baseUrl: "https://invalid-azure-endpoint.openai.azure.com",
    });

    assert.ok(firstCall.length > 0);

    // İkinci çağrı: Önbellekten dönmeli
    const secondCall = await fetchLiveProviderModels({
      provider: "azure",
      baseUrl: "https://invalid-azure-endpoint.openai.azure.com",
    });

    assert.equal(secondCall, firstCall, "Should return identical cached array reference");
  });

  it("fetchLiveProviderModels respects forceRefresh flag", async () => {
    clearServerProviderModelsCache();
    const firstCall = await fetchLiveProviderModels({
      provider: "azure",
      baseUrl: "https://invalid-azure-endpoint.openai.azure.com",
    });

    const refreshedCall = await fetchLiveProviderModels({
      provider: "azure",
      baseUrl: "https://invalid-azure-endpoint.openai.azure.com",
      forceRefresh: true,
    });

    assert.ok(refreshedCall.length > 0);
    assert.notEqual(refreshedCall, firstCall, "forceRefresh should bypass cache and generate fresh reference");
  });

  it("fetchLiveProviderModels flags models defined in models.json with isConfigured=true", async () => {
    clearServerProviderModelsCache();
    const models = await fetchLiveProviderModels({
      provider: "azure",
      baseUrl: "https://invalid-azure-endpoint.openai.azure.com",
    });

    const gpt5Luna = models.find((m) => m.name.includes("luna") || m.model?.includes("luna") || m.model === "gpt-5.6-luna");
    if (gpt5Luna) {
      assert.equal(gpt5Luna.isConfigured, true, "Models in models.json should have isConfigured=true");
    }
  });

  it("fetchLiveProviderModels guarantees unique model identifiers (no duplicate keys)", async () => {
    clearServerProviderModelsCache();
    const models = await fetchLiveProviderModels({
      provider: "ollama",
      baseUrl: "http://127.0.0.1:59999",
    });

    const seen = new Set<string>();
    for (const m of models) {
      const key = (m.model || m.name).toLowerCase();
      assert.equal(seen.has(key), false, `Duplicate model detected: ${key}`);
      seen.add(key);
    }
  });
});
