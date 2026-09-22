/**
 * Node built-in test runner: npx tsx --test src/lib/yula-config.test.ts
 * Düşünme bayrağı önceliği (saf + env).
 */
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { resolveThinkingEnabled, isEndpointCompatible } from "./yula-config.ts";

afterEach(() => {
  delete process.env.YULA_THINKING;
});

describe("resolveThinkingEnabled", () => {
  it("follows the body when env is unset (default on)", () => {
    assert.equal(resolveThinkingEnabled(undefined), true);
    assert.equal(resolveThinkingEnabled(true), true);
    assert.equal(resolveThinkingEnabled(false), false);
  });
  it("env wins when set", () => {
    process.env.YULA_THINKING = "false";
    assert.equal(resolveThinkingEnabled(true), false);
    process.env.YULA_THINKING = "0";
    assert.equal(resolveThinkingEnabled(undefined), false);
    process.env.YULA_THINKING = "true";
    assert.equal(resolveThinkingEnabled(false), true);
    process.env.YULA_THINKING = "yes";
    assert.equal(resolveThinkingEnabled(false), true);
  });
  it("ignores unrecognized env values", () => {
    process.env.YULA_THINKING = "belki";
    assert.equal(resolveThinkingEnabled(true), true);
    assert.equal(resolveThinkingEnabled(false), false);
  });
});

describe("isEndpointCompatible", () => {
  it("handles undefined or empty endpoint", () => {
    assert.equal(isEndpointCompatible(undefined, "agnes"), true);
    assert.equal(isEndpointCompatible("", "ollama"), true);
  });

  it("identifies Azure endpoints correctly", () => {
    const azureUrl = "https://tmandali-resource.services.ai.azure.com/openai/v1";
    assert.equal(isEndpointCompatible(azureUrl, "azure"), true);
    assert.equal(isEndpointCompatible(azureUrl, "agnes"), false);
    assert.equal(isEndpointCompatible(azureUrl, "ollama"), false);
    assert.equal(isEndpointCompatible(azureUrl, "openai"), false);
  });

  it("identifies Ollama endpoints correctly", () => {
    const ollamaUrl = "http://localhost:11434";
    assert.equal(isEndpointCompatible(ollamaUrl, "ollama"), true);
    assert.equal(isEndpointCompatible(ollamaUrl, "azure"), false);
    assert.equal(isEndpointCompatible(ollamaUrl, "agnes"), false);
  });

  it("identifies Agnes endpoints correctly", () => {
    const agnesUrl = "https://apihub.agnes-ai.com/v1";
    assert.equal(isEndpointCompatible(agnesUrl, "agnes"), true);
    assert.equal(isEndpointCompatible(agnesUrl, "azure"), false);
    assert.equal(isEndpointCompatible(agnesUrl, "ollama"), false);
  });

  it("allows custom generic proxy endpoints", () => {
    assert.equal(isEndpointCompatible("http://127.0.0.1:8080/v1", "agnes"), true);
    assert.equal(isEndpointCompatible("http://127.0.0.1:8080/v1", "azure"), true);
  });
});

