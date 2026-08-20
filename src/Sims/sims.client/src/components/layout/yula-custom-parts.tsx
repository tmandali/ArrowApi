import * as React from "react"
import { YulaReportCriteriaCard } from "@/components/layout/yula-components"
import { yulaReportCardConfigs } from "@/components/layout/yula-components-data"
import { autoReportCardConfigs } from "@/lib/auto-report-registry"

/** Dynamic kind → React component map to embed inside messages. */
export const yulaCustomPartComponents: Record<
  string,
  React.ComponentType<Record<string, unknown>>
> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (typeof prop !== "string") return undefined;
      // 1. Check auto-discovered report configs
      const autoCfg = autoReportCardConfigs.find((c) => c.kind === prop);
      if (autoCfg) {
        return () => <YulaReportCriteriaCard config={autoCfg} />;
      }
      // 2. Check static fallback configs
      const staticCfg = yulaReportCardConfigs.find((c) => c.kind === prop);
      if (staticCfg) {
        return () => <YulaReportCriteriaCard config={staticCfg} />;
      }
      return undefined;
    },
    has(_target, prop: string) {
      return (
        autoReportCardConfigs.some((c) => c.kind === prop) ||
        yulaReportCardConfigs.some((c) => c.kind === prop)
      );
    },
  }
);
