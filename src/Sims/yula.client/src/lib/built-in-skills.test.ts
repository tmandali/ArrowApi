/**
 * Node built-in test runner: npx tsx --test src/lib/built-in-skills.test.ts
 * skills dizinindeki GERÇEK SKILL.md dosyaları (tek kaynak) fs ile okunup
 * doğrulanır — bundler ham-importu tsx'te çalışmadığı için bu test modülü
 * İÇE AKTARMAZ.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillFile } from "./skill-discovery.ts";
import { validateUserSkill } from "./yula-user-skill.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(here, "../../skills");

describe("built-in SKILL.md files", () => {
  it("defines the 8 built-in Anthropic skills with valid frontmatter", () => {
    const dirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    assert.deepEqual(dirs, [
      "doc-coauthoring",
      "docx",
      "frontend-design",
      "mcp-builder",
      "pdf",
      "pptx",
      "skill-creator",
      "xlsx",
    ]);
    const parsed = dirs.map((d) =>
      parseSkillFile(
        fs.readFileSync(path.join(skillsDir, d, "SKILL.md"), "utf-8"),
        d,
      ),
    );
    const slashes = parsed.map((p) => p.slash);
    assert.deepEqual([...new Set(slashes)], slashes);
    for (const p of parsed) {
      assert.equal(
        validateUserSkill({ slash: p.slash, label: p.label, prompt: p.prompt }, []),
        null,
      );
      assert.ok(p.description.length > 0);
      assert.ok(p.prompt.length > 50);
      assert.equal(p.scope, "global");
    }
  });
});
