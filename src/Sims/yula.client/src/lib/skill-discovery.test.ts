/**
 * Node built-in test runner: npx tsx --test src/lib/skill-discovery.test.ts
 * SKILL.md ayrıştırma (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSkillFile,
  stripSkillFrontmatter,
} from "./skill-discovery.ts";

const SAMPLE = `---
name: ay-kapanis
slash: ay-kapanis
label: Ay kapanış kontrolü
description: Ay sonu rapor setini kontrol eder
scope: global
---

Adım 1: ayı sor.
Adım 2: raporu çalıştır.
`;

describe("parseSkillFile", () => {
  it("parses standard + extended frontmatter", () => {
    const parsed = parseSkillFile(SAMPLE, "fallback");
    assert.equal(parsed.name, "ay-kapanis");
    assert.equal(parsed.slash, "ay-kapanis");
    assert.equal(parsed.label, "Ay kapanış kontrolü");
    assert.equal(parsed.scope, "global");
    assert.ok(parsed.prompt.startsWith("Adım 1:"));
    assert.ok(!parsed.prompt.includes("---"));
  });
  it("falls back without frontmatter", () => {
    const parsed = parseSkillFile("Serbest metin gövde.", "fallback");
    assert.equal(parsed.name, "fallback");
    assert.equal(parsed.slash, "fallback");
    assert.equal(parsed.scope, "global");
    assert.equal(parsed.prompt, "Serbest metin gövde.");
  });
  it("stripSkillFrontmatter keeps body only", () => {
    assert.equal(stripSkillFrontmatter(SAMPLE), "Adım 1: ayı sor.\nAdım 2: raporu çalıştır.");
  });
});
