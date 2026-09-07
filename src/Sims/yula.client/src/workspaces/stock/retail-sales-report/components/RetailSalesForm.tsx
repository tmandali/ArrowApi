"use client";

import * as React from "react"
import { Ban, FileText, Loader2, Table2, Trash2 } from "lucide-react"
import { useArrowJobRunner } from "@/features/jobs"
import { selectPendingRetailSalesJob } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs"
import { ReportCriteriaShell } from "@/features/reports/components/ReportCriteriaShell"
import { Button } from "@/components/ui/button"
import type { JsonSchemaObject } from "@/features/report-criteria"
import retailSalesCriteriaSchema from "../schemas/retail-sales-criteria.schema.json"
import { RetailSalesFilter } from "./RetailSalesFilter"

const RETAIL_SALES_PATH = "/stock/retail-sales-report"
const RETAIL_SALES_JOBS = "/api/arrow/jobs/retail-sales-report"

export function RetailSalesForm() {
  const {
    composing,
    setComposing,
    activeJobId,
    activeLiveStatus,
    activeRequestJson,
    activeRunEvents,
    activeRunPhase,
    pendingJobs,
    listRefreshToken,
    handleSubmitted,
    handleSelectJob,
    handleJobCancelled,
    handleJobDeleted,
    handleNavigateToJob,
    jobHref,
  } = useArrowJobRunner({
    jobName: "retail-sales-report",
    title: "Retail Sales",
    basePath: RETAIL_SALES_PATH,
    jobsEndpoint: RETAIL_SALES_JOBS,
    workspace: "/stock",
    selectPendingJob: selectPendingRetailSalesJob,
  })

  const handleJobCreated = React.useCallback(
    (job: ArrowJobStatus, request: Record<string, unknown>) => {
      handleSubmitted(job, request)
    },
    [handleSubmitted]
  )

  const handleJobSelect = React.useCallback(
    (jobId: string, job?: ArrowJobStatus) => {
      setComposing(false)
      handleSelectJob(job ?? jobId)
    },
    [setComposing, handleSelectJob]
  )

  const handleExitCompose = React.useCallback(() => {
    setComposing(false)
  }, [setComposing])

  const handleListLoaded = React.useCallback(
    (count: number) => {
      if (count === 0) setComposing(true)
    },
    [setComposing]
  )

  /** Aktif job in-flight iken kriter gridi + Run/Clear kilitlenir. */
  const criteriaLocked = Boolean(activeJobId) && activeRunPhase === "running"

  const [viewMode, setViewMode] = React.useState<"result" | "detail">("result")
  const [selectedCompleted, setSelectedCompleted] = React.useState(false)

  const handleSelectedCompletedChange = React.useCallback((isCompleted: boolean) => {
    setSelectedCompleted(isCompleted)
    if (!isCompleted) {
      setViewMode("result")
    }
  }, [])

  const handleToggleViewMode = React.useCallback(() => {
    setViewMode((prev) => (prev === "detail" ? "result" : "detail"))
  }, [])

  React.useEffect(() => {
    const handleOpenCompose = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: string }>).detail
      if (!detail?.scope || detail.scope === "retail-sales-report") {
        setComposing(true)
        handleSelectJob(null)
      }
    }
    window.addEventListener("yula:open-compose", handleOpenCompose)
    return () => window.removeEventListener("yula:open-compose", handleOpenCompose)
  }, [setComposing, handleSelectJob])

  const [canDelete, setCanDelete] = React.useState(false)
  const deleteJobRef = React.useRef<(() => void) | null>(null)
  const [canCancel, setCanCancel] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const cancelJobRef = React.useRef<(() => void) | null>(null)

  const headerActions = selectedCompleted || canDelete || canCancel ? (
    <div className="flex shrink-0 items-center gap-1.5">
      {canCancel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cancelling}
          className="h-7 gap-1.5 px-2.5 text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
          onClick={() => cancelJobRef.current?.()}
          title="Çalışan işi iptal et"
          aria-label="Çalışan işi iptal et"
        >
          {cancelling ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Ban className="size-3.5" />
          )}
          {cancelling ? "Cancelling…" : "Cancel"}
        </Button>
      ) : null}
      {selectedCompleted ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={handleToggleViewMode}
          title={viewMode === "detail" ? "Show Grid" : "Show Detail"}
        >
          {viewMode === "detail" ? (
            <>
              <Table2 className="size-3.5" />
              Grid
            </>
          ) : (
            <>
              <FileText className="size-3.5" />
              Detail
            </>
          )}
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => deleteJobRef.current?.()}
          title="Execution'ı sil"
          aria-label="Execution'ı sil"
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      ) : null}
    </div>
  ) : undefined

  return (
    <ReportCriteriaShell
      mode="retail-sales-report"
      title="Retail Sales"
      workspaceId="stock"
      schema={retailSalesCriteriaSchema as JsonSchemaObject}
      activeJobId={activeJobId}
      headerActions={headerActions}
      onJobCreated={handleJobCreated}
      onStartNewReport={() => {
        setViewMode("result")
        setSelectedCompleted(false)
        setCanDelete(false)
        setCanCancel(false)
        setComposing(true)
        handleSelectJob(null)
      }}
      renderFilter={(registerFilter, { onRun, runDisabled, onListError }) => (
        <RetailSalesFilter
          ref={registerFilter}
          jobSession={{
            activeJobId,
            activeLiveStatus,
            activeRequestJson,
            activeRunEvents,
            activeRunPhase,
            composing,
            criteriaLocked,
            pendingJobs,
            listRefreshToken,
            viewMode,
            onViewModeChange: setViewMode,
            onSelectedCompletedChange: handleSelectedCompletedChange,
            deleteJobTriggerRef: deleteJobRef,
            onCanDeleteChange: setCanDelete,
            cancelJobTriggerRef: cancelJobRef,
            onCanCancelChange: setCanCancel,
            onCancellingChange: setCancelling,
            onExitCompose: handleExitCompose,
            onJobSelect: handleJobSelect,
            onJobCancelled: handleJobCancelled,
            onOpenJob: handleNavigateToJob,
            openJobHref: jobHref,
            onJobDeleted: handleJobDeleted,
            onListLoaded: handleListLoaded,
            onListError,
          }}
          onRun={onRun}
          runDisabled={runDisabled}
        />
      )}
    />
  )
}
