"use client";

import * as React from "react"
import { useArrowJobRunner } from "@/features/jobs"
import { selectPendingRetailSalesJob } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs"
import { StockModuleShell } from "./StockModuleShell"

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
      if (!detail?.scope || detail.scope === "retail-sales-report") {
        setComposing(true)
        handleSelectJob(null)
      }
    }
    window.addEventListener("yula:open-compose", handleOpenCompose)
    return () => window.removeEventListener("yula:open-compose", handleOpenCompose)
  }, [setComposing, handleSelectJob])

  return (
    <StockModuleShell
      mode="retail-sales-report"
      tabs={[]}
      onStartNewReport={() => {
        setComposing(true)
        handleSelectJob(null)
      }}
      onRetailSalesJobCreated={handleJobCreated}
      retailSalesJobSession={{
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
      }}
    />
  )
}
