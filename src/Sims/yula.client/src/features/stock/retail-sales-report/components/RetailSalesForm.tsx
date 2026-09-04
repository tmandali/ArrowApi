"use client";

import * as React from "react"
import { useArrowJobRunner } from "@/features/jobs"
import { selectPendingRetailSalesJob } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs"
import { ReportCriteriaShell } from "@/features/reports/components/ReportCriteriaShell"
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
    <ReportCriteriaShell
      mode="retail-sales-report"
      title="Retail Sales"
      workspaceId="stock"
      schema={retailSalesCriteriaSchema as JsonSchemaObject}
      activeJobId={activeJobId}
      onJobCreated={handleJobCreated}
      onStartNewReport={() => {
        setComposing(true)
        handleSelectJob(null)
      }}
      renderFilter={(filterRef, { onRun, runDisabled, onListError }) => (
        <RetailSalesFilter
          ref={filterRef}
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
