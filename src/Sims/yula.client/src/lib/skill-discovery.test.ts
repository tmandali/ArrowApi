/**
 * Node built-in test runner: npx tsx --test src/lib/skill-discovery.test.ts
 * SKILL.md ayrıştırma + sandbox güdümlü keşif (saf + sahte sandbox).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  discoverSkills,
  parseSkillFile,
  stripSkillFrontmatter,
} from "./skill-discovery.ts";
import type { Sandbox } from "./skill-sandbox.ts";

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

function fakeSandbox(files: Record<string, string>): Pick<Sandbox, "readdir" | "readFile"> {
  return {
    readdir: async (dir) => {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const kids = new Map<string, boolean>();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const head = rest.split("/")[0];
        if (rest.includes("/")) kids.set(head, true);
      }
      return [...kids.entries()].map(([name, isDir]) => ({
        name,
        isDirectory: () => isDir,
      }));
    },
    readFile: async (p) => {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p];
    },
  };
}

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

describe("discoverSkills", () => {
  it("discovers SKILL.md dirs, first name wins, skips invalid", async () => {
    const sb = fakeSandbox({
      "skills/ay-kapanis/SKILL.md": SAMPLE,
      "skills/broken/SKILL.md": "---\n: hatalı yaml [\n---\nGövde metni.",
      "skills/empty/note.txt": "yok",
    });
    const found = await discoverSkills(sb, ["skills", "missing-dir"]);
    assert.equal(found.length, 2);
    assert.equal(found[0].name, "ay-kapanis");
    assert.equal(found[0].path, "skills/ay-kapanis");
    // Bozuk frontmatter'lı dosya gövdeyle yine de keşfedilir (dir adıyla)
    assert.equal(found[1].name, "broken");
  });
});
