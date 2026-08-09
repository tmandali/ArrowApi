import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SchemaCriteriaFilter, useSharedCriteriaDraft } from "@/features/report-criteria"
import type { YulaReportCardConfig } from "./yula-components-data"

export function YulaReportCriteriaCard({
  config,
}: {
  config: YulaReportCardConfig
}) {
  const navigate = useNavigate()
  const { rows, setRows } = useSharedCriteriaDraft(config.scope, config.schema)

  return (
    <div className="w-full max-w-[95%] overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold leading-none text-foreground">
            {config.title}
          </div>
          {config.description ? (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {config.description}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2.5 text-xs"
          onClick={() => navigate(config.pagePath)}
        >
          <ExternalLink className="size-3.5" />
          Sayfada aç
        </Button>
      </div>
      <SchemaCriteriaFilter
        schema={config.schema}
        rows={rows}
        onRowsChange={setRows}
        showHeader={false}
        showFooterClear={false}
        className="max-h-64"
      />
    </div>
  )
}
