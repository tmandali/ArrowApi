"use client";

import * as React from "react"
import { useArrowJobRunner } from "@/features/jobs"
import { selectPendingStockBalanceJob } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs"
import { ReportCriteriaShell } from "@/features/reports/components/ReportCriteriaShell"
import type { JsonSchemaObject } from "@/features/report-criteria"
import stockBalanceCriteriaSchema from "../schemas/stock-balance-criteria.schema.json"
import { StockBalanceFilter } from "./StockBalanceFilter"

const STOCK_BALANCE_PATH = "/stock/stock-balance"
const STOCK_BALANCE_JOBS = "/api/arrow/jobs/stock-balance"

export function StockBalanceForm() {
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
    jobName: "stock-balance",
    title: "Stock Balance",
    basePath: STOCK_BALANCE_PATH,
    jobsEndpoint: STOCK_BALANCE_JOBS,
    workspace: "/stock",
    selectPendingJob: selectPendingStockBalanceJob,
  })

  const handleJobCreated = React.useCallback(
    (job: ArrowJobStatus, request: Record<string, unknown>) => {
      handleSubmitted(job, request)
    },
    [handleSubmitted]
  )

  const handleJobSelect = React.useCallback(
    (jobId: string) => {
      setComposing(false)
      handleSelectJob({ id: jobId, status: "Queued", jobUrl: "", eventsUrl: "" })
    },
    [setComposing, handleSelectJob]
  )

  /** Aktif job in-flight iken kriter gridi + Run/Clear kilitlenir. */
  const criteriaLocked = Boolean(activeJobId) && activeRunPhase === "running"

  React.useEffect(() => {
    const handleOpenCompose = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: string }>).detail
      if (!detail?.scope || detail.scope === "stock-balance") {
        setComposing(true)
        handleSelectJob(null)
      }
    }
    window.addEventListener("yula:open-compose", handleOpenCompose)
    return () => window.removeEventListener("yula:open-compose", handleOpenCompose)
  }, [setComposing, handleSelectJob])

  return (
    <ReportCriteriaShell
      mode="stock-balance"
      title="Stock Balance"
      workspaceId="stock"
      schema={stockBalanceCriteriaSchema as JsonSchemaObject}
      activeJobId={activeJobId}
      onJobCreated={handleJobCreated}
      onStartNewReport={() => {
        setComposing(true)
        handleSelectJob(null)
      }}
      renderFilter={(registerFilter, { onRun, runDisabled, onListError }) => (
        <StockBalanceFilter
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
            onExitCompose: () => setComposing(false),
            onJobSelect: handleJobSelect,
            onJobCancelled: handleJobCancelled,
            onOpenJob: handleNavigateToJob,
            openJobHref: jobHref,
            onJobDeleted: handleJobDeleted,
            onListLoaded: (count) => {
              if (count === 0) setComposing(true)
            },
            onListError,
          }}
          onRun={onRun}
          runDisabled={runDisabled}
        />
      )}
    />
  )
}
