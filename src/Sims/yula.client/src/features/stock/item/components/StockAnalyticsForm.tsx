"use client";

import * as React from "react"
import { useArrowJobRunner } from "@/features/jobs"
import { selectPendingStockAnalyticsJob } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs"
import { StockModuleShell } from "./StockModuleShell"

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
    (jobId: string) => {
      setComposing(false)
      handleSelectJob({ id: jobId, status: "Queued", jobUrl: "", eventsUrl: "" })
    },
    [setComposing, handleSelectJob]
  )

  return (
    <StockModuleShell
      mode="stock-analytics"
      tabs={[]}
      onStartNewReport={() => {
        setComposing(true)
        handleSelectJob(null)
      }}
      onStockAnalyticsJobCreated={handleJobCreated}
      stockAnalyticsJobSession={{
        activeJobId,
        activeLiveStatus,
        activeRequestJson,
        activeRunEvents,
        activeRunPhase,
        composing,
        pendingJobs,
        listRefreshToken,
        onExitCompose: () => setComposing(false),
        onJobSelect: handleJobSelect,
        onOpenJob: handleNavigateToJob,
        openJobHref: jobHref,
        onJobDeleted: handleJobDeleted,
        onListLoaded: (count) => {
          if (count === 0) setComposing(true)
        },
      }}
    />
  )
}
