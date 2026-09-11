"use client";

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Ban, FileText, Loader2, Table2, Trash2 } from "lucide-react"
import { sameJobId, useArrowJobRunner, type ArrowJobStatus } from "@/features/jobs"
import {
  selectPendingJobByName,
  type TrackedJob,
} from "@/store/slices/active-jobs-store"
import { Button } from "@/components/ui/button"
import {
  readJobEndpoint,
  type JsonSchemaObject,
} from "@/features/report-criteria"
import type { WorkspaceKey } from "@/lib/workspace"
import { ReportCriteriaShell } from "./ReportCriteriaShell"
import { ReportModuleFilter } from "./ReportModuleFilter"

export type ReportModuleFormProps = {
  /** Draft / AI / job list kimliği (`x-scope`). */
  scope: string
  /** Header ve result panel başlığı. */
  title: string
  schema: JsonSchemaObject
  /** Örn. `/stock/retail-sales-report` */
  pagePath: string
  /** Örn. `stock` — AI screen context + pending job workspace. */
  workspace: string
}

function toWorkspaceKey(workspace: string): WorkspaceKey {
  const normalized = workspace.startsWith("/") ? workspace : `/${workspace}`
  switch (normalized) {
    case "/stock":
    case "/selling":
    case "/accounting":
    case "/manufacturing":
    case "/subcontracting":
      return normalized
    default:
      return "/stock"
  }
}

/**
 * Schema-driven standart rapor ekranı (kriter + executions + Arrow sonuç).
 * Workspace Form dosyaları yalnızca ince wrapper olur.
 */
export function ReportModuleForm({
  scope,
  title,
  schema,
  pagePath,
  workspace,
}: ReportModuleFormProps) {
  const workspaceKey = toWorkspaceKey(workspace)
  const jobsEndpoint = readJobEndpoint(schema) ?? `/api/arrow/jobs/${scope}`

  const selectPendingJob = React.useCallback(
    (jobs: Record<string, TrackedJob>) =>
      selectPendingJobByName(jobs, scope, workspaceKey),
    [scope, workspaceKey]
  )

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
    jobName: scope,
    title,
    basePath: pagePath,
    jobsEndpoint,
    workspace: workspaceKey,
    selectPendingJob,
  })

  // New'e geçerken bırakılan seçim — Vazgeç buraya döner (skill/agent deseni).
  const [lastJobId, setLastJobId] = React.useState<string | null>(null)

  const handleJobCreated = React.useCallback(
    (job: ArrowJobStatus, request: Record<string, unknown>) => {
      setLastJobId(null)
      handleSubmitted(job, request)
    },
    [handleSubmitted]
  )

  const [viewMode, setViewMode] = React.useState<"result" | "detail">("result")
  const [selectedCompleted, setSelectedCompleted] = React.useState(false)

  const [canDelete, setCanDelete] = React.useState(false)
  const deleteJobRef = React.useRef<(() => void) | null>(null)
  const [canCancel, setCanCancel] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const cancelJobRef = React.useRef<(() => void) | null>(null)

  const handleSelectedCompletedChange = React.useCallback(
    (isCompleted: boolean) => {
      setSelectedCompleted(isCompleted)
      if (!isCompleted) setViewMode("result")
    },
    []
  )

  const handleToggleViewMode = React.useCallback(() => {
    setViewMode((prev) => (prev === "detail" ? "result" : "detail"))
  }, [])

  const handleJobSelect = React.useCallback(
    (jobId: string, job?: ArrowJobStatus) => {
      setLastJobId(null)
      setComposing(false)
      setViewMode("result")
      handleSelectJob(job ?? jobId)
    },
    [setComposing, handleSelectJob]
  )

  // ?jobId= ile gelinirse satır tıklamasıyla BİREBİR aynı yol işletilir
  // (compose kapat + result görünümü + seç). Query başına tek atış; kullanıcı
  // başka satıra geçerse geri çekilmez.
  const searchParams = useSearchParams()
  const queryJobId = searchParams.get("jobId") || searchParams.get("job")
  const autoQuerySelectRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!queryJobId) return
    if (
      autoQuerySelectRef.current &&
      sameJobId(autoQuerySelectRef.current, queryJobId)
    ) {
      return
    }
    if (sameJobId(activeJobId, queryJobId)) {
      autoQuerySelectRef.current = queryJobId
      return
    }
    autoQuerySelectRef.current = queryJobId
    // eslint-disable-next-line react/set-state-in-effect -- URL query → seçim tek-atış senkronu (harici navigasyon; ref guard'lı, loop yok)
    handleJobSelect(queryJobId)
  }, [queryJobId, activeJobId, handleJobSelect])

  const handleStartNewReport = React.useCallback(() => {
    setLastJobId((prev) => prev ?? activeJobId)
    setViewMode("result")
    setSelectedCompleted(false)
    setCanDelete(false)
    setCanCancel(false)
    setComposing(true)
    handleSelectJob(null)
  }, [activeJobId, handleSelectJob, setComposing])

  const handleCancelNewReport = React.useCallback(() => {
    const restoreId = lastJobId
    setLastJobId(null)
    setViewMode("result")
    setComposing(false)
    if (restoreId) handleSelectJob(restoreId)
  }, [lastJobId, handleSelectJob, setComposing])

  const isNewMode = composing && lastJobId != null

  const handleExitCompose = React.useCallback(() => {
    setComposing(false)
  }, [setComposing])

  const handleListLoaded = React.useCallback(
    (count: number) => {
      if (count === 0) setComposing(true)
    },
    [setComposing]
  )

  const criteriaLocked = Boolean(activeJobId) && activeRunPhase === "running"

  React.useEffect(() => {
    const handleOpenCompose = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: string }>).detail
      if (!detail?.scope || detail.scope === scope) {
        handleStartNewReport()
      }
    }
    window.addEventListener("yula:open-compose", handleOpenCompose)
    return () => window.removeEventListener("yula:open-compose", handleOpenCompose)
  }, [scope, handleStartNewReport])

  const headerActions =
    selectedCompleted || canDelete || canCancel ? (
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
            aria-label={viewMode === "detail" ? "Show Grid" : "Show Detail"}
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
      mode={scope}
      title={title}
      workspaceId={workspace}
      schema={schema}
      activeJobId={activeJobId}
      recordMode={composing ? "new" : "view"}
      recordModeLabels={{ new: "New", view: "View" }}
      headerActions={headerActions}
      onJobCreated={handleJobCreated}
      onStartNewReport={handleStartNewReport}
      onCancelNewReport={handleCancelNewReport}
      isNewMode={isNewMode}
      criteriaLocked={criteriaLocked}
      renderFilter={(registerFilter, { onListError }) => (
        <ReportModuleFilter
          ref={registerFilter}
          schema={schema}
          jobsEndpoint={jobsEndpoint}
          jobName={scope}
          title={title}
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
        />
      )}
    />
  )
}
