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
name: ornek-beceri
slash: ornek-beceri
label: Örnek Beceri
description: Örnek test becerisi
scope: global
---

Adım 1: ayı sor.
Adım 2: raporu çalıştır.
`;

describe("parseSkillFile", () => {
  it("parses standard + extended frontmatter", () => {
    const parsed = parseSkillFile(SAMPLE, "fallback");
    assert.equal(parsed.name, "ornek-beceri");
    assert.equal(parsed.slash, "ornek-beceri");
    assert.equal(parsed.label, "Örnek Beceri");
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
