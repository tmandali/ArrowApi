/**
 * Agent Skills keşfi (cookbook: agent-skills Steps 2-4) — dosya sistemi
 * soyutlaması üzerinden çalışır; saf ayrıştırıcılar + sandbox güdümlü keşif.
 * `Sandbox` tipi server modülünden yalnızca tip olarak alınır (istemci
 * demetine node kodu girmez).
 */
import { load } from "js-yaml";
import type { Sandbox } from "@/lib/skill-sandbox";

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

/**
 * Dizinleri tarar, SKILL.md metaverisini toplar. Aynı isimde ilk
 * bulunan kazanır (proje geçersiz kılmaya izin verir).
 */
export async function discoverSkills(
  sandbox: Pick<Sandbox, "readdir" | "readFile">,
  directories: string[],
): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];
  const seenNames = new Set<string>();
  for (const dir of directories) {
    let entries;
    try {
      entries = await sandbox.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = `${dir}/${entry.name}`;
      try {
        const content = await sandbox.readFile(`${skillDir}/SKILL.md`, "utf-8");
        const parsed = parseSkillFile(content, entry.name);
        if (seenNames.has(parsed.name)) continue;
        seenNames.add(parsed.name);
        skills.push({
          name: parsed.name,
          slash: parsed.slash,
          label: parsed.label,
          description: parsed.description,
          scope: parsed.scope,
          path: skillDir,
        });
      } catch {
        continue;
      }
    }
  }
  return skills;
}
