"use client";

import * as React from "react"
import { Activity, Ban } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "@/components/ui/code-block"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  panelCardClass,
  panelHeaderActionClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome"
import {
  criteriaInstanceToRows,
  SchemaCriteriaFilter,
  type JsonSchemaObject,
} from "@/features/report-criteria"
import { statusTone } from "@/features/jobs/lib/status-tone"
import type { RunEventItem } from "@/features/jobs/run-events"
import { RunProgressSteps } from "./RunProgressSteps"
import { cn } from "@/utils/cn"

export type ArrowJobLivePanelProps = {
  /** Criteria schema of the report — renders the read-only criteria grid. */
  schema?: JsonSchemaObject
  /** Submitted request JSON of the running job. */
  requestJson?: string | null
  /** SSE (live or replayed history) progress steps. */
  events: RunEventItem[]
  phase: "idle" | "running" | "done" | "cancelled"
  running: boolean
  /** Event-log (history) request in flight. */
  loading?: boolean
  liveStatus?: string
  cancelling?: boolean
  onCancel?: () => void
  className?: string
}

/**
 * Panel 2 of the report run flow: takes over the criteria column while the
 * job is in-flight and mirrors the submitted criteria (read-only grid) above
 * the live SSE progress stream. Criteria panel stays closed until the run
 * reaches a terminal state.
 */
export function ArrowJobLivePanel({
  schema,
  requestJson,
  events,
  phase,
  running,
  loading = false,
  liveStatus,
  cancelling = false,
  onCancel,
  className,
}: ArrowJobLivePanelProps) {
  const { criteriaRows, parsed } = React.useMemo(() => {
    if (!schema || !requestJson?.trim()) {
      return { criteriaRows: [], parsed: false }
    }
    try {
      const instance = JSON.parse(requestJson) as unknown
      return {
        criteriaRows: criteriaInstanceToRows(instance, schema),
        parsed: true,
      }
    } catch {
      return { criteriaRows: [], parsed: false }
    }
  }, [schema, requestJson])

  const showCriteriaGrid = Boolean(schema) && parsed

  return (
    <section className={cn(panelCardClass, "h-full min-h-0 min-w-0", className)}>
      <div className={panelHeaderClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Activity className={panelHeaderIconClass} aria-hidden />
            <span className={panelHeaderTitleClass}>Live progress</span>
          </div>
          {liveStatus ? (
            <Badge
              variant={statusTone(liveStatus)}
              className="h-5 shrink-0 px-1.5 text-[10px]"
            >
              {liveStatus}
            </Badge>
          ) : null}
        </div>
        {onCancel ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                panelHeaderActionClass,
                "gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              )}
              disabled={cancelling}
              onClick={onCancel}
            >
              <Ban className="size-3.5" />
              {cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-[35%] min-h-0 shrink-0 flex-col overflow-hidden border-b border-border/60">
          <div className="shrink-0 px-3 pb-1 pt-2 text-[11px] text-muted-foreground">
            Criteria
          </div>
          <div className="min-h-0 flex-1 px-2 pb-1">
            {showCriteriaGrid && schema ? (
              <SchemaCriteriaFilter
                schema={schema}
                rows={criteriaRows}
                readOnly
                showHeader={false}
                showFooterClear={false}
                className="h-full min-h-0 min-w-0"
              />
            ) : (
              <div className="h-full min-h-0 overflow-auto">
                <CodeBlock
                  value={requestJson?.trim() || "{\n  \n}"}
                  language="json"
                  className="min-h-24 rounded-none border-0"
                />
              </div>
            )}
          </div>
        </div>

        <ScrollArea className="h-0 min-h-0 w-full flex-1">
          <div className="px-4 py-3">
            <div className="text-[11px] text-muted-foreground">Progress</div>
            <RunProgressSteps
              events={events}
              phase={phase}
              running={running}
              loading={loading}
              runningOnly
              className="mt-2"
            />
          </div>
        </ScrollArea>
      </div>
    </section>
  )
}
