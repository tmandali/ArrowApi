"use client";

import * as React from "react"
import { useArrowJobRunner } from "@/features/jobs"
import { selectPendingStockAnalyticsJob } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs"
import { ReportCriteriaShell } from "@/features/reports/components/ReportCriteriaShell"
import type { JsonSchemaObject } from "@/features/report-criteria"
import stockAnalyticsCriteriaSchema from "../schemas/stock-analytics-criteria.schema.json"
import { StockAnalyticsFilter } from "./StockAnalyticsFilter"

const STOCK_ANALYTICS_PATH = "/stock/stock-analytics"
const STOCK_ANALYTICS_JOBS = "/api/arrow/jobs/stock-analytics"

export function StockAnalyticsForm() {
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
    handleJobDeleted,
    handleNavigateToJob,
    jobHref,
  } = useArrowJobRunner({
    jobName: "stock-analytics",
    title: "Stock Analytics",
    basePath: STOCK_ANALYTICS_PATH,
    jobsEndpoint: STOCK_ANALYTICS_JOBS,
    workspace: "/stock",
    selectPendingJob: selectPendingStockAnalyticsJob,
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

  React.useEffect(() => {
    const handleOpenCompose = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: string }>).detail
      if (!detail?.scope || detail.scope === "stock-analytics") {
        setComposing(true)
        handleSelectJob(null)
      }
    }
    window.addEventListener("yula:open-compose", handleOpenCompose)
    return () => window.removeEventListener("yula:open-compose", handleOpenCompose)
  }, [setComposing, handleSelectJob])

  return (
    <ReportCriteriaShell
      mode="stock-analytics"
      title="Stock Analytics"
      workspaceId="stock"
      schema={stockAnalyticsCriteriaSchema as JsonSchemaObject}
      activeJobId={activeJobId}
      onJobCreated={handleJobCreated}
      onStartNewReport={() => {
        setComposing(true)
        handleSelectJob(null)
      }}
      renderFilter={(registerFilter, { onRun, runDisabled, onListError }) => (
        <StockAnalyticsFilter
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
            onExitCompose: handleExitCompose,
            onJobSelect: handleJobSelect,
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
