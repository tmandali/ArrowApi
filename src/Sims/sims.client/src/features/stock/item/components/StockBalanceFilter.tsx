import * as React from "react"
import { RotateCcw } from "lucide-react"
import {
  SchemaCriteriaFilter,
  type JsonSchemaObject,
  type SchemaCriteriaFilterHandle,
} from "@/features/report-criteria"
import {
  ArrowJobExecutionsPanel,
  type ArrowJobExecutionsPanelProps,
} from "@/features/jobs"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"
import stockBalanceCriteriaSchema from "../schemas/stock-balance-criteria.schema.json"

const STOCK_BALANCE_JOBS = "/api/arrow/jobs/stock-balance"
const stockBalanceSchema = stockBalanceCriteriaSchema as JsonSchemaObject

export type StockBalanceJobSession = Pick<
  ArrowJobExecutionsPanelProps,
  | "activeJobId"
  | "activeLiveStatus"
  | "activeRequestJson"
  | "activeRunEvents"
  | "activeRunPhase"
  | "onOpenJob"
  | "onJobSelect"
  | "pendingJobs"
  | "listRefreshToken"
  | "onListError"
> & {
  /** New / empty list → show criteria grid in the Detail column. */
  composing?: boolean
  onExitCompose?: () => void
  onJobDeleted?: (jobId: string) => void
  onListLoaded?: (count: number) => void
}

export const StockBalanceFilter = React.forwardRef<
  SchemaCriteriaFilterHandle,
  {
    className?: string
    jobSession?: StockBalanceJobSession
    onRun?: () => void
    runDisabled?: boolean
  }
>(function StockBalanceFilter(
  { className, jobSession, onRun, runDisabled = false },
  ref
) {
  const composing = Boolean(jobSession?.composing)
  const filterRef = React.useRef<SchemaCriteriaFilterHandle>(null)

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
        jobsEndpoint={STOCK_BALANCE_JOBS}
        jobName="stock-balance"
        emptyListHint="Past Stock Balance jobs"
        activeJobId={jobSession?.activeJobId}
        activeLiveStatus={jobSession?.activeLiveStatus}
        activeRequestJson={jobSession?.activeRequestJson}
        activeRunEvents={jobSession?.activeRunEvents}
        activeRunPhase={jobSession?.activeRunPhase}
        onOpenJob={jobSession?.onOpenJob}
        onJobSelect={(jobId) => {
          jobSession?.onExitCompose?.()
          jobSession?.onJobSelect?.(jobId)
        }}
        onJobDeleted={jobSession?.onJobDeleted}
        onListLoaded={jobSession?.onListLoaded}
        onListError={jobSession?.onListError}
        pendingJobs={jobSession?.pendingJobs}
        listRefreshToken={jobSession?.listRefreshToken}
        detailSlot={
          composing ? (
            <SchemaCriteriaFilter
              key="stock-balance-criteria"
              ref={filterRef}
              schema={stockBalanceSchema}
              showHeader={false}
              showFooterClear={false}
              className="h-full min-h-0 min-w-0"
            />
          ) : undefined
        }
        detailSlotActions={
          composing ? (
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
          ) : undefined
        }
        className="min-h-0 flex-1"
      />
    </div>
  )
})
