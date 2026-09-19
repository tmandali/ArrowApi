/**
 * Agent Skills keşfi (cookbook: agent-skills Steps 2-4) — saf ayrıştırıcılar.
 * Yalnızca SKILL.md frontmatter + gövde ayrıştırma; dosya yürütme ve paket
 * keşfi kaldırılmıştır (skill'ler SKILL.md'den ibarettir).
 */
import { load } from "js-yaml";

export interface SkillMetadata {
  /** Standart skill adı */
  name: string;
  /** Slash tetikleyici (önsiz); belirtilmezse name kullanılır */
  slash: string;
  label: string;
  description: string;
  scope: string;
  /** Keşfedildiği dizin (dosya-tabanlı keşifte dolar) */
  path?: string;
}

export interface ParsedSkillFile extends SkillMetadata {
  /** Frontmatter'sız gövde = çalıştırılacak talimat prompt'u */
  prompt: string;
}

/** Frontmatter bloğunu ayırır (yoksa gövdenin tamamı prompt sayılır). */
export function stripSkillFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

function parseFrontmatterMap(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return {};
  try {
    const doc = load(match[1]) as Record<string, unknown> | null;
    if (!doc || typeof doc !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(doc)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * SKILL.md içeriğini ayrıştırır. Standart alanlar (name, description) +
 * bizim uzantılarımız (slash, label, scope; yoksa name/global varsayılır).
 */
export function parseSkillFile(
  content: string,
  fallbackName = "skill",
): ParsedSkillFile {
  const fm = parseFrontmatterMap(content);
  const prompt = stripSkillFrontmatter(content);
  const name = fm.name || fallbackName;
  return {
    name,
    slash: (fm.slash || name).trim().toLowerCase(),
    label: fm.label || name,
    description: fm.description || "",
    scope: (fm.scope || "global").trim().toLowerCase() || "global",
    prompt,
  };
}
