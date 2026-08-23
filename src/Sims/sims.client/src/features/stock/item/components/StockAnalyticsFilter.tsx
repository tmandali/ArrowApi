import * as React from "react"
import { RotateCcw } from "lucide-react"
import {
  SchemaCriteriaFilter,
  type JsonSchemaObject,
  type SchemaCriteriaFilterHandle,
  useSharedCriteriaDraft,
} from "@/features/report-criteria"
import {
  ArrowJobExecutionsPanel,
  type ArrowJobExecutionsPanelProps,
} from "@/features/jobs"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"
import stockAnalyticsCriteriaJson from "../schemas/stock-analytics-criteria.schema.json"

const STOCK_ANALYTICS_JOBS = "/api/arrow/jobs/stock-analytics"
const stockAnalyticsSchema = stockAnalyticsCriteriaJson as unknown as JsonSchemaObject

export type StockAnalyticsJobSession = Pick<
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
  onExitCompose?: () => void
  onJobCancelled?: (jobId: string) => void
  onJobDeleted?: (jobId: string) => void
  onListLoaded?: (count: number) => void
}

export const StockAnalyticsFilter = React.forwardRef<
  SchemaCriteriaFilterHandle,
  {
    className?: string
    jobSession?: StockAnalyticsJobSession
    onRun?: () => void
    runDisabled?: boolean
  }
>(function StockAnalyticsFilter(
  { className, jobSession, onRun, runDisabled = false },
  ref
) {
  const composing = Boolean(jobSession?.composing)
  const filterRef = React.useRef<SchemaCriteriaFilterHandle>(null)
  const { rows, setRows } = useSharedCriteriaDraft(
    "stock-analytics",
    stockAnalyticsSchema
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
        jobsEndpoint={STOCK_ANALYTICS_JOBS}
        jobName="stock-analytics"
        emptyListHint="Past Stock Analytics jobs"
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
            key="stock-analytics-criteria"
            ref={filterRef}
            schema={stockAnalyticsSchema}
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
              onClick={() => filterRef.current?.clear()}
            >
              <RotateCcw className="size-3.5" />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              disabled={runDisabled}
              onClick={() => onRun?.()}
            >
              Run
            </Button>
          </>
        }
        criteriaActive={composing}
        className="min-h-0 flex-1"
      />
    </div>
  )
})
