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
      return (
        autoReportCardConfigs.some((c) => c.kind === prop) ||
        yulaReportCardConfigs.some((c) => c.kind === prop)
      );
    },
  }
);
