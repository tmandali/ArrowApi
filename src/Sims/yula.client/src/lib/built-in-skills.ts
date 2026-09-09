/**
 * Yerleşik (built-in, silinemez) alan skill'leri.
 *
 * BUNDLER-ONLY MODÜL: skills dizinindeki standart SKILL.md dosyalarını ham
 * metin gömer (next.config *.md raw kuralı). tsx/node testleri bu modülü
 * İÇE AKTARAMAZ — içerik testleri skills/*.md dosyalarını fs ile okur
 * (built-in-skills.test.ts). Tek kaynak: skills/<ad>/SKILL.md.
 */
import { parseSkillFile } from "@/lib/skill-discovery";
import type { UserSkill } from "@/lib/yula-user-skill";
import ayKapanisMd from "../../skills/ay-kapanis/SKILL.md";
import sayimFarkMd from "../../skills/sayim-fark/SKILL.md";
import raporKaliteMd from "../../skills/rapor-kalite/SKILL.md";
import kapanisKontrolMd from "../../skills/ay-kapanis/references/kapanis-kontrol-listesi.md";

const SOURCES: Array<{ md: string; fallback: string }> = [
  { md: ayKapanisMd, fallback: "ay-kapanis" },
  { md: sayimFarkMd, fallback: "sayim-fark" },
  { md: raporKaliteMd, fallback: "rapor-kalite" },
];

export const BUILT_IN_USER_SKILLS: UserSkill[] = SOURCES.map(
  ({ md, fallback }) => {
    const p = parseSkillFile(md, fallback);
    return {
      id: `builtin-${p.slash}`,
      slash: p.slash,
      label: p.label,
      description: p.description,
      prompt: p.prompt,
      scope: p.scope,
      createdAt: 1,
      updatedAt: 1,
    };
  },
);

export interface BuiltInSkillFile {
  path: string;
  kind: "script" | "reference";
  /** Referans dokümanlarda ham içerik (önizleme için); betiklerde yok. */
  content?: string;
}

/** Skill paketi dosya envanteri (SKILL.md dışı): betikler + referanslar. */
export const BUILT_IN_SKILL_FILES: Record<string, BuiltInSkillFile[]> = {
  "ay-kapanis": [
    {
      path: "ay-kapanis/scripts/month-range.mjs",
      kind: "script",
    },
    {
      path: "ay-kapanis/references/kapanis-kontrol-listesi.md",
      kind: "reference",
      content: kapanisKontrolMd,
    },
  ],
  "sayim-fark": [],
  "rapor-kalite": [],
};
