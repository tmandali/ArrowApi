/**
 * Node built-in test runner: npx tsx --test src/lib/yula-user-skill.test.ts
 * Kullanıcı skill validasyon + prompt inşası (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUserSkillPrompt, buildUserSkillMarkdown, filterSkillsByScope, validateUserSkill, validateUserSkillFile, userSkillFilesSize, getEffectiveUserSkills } from "./yula-user-skill.ts";

describe("validateUserSkill", () => {
  it("accepts a well-formed draft", () => {
    assert.equal(
      validateUserSkill(
        { slash: "haftalik-ozet", label: "Haftalık özet", prompt: "Özet çıkar" },
        ["analiz"],
      ),
      null,
    );
  });
  it("rejects empty slash, bad chars, duplicates, empty label/prompt", () => {
    assert.ok(validateUserSkill({ slash: "", label: "L", prompt: "P" }, []));
    assert.ok(
      validateUserSkill({ slash: "iki kelime", label: "L", prompt: "P" }, []),
    );
    assert.ok(
      validateUserSkill(
        { slash: "analiz", label: "L", prompt: "P" },
        ["analiz"],
      ),
    );
    assert.ok(
      validateUserSkill({ slash: "ozet", label: "", prompt: "P" }, []),
    );
    assert.ok(
      validateUserSkill({ slash: "ozet", label: "L", prompt: "  " }, []),
    );
  });
});

describe("filterSkillsByScope", () => {
  const base = { id: "1", label: "L", description: "", prompt: "P", createdAt: 0, updatedAt: 0 };
  const skills = [
    { ...base, id: "g", slash: "genel" },
    { ...base, id: "s", slash: "stok-is", scope: "stock" },
    { ...base, id: "m", slash: "satis-is", scope: "selling" },
  ];
  it("shows global + matching workspace skills", () => {
    const out = filterSkillsByScope(skills, "stock").map((s) => s.slash);
    assert.deepEqual(out, ["genel", "stok-is"]);
  });
  it("shows only global skills without workspace", () => {
    assert.deepEqual(
      filterSkillsByScope(skills, null).map((s) => s.slash),
      ["genel"],
    );
  });
});
describe("validateUserSkillFile", () => {
  it("accepts a well-formed reference file", () => {
    assert.equal(
      validateUserSkillFile({ name: "notlar.md", content: "kural 1" }, []),
      null,
    );
  });
  it("rejects bad extension, duplicates, empty and oversized files", () => {
    assert.ok(validateUserSkillFile({ name: "kodu.mjs", content: "x" }, []));
    assert.ok(validateUserSkillFile({ name: "a.md", content: "x" }, ["A.MD"]));
    assert.ok(validateUserSkillFile({ name: "b.txt", content: "   " }, []));
    assert.ok(
      validateUserSkillFile({ name: "c.md", content: "x".repeat(32_001) }, []),
    );
    assert.ok(validateUserSkillFile({ name: "../kacis.md", content: "x" }, []));
  });
  it("sums file sizes", () => {
    assert.equal(
      userSkillFilesSize([
        { name: "a.md", content: "12345" },
        { name: "b.md", content: "67" },
      ]),
      7,
    );
  });
});
describe("buildUserSkillMarkdown", () => {
  it("renders frontmatter + prompt", () => {
    const out = buildUserSkillMarkdown({
      slash: "Haftalik-Ozet",
      label: "Haftalık özet",
      description: "Ne zaman?",
      scope: "stock",
      prompt: "Özet çıkar.",
    });
    assert.ok(out.includes("name: haftalik-ozet"));
    assert.ok(out.includes("scope: stock"));
    assert.ok(out.endsWith("Özet çıkar.\n"));
  });
  it("falls back on empty fields", () => {
    const out = buildUserSkillMarkdown({
      slash: "", label: "", description: "", prompt: "",
    });
    assert.ok(out.includes("name: yeni-skill"));
    assert.ok(out.includes("scope: global"));
  });
});
describe("getEffectiveUserSkills", () => {
  const builtin = {
    id: "b1", slash: "kalite", label: "Kalite", description: "",
    prompt: "Kalite turu", createdAt: 1, updatedAt: 1, scope: "global",
  };
  const builtinScoped = { ...builtin, id: "b2", slash: "sayim", scope: "stock" };
  const mine = {
    id: "u1", slash: "ozet", label: "Özet", description: "",
    prompt: "Özet çıkar", createdAt: 0, updatedAt: 0, scope: "selling",
  };
  it("merges built-ins before store skills, scope-filtered", () => {
    const stock = getEffectiveUserSkills([mine], [builtin, builtinScoped], "stock").map((s) => s.slash);
    assert.deepEqual(stock, ["kalite", "sayim"]);
    const selling = getEffectiveUserSkills([mine], [builtin, builtinScoped], "selling").map((s) => s.slash);
    assert.deepEqual(selling, ["kalite", "ozet"]);
  });
});
describe("buildUserSkillPrompt", () => {
  it("substitutes {{input}}", () => {
    assert.equal(
      buildUserSkillPrompt({ prompt: "Özet çıkar: {{input}}" }, "son 7 gün"),
      "Özet çıkar: son 7 gün",
    );
  });
  it("appends args when no placeholder", () => {
    assert.equal(
      buildUserSkillPrompt({ prompt: "Özet çıkar" }, "son 7 gün"),
      "Özet çıkar son 7 gün",
    );
  });
  it("cleans the placeholder when args are empty", () => {
    assert.equal(
      buildUserSkillPrompt({ prompt: "Raporu {{input}} hazırla" }, ""),
      "Raporu hazırla",
    );
  });
});
