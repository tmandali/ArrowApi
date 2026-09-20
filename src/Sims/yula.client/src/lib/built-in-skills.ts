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
import xlsxMd from "../../skills/xlsx/SKILL.md";
import pdfMd from "../../skills/pdf/SKILL.md";
import mcpBuilderMd from "../../skills/mcp-builder/SKILL.md";
import frontendDesignMd from "../../skills/frontend-design/SKILL.md";
import skillCreatorMd from "../../skills/skill-creator/SKILL.md";

const SOURCES: Array<{ md: string; fallback: string }> = [
  { md: ayKapanisMd, fallback: "ay-kapanis" },
  { md: sayimFarkMd, fallback: "sayim-fark" },
  { md: raporKaliteMd, fallback: "rapor-kalite" },
  { md: xlsxMd, fallback: "xlsx" },
  { md: pdfMd, fallback: "pdf" },
  { md: mcpBuilderMd, fallback: "mcp-builder" },
  { md: frontendDesignMd, fallback: "frontend-design" },
  { md: skillCreatorMd, fallback: "skill-creator" },
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

/** Yerleşik SKILL.md ham kaynakları (slash → dosya içeriği). */
export const BUILT_IN_SKILL_SOURCES: Record<string, string> = Object.fromEntries(
  BUILT_IN_USER_SKILLS.map((s, i) => [s.slash, SOURCES[i].md]),
);
