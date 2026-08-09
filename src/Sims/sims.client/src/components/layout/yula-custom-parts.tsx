import * as React from "react"
import { YulaReportCriteriaCard } from "@/components/layout/yula-components"
import { yulaReportCardConfigs } from "@/components/layout/yula-components-data"

/** kind → React component to embed inside a message. */
export const yulaCustomPartComponents: Record<
  string,
  React.ComponentType<Record<string, unknown>>
> = Object.fromEntries(
  yulaReportCardConfigs.map((config) => [
    config.kind,
    () => <YulaReportCriteriaCard config={config} />,
  ])
)
