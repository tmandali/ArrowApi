import * as React from "react"
import { useArrowJobRunner } from "@/features/jobs"
import { selectPendingStockBalanceJob } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs"
import { ItemForm } from "./ItemForm"

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

  return (
    <ItemForm
      mode="stock-balance"
      tabs={[]}
      onStartNewReport={() => {
        setComposing(true)
        handleSelectJob(null)
      }}
      onStockBalanceJobCreated={handleJobCreated}
      stockBalanceJobSession={{
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
