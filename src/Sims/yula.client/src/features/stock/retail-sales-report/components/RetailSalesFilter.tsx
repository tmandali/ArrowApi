"use client";

import * as React from "react"
import { useAgentCriteriaStore } from "@/hooks/use-agent-criteria-bridge"
import { RotateCcw } from "lucide-react"
import {
  SchemaCriteriaFilter,
  type JsonSchemaObject,
  type SchemaCriteriaFilterHandle,
  useSharedCriteriaDraft,
} from "@/features/report-criteria"
import {
  ArrowJobExecutionsPanel,
  ArrowJobResultPanel,
  type ArrowJobExecutionsPanelProps,
} from "@/features/jobs"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"
import retailSalesCriteriaSchema from "../schemas/retail-sales-criteria.schema.json"

const RETAIL_SALES_JOBS = "/api/arrow/jobs/retail-sales-report"
const retailSalesSchema = retailSalesCriteriaSchema as JsonSchemaObject

export type RetailSalesJobSession = Pick<
  ArrowJobExecutionsPanelProps,
  | "activeJobId"
  | "activeLiveStatus"
  | "activeRequestJson"
  | "activeRunEvents"
  | "activeRunPhase"
  | "onOpenJob"
  | "openJobHref"
  | "onJobSelect"
  | "pendingJobs"
  | "listRefreshToken"
  | "onListError"
> & {
  /** New / empty list → show criteria grid in the Detail column. */
  composing?: boolean
  /** Aktif job çalışıyor → kriter gridi + Run/Clear kilitli. */
  criteriaLocked?: boolean
  onExitCompose?: () => void
  onJobCancelled?: (jobId: string) => void
  onJobDeleted?: (jobId: string) => void
  onListLoaded?: (count: number) => void
}

export const RetailSalesFilter = React.forwardRef<
  SchemaCriteriaFilterHandle,
  {
    className?: string
    jobSession?: RetailSalesJobSession
    onRun?: () => void
    runDisabled?: boolean
  }
>(function RetailSalesFilter(
  { className, jobSession, onRun, runDisabled = false },
  ref
) {
  const composing = Boolean(jobSession?.composing)
  const criteriaLocked = Boolean(jobSession?.criteriaLocked)
  const filterRef = React.useRef<SchemaCriteriaFilterHandle>(null)
  const aiFilled = useAgentCriteriaStore(
    (state) => state.aiFilledCriteria["retail-sales-report"]
    );
  const aiFilledNames = React.useMemo(
    () => (aiFilled && Date.now() - aiFilled.at < 10 * 60_000 ? aiFilled.names : []),
    [aiFilled]
  )

  const { rows, setRows } = useSharedCriteriaDraft(
    "retail-sales-report",
    retailSalesSchema
  )

  const renderResult = React.useCallback(
    (jobId: string) => (
      <ArrowJobResultPanel
        jobId={jobId}
        title="Retail Sales"
        className="min-h-0 flex-1"
      />
    ),
    []
  )


  React.useImperativeHandle(
    ref,
    () => ({
      submit: () => {
        const handle = filterRef.current
        if (!handle) {
          return {
            valid: false,
            instance: {},
            errors: [{ fieldKey: "", message: "Criteria is not ready" }],
            ajvErrors: [],
          }
        }
        return handle.submit()
      },
      clear: () => filterRef.current?.clear(),
    }),
    []
  )

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden px-2 pb-2 pt-0",
        className
      )}
    >
      <ArrowJobExecutionsPanel
        jobsEndpoint={RETAIL_SALES_JOBS}
        jobName="retail-sales-report"
        emptyListHint="Past Retail Sales jobs"
        activeJobId={jobSession?.activeJobId}
        activeLiveStatus={jobSession?.activeLiveStatus}
        activeRequestJson={jobSession?.activeRequestJson}
        activeRunEvents={jobSession?.activeRunEvents}
        activeRunPhase={jobSession?.activeRunPhase}
        onOpenJob={jobSession?.onOpenJob}
        openJobHref={jobSession?.openJobHref}
        onJobSelect={(jobId) => {
          jobSession?.onExitCompose?.()
          jobSession?.onJobSelect?.(jobId)
        }}
        onJobCancelled={jobSession?.onJobCancelled}
        onJobDeleted={jobSession?.onJobDeleted}
        onListLoaded={jobSession?.onListLoaded}
        onListError={jobSession?.onListError}
        pendingJobs={jobSession?.pendingJobs}
        listRefreshToken={jobSession?.listRefreshToken}
        detailSlot={
          <SchemaCriteriaFilter
            key="retail-sales-report-criteria"
            ref={filterRef}
            highlightRowNames={aiFilledNames}
            schema={retailSalesSchema}
            rows={rows}
            onRowsChange={setRows}
            showHeader={false}
            showFooterClear={false}
            className="h-full min-h-0 min-w-0"
          />
        }
        detailSlotActions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2.5 text-xs"
              disabled={criteriaLocked}
              onClick={() => filterRef.current?.clear()}
            >
              <RotateCcw className="size-3.5" />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              disabled={runDisabled || criteriaLocked}
              onClick={() => onRun?.()}
            >
              Run
            </Button>
          </>
        }
        criteriaActive={composing}
        criteriaSchema={retailSalesSchema}
        renderResult={renderResult}
        className="min-h-0 flex-1"
      />
    </div>
  )
})
