import * as React from "react"
import { YulaReportCriteriaCard } from "@/components/layout/yula-components"
import { yulaReportCardConfigs } from "@/components/layout/yula-components-data"
import { autoReportCardConfigs } from "@/lib/auto-report-registry"

/**
 * Skill kartları: src/skills/<klasör>/<klasör>.card.tsx konvansiyonu.
 *
 * Vite BUILD sırasında import.meta.glob dosyaları tarar ve derler; çalışma
 * anında yalnızca hazır modüller yüklenir. customKind = skill adı
 * (dosya adının ".card.tsx" öncesi kısmı) üzerinden eşleşir.
 */
const skillCardModules = import.meta.glob("../../skills/**/*.card.tsx", { eager: true })
const skillCards: Record<string, React.ComponentType<Record<string, unknown>>> = {}
for (const [path, mod] of Object.entries(skillCardModules)) {
  const stem = path.split("/").pop()!.replace(/\.card\.tsx$/, "")
  const comp = (mod as { default?: React.ComponentType<Record<string, unknown>> }).default
  if (comp) skillCards[stem] = comp
}

/** Dynamic kind → React component map to embed inside messages. */
export const yulaCustomPartComponents: Record<
  string,
  React.ComponentType<Record<string, unknown>>
> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (typeof prop !== "string") return undefined;
      // 0. Skill kartları: customKind = skill fonksiyon/klasör adı
      const SkillCard = skillCards[prop];
      if (SkillCard) return SkillCard;
      // 1. Check auto-discovered report configs
      const autoCfg = autoReportCardConfigs.find((c) => c.kind === prop);
      if (autoCfg) {
        return (props: Record<string, unknown>) => (
          <YulaReportCriteriaCard config={autoCfg} details={props.details as Record<string, any> | undefined} />
        );
      }
      // 2. Check static fallback configs
      const staticCfg = yulaReportCardConfigs.find((c) => c.kind === prop);
      if (staticCfg) {
        return (props: Record<string, unknown>) => (
          <YulaReportCriteriaCard config={staticCfg} details={props.details as Record<string, any> | undefined} />
        );
      }
      return undefined;
    },
    has(_target, prop: string) {
      if (typeof prop === "string" && skillCards[prop]) return true;
      return (
        autoReportCardConfigs.some((c) => c.kind === prop) ||
        yulaReportCardConfigs.some((c) => c.kind === prop)
      );
    },
  }
);
