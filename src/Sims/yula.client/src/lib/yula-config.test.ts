/**
 * Node built-in test runner: npx tsx --test src/lib/yula-config.test.ts
 * Düşünme bayrağı önceliği (saf + env).
 */
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { resolveThinkingEnabled } from "./yula-config.ts";

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
