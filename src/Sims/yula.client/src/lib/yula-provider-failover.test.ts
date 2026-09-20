import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRetryableProviderError,
  createFailoverLanguageModel,
} from "./yula-provider-failover";

describe("yula-provider-failover", () => {
  it("429 ve 503 gibi hataları retryable olarak tespit eder", () => {
    assert.equal(isRetryableProviderError(new Error("HTTP 429 Too Many Requests")), true);
    assert.equal(isRetryableProviderError(new Error("503 Service Unavailable")), true);
    assert.equal(isRetryableProviderError(new Error("ETIMEDOUT connection timeout")), true);
    assert.equal(isRetryableProviderError(new Error("Invalid prompt arguments")), false);
  });

  it("fallback tanımlı değilse doğrudan primary modeli döner", () => {
    const mockPrimary = { modelId: "test-primary" } as any;
    const model = createFailoverLanguageModel({ primary: mockPrimary });
    assert.equal(model, mockPrimary);
  });

  it("fallback tanımlıysa wrapLanguageModel ile sarmalar", () => {
    const mockPrimary = {
      specificationVersion: "v1",
      provider: "primary-provider",
      modelId: "primary-model",
      defaultObjectGenerationMode: "json",
      doStream: async () => ({ stream: {} as any }),
      doGenerate: async () => ({} as any),
    } as any;

    const mockFallback = {
      specificationVersion: "v1",
      provider: "fallback-provider",
      modelId: "fallback-model",
      defaultObjectGenerationMode: "json",
      doStream: async () => ({ stream: {} as any }),
      doGenerate: async () => ({} as any),
    } as any;

    const model = createFailoverLanguageModel({
      primary: mockPrimary,
      fallback: mockFallback,
    });

    assert.ok(model);
    assert.notEqual(model, mockPrimary);
  });
});
