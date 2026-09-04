"use client";

import * as React from "react"
import {
  Ban,
  CircleCheck,
  CircleX,
  Copy,
  FileText,
  Filter,
  History,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "@/components/ui/code-block"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Marker,
  MarkerContent,
} from "@/components/ui/marker"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePagePanel } from "@/hooks/use-page-panel"
import {
  panelCardClass,
  panelHeaderActionClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
  panelResizeHandleClass,
} from "@/components/layout/panel-chrome"
import {
  cancelArrowJob,
  deleteArrowJob,
  fetchJobEventLog,
  fetchJobRequest,
  listArrowJobs,
} from "@/features/jobs/arrow-job-client"
import { ArrowJobLivePanel } from "./ArrowJobLivePanel"
import { statusTone } from "@/features/jobs/lib/status-tone"
import { RunProgressSteps } from "./RunProgressSteps"
import {
  buildRunEventsFromLog,
  formatTotalDuration,
  type RunEventItem,
} from "@/features/jobs/run-events"
import type { JsonSchemaObject } from "@/features/report-criteria"
import type { ArrowJobStatus } from "../types"
import { useActiveJobsStore } from "@/store/slices/active-jobs-store"
import { cn } from "@/utils/cn"
import { formatCount } from "@/utils/format"
import { ApiError } from "@/services"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { copyToClipboard } from "@/lib/clipboard"

function formatWhen(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date)
}

function ExecutionStatusMark({
  status,
  onDelete,
}: {
  status: string
  onDelete?: () => void
}) {
  switch (status) {
    case "Completed": {
      const mark = (
        <span
          className="relative block size-4 shrink-0"
          role="img"
          aria-label="Completed"
        >
          <CircleCheck
            className="absolute inset-0 size-4 text-primary/70 transition-opacity group-hover:opacity-0 dark:text-sidebar-primary/80"
            aria-hidden
          />
          <Trash2
            className="absolute inset-0 size-4 text-destructive/70 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </span>
      )
      if (!onDelete) return mark
      return (
        <span
          role="button"
          tabIndex={-1}
          title="Delete execution"
          aria-label="Delete execution"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete()
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded"
        >
          {mark}
        </span>
      )
    }
    case "Failed":
      return (
        <CircleX
          className="size-4 shrink-0 text-destructive/70"
          aria-label="Failed"
        />
      )
    case "Cancelled":
      return (
        <CircleX
          className="size-4 shrink-0 text-muted-foreground/70"
          aria-label="Cancelled"
        />
      )
    case "Running":
      return (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-primary/60"
          aria-label="Running"
        />
      )
    case "Queued":
      return (
        <span
          className="size-2 shrink-0 rounded-full bg-orange-500/50"
          title="Queued"
          aria-label="Queued"
        />
      )
    default:
      return (
        <Badge
          variant={statusTone(status)}
          className="h-5 shrink-0 px-1.5 text-[10px]"
        >
          {status}
        </Badge>
      )
  }
}

function sameJobId(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return "{\n  \n}"
  }
}

function displayStatusFor(
  job: ArrowJobStatus | null | undefined,
  activeJobId: string | null | undefined,
  liveStatus?: string
): string {
  if (job && sameJobId(job.id, activeJobId) && liveStatus) return liveStatus
  return job?.status || "—"
}

export type ArrowJobExecutionsPanelProps = {
  /** List endpoint, e.g. `/api/arrow/jobs/stock-balance`. */
  jobsEndpoint: string
  /** Placeholder job name when the active run is not yet in the list. */
  jobName?: string
  /** Builds the report view path for a job id (e.g. `/stock/stock-balance/<id>`). */
  openJobHref?: (jobId: string) => string
  /** Empty-state subtitle under Executions. */
  emptyListHint?: string
  /** Currently open job GUID; omit on criteria page. */
  activeJobId?: string | null
  /** Live job status for the open GUID (overrides list until refresh). */
  activeLiveStatus?: string
  /** Known request JSON for the currently open job (fallback while /request is loading). */
  activeRequestJson?: string
  /** Live SSE steps for the currently open job. */
  activeRunEvents?: RunEventItem[]
  /** Parent run lifecycle: drives progress icons + list refresh. */
  activeRunPhase?: "idle" | "running" | "done" | "cancelled"
  className?: string
  onOpenJob?: (jobId: string) => void
  /** Fired when the user picks a row in Executions. */
  onJobSelect?: (jobId: string) => void
  /** Fired after a job is cancelled from Detail. */
  onJobCancelled?: (jobId: string) => void
  /** Fired after a job is deleted from Detail. */
  onJobDeleted?: (jobId: string) => void
  /** Fired when the executions list finishes loading (`count` of rows). */
  onListLoaded?: (count: number) => void
  /** Fired when list fetch fails / clears; show in page banner, not in the list. */
  onListError?: (message: string | null) => void
  /** Bump to force a silent list refresh (e.g. after queueing a new job). */
  listRefreshToken?: number
  /**
   * Extra in-flight jobs not yet returned by the list API (Queued / Running).
   * Merged into Executions so multiple queued runs appear immediately.
   */
  pendingJobs?: Array<{
    id: string
    status?: string
    createdAt?: string
    name?: string
    totalRows?: number | null
    batchCount?: number | null
  }>
  /**
   * Criteria content for the right column. Pass it unconditionally; the panel
   * shows it in place of Detail whenever nothing is selected in Executions
   * (including compose mode). Executions list stays visible.
   */
  detailSlot?: React.ReactNode
  /** Title for the detailSlot column header. Default: Criteria. */
  detailSlotTitle?: string
  /** Actions on the right of the detailSlot header (e.g. Run). */
  detailSlotActions?: React.ReactNode
  /**
   * Compose mode (New / empty list): drop any selected execution so the
   * criteria slot takes over the Detail column. Ignored without detailSlot.
   */
  criteriaActive?: boolean
  /**
   * Criteria JSON schema of the report — powers the read-only criteria grid
   * inside the Live panel (falls back to raw request JSON without it).
   */
  criteriaSchema?: JsonSchemaObject
  /**
   * Renders the embedded result panel for a completed job id. When provided,
   * completed jobs open the result grid in place instead of the Detail view.
   */
  renderResult?: (jobId: string) => React.ReactNode
}

/**
 * Reusable Executions + Detail panel for any Arrow report job list.
 */
export function ArrowJobExecutionsPanel({
  jobsEndpoint,
  jobName = "report",
  openJobHref,
  emptyListHint = "Past report jobs",
  activeJobId = null,
  activeLiveStatus,
  activeRequestJson,
  activeRunEvents = [],
  activeRunPhase = "idle",
  className,
  onOpenJob,
  onJobSelect,
  onJobCancelled,
  onJobDeleted,
  onListLoaded,
  onListError,
  listRefreshToken = 0,
  pendingJobs = [],
  detailSlot,
  detailSlotTitle = "Criteria",
  detailSlotActions,
  criteriaActive = false,
  criteriaSchema,
  renderResult,
}: ArrowJobExecutionsPanelProps) {
  const showCriteriaSlot = detailSlot != null
  const removeTrackedJob = useActiveJobsStore((s) => s.removeJob)
  // Header butonunun (PagePanelTrigger) hedefi — Executions kolonu açık/kapalı.
  const { open: executionsOpen } = usePagePanel({
    id: "executions",
    title: "Executions",
    defaultOpen: true,
  })
  const [loading, setLoading] = React.useState(true)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<ArrowJobStatus[]>([])
  const [total, setTotal] = React.useState(0)
  const [selectedId, setSelectedId] = React.useState<string | null>(
    activeJobId
  )
  // Seçili job satırlardan türetilir (state değil) — seçim/silme/silinme
  // otomatik yansır.
  const selectedJob = React.useMemo(
    () => items.find((item) => sameJobId(item.id, selectedId)) ?? null,
    [items, selectedId]
  )
  const [inputJson, setInputJson] = React.useState("{\n  \n}")
  const [historyEvents, setHistoryEvents] = React.useState<RunEventItem[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  /** Execution queued for deletion — set from the toolbar or the list row's
   *  hover mark so deletion never depends on the current selection. */
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const selectedItemRef = React.useRef<HTMLButtonElement | null>(null)
  const lastRefreshPhaseRef = React.useRef(activeRunPhase)

  const loadList = React.useCallback(
    async (signal?: AbortSignal, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      setError(null)
      try {
        const page = await listArrowJobs(jobsEndpoint, {
          take: 50,
          signal,
        })
        setItems(page.items ?? [])
        setTotal(page.total ?? 0)
      } catch (err) {
        if (signal?.aborted) return
        setError(
          err instanceof Error ? err.message : "Job listesi alınamadı"
        )
        if (!options?.silent) {
          setItems([])
          setTotal(0)
        }
      } finally {
        if (!signal?.aborted && !options?.silent) setLoading(false)
      }
    },
    [jobsEndpoint]
  )

  React.useEffect(() => {
    onListError?.(error)
  }, [error, onListError])

  React.useEffect(() => {
    const abort = new AbortController()
    const bootstrap = async () => {
      await loadList(abort.signal)
    }
    void bootstrap()
    return () => abort.abort()
  }, [loadList])

  React.useEffect(() => {
    if (!listRefreshToken) return
    const refresh = async () => {
      await loadList(undefined, { silent: true })
    }
    void refresh()
  }, [listRefreshToken, loadList])

  // Poll while any in-flight job exists (focused or queued siblings).
  React.useEffect(() => {
    const hasPending = pendingJobs.some(
      (job) =>
        job.status === "Queued" ||
        job.status === "Running" ||
        !job.status
    )
    if (activeRunPhase !== "running" && !hasPending) return
    const id = window.setInterval(() => {
      void loadList(undefined, { silent: true })
    }, 2500)
    return () => window.clearInterval(id)
  }, [activeRunPhase, pendingJobs, loadList])

  // Refresh once when run finishes / cancels.
  React.useEffect(() => {
    const prev = lastRefreshPhaseRef.current
    lastRefreshPhaseRef.current = activeRunPhase
    if (
      prev === "running" &&
      (activeRunPhase === "done" || activeRunPhase === "cancelled")
    ) {
      void loadList(undefined, { silent: true })
    }
  }, [activeRunPhase, loadList])

  // Compose modu (New / boş liste): vurgulu execution'ı bırak — render
  // sırasında state ayarlama.
  const composeKey = `${showCriteriaSlot}|${criteriaActive}`
  const [syncedComposeKey, setSyncedComposeKey] = React.useState(composeKey)
  if (syncedComposeKey !== composeKey) {
    setSyncedComposeKey(composeKey)
    if (showCriteriaSlot && criteriaActive) {
      setSelectedId(null)
    }
  }

  // Aktif (canlı) run seçili kalsın — render sırasında state ayarlama.
  const [syncedLiveJobId, setSyncedLiveJobId] = React.useState(activeJobId)
  if (syncedLiveJobId !== activeJobId) {
    setSyncedLiveJobId(activeJobId)
    if (activeJobId) {
      setSelectedId(activeJobId)
    }
  }

  React.useEffect(() => {
    if (loading || !selectedId) return
    selectedItemRef.current?.scrollIntoView({ block: "nearest" })
  }, [loading, selectedId, items])

  React.useEffect(() => {
    const abort = new AbortController()

    const loadDetail = async () => {
      if (!selectedId) return
      setDetailLoading(true)

      const isActive = sameJobId(selectedId, activeJobId)
      if (isActive && activeRequestJson?.trim()) {
        setInputJson(activeRequestJson)
      }

      try {
        const request = await fetchJobRequest(selectedId, abort.signal)
        if (abort.signal.aborted) return
        if (request && Object.keys(request).length > 0) {
          setInputJson(prettyJson(request))
        } else if (isActive && activeRequestJson?.trim()) {
          setInputJson(activeRequestJson)
        } else {
          setInputJson(prettyJson(request ?? {}))
        }
      } catch {
        if (abort.signal.aborted) return
        if (isActive && activeRequestJson?.trim()) {
          setInputJson(activeRequestJson)
        } else {
          setInputJson("{\n  \n}")
        }
      } finally {
        if (!abort.signal.aborted) setDetailLoading(false)
      }
    }

    void loadDetail()
    return () => abort.abort()
  }, [selectedId, activeJobId, activeRequestJson])

  // Load persisted progress for the selected run (skip while watching live active job).
  // Canlı canlı izleme / boş seçim durumunda geçmişi başa al — render
  // sırasında state ayarlama.
  //
  // SSE fallback: canlı izlemede SSE akışı tek güven kaynağıdır; tarayıcıda
  // bağlantı koparsa adımlar "job submitted"te takılı kalır. Bu yüzden canlı
  // job için yalnızca SSE gerçekten akarken (yerel ilk satırdan fazla adım
  // varken) event-log yüklemesi atlanır; aksi halde event-log bootstrap edilir.
  const liveEventsFlowing =
    sameJobId(selectedId, activeJobId) &&
    activeRunPhase === "running" &&
    activeRunEvents.length > 1
  const historyResetKey = `${selectedId ?? ""}|${activeJobId ?? ""}|${activeRunPhase ?? ""}`
  const [syncedHistoryResetKey, setSyncedHistoryResetKey] =
    React.useState(historyResetKey)
  if (syncedHistoryResetKey !== historyResetKey) {
    setSyncedHistoryResetKey(historyResetKey)
    const shouldClearHistory = !selectedId || liveEventsFlowing
    if (shouldClearHistory) {
      setHistoryEvents([])
    }
  }

  React.useEffect(() => {
    if (!selectedId) return
    // Canlı aktif run izlenirken ve SSE akarken geçmiş yüklenmez (izleme ekranı canlıdır).
    if (liveEventsFlowing) return

    const abort = new AbortController()
    let timer: ReturnType<typeof setInterval> | null = null
    const loadHistory = async () => {
      setHistoryLoading(true)
      try {
        const log = await fetchJobEventLog(selectedId, abort.signal)
        if (abort.signal.aborted) return
        setHistoryEvents(buildRunEventsFromLog(log))
      } catch {
        if (abort.signal.aborted) return
        setHistoryEvents([])
      } finally {
        if (!abort.signal.aborted) setHistoryLoading(false)
      }
    }

    void loadHistory()

    // SSE akmıyorken canlı job'ı event-log ile hafifçe takip et (fallback).
    if (sameJobId(selectedId, activeJobId) && activeRunPhase === "running") {
      timer = setInterval(() => {
        void loadHistory()
      }, 3000)
    }

    return () => {
      if (timer !== null) clearInterval(timer)
      abort.abort()
    }
  }, [selectedId, activeJobId, activeRunPhase, liveEventsFlowing])

  // Live row/batch counts for the active run (from SSE progress events).
  const liveCounts = React.useMemo(() => {
    if (!activeJobId) return null
    let totalRows: number | null = null
    let batchCount: number | null = null
    for (const event of activeRunEvents) {
      if (typeof event.totalRows === "number") totalRows = event.totalRows
      if (typeof event.batchCount === "number") batchCount = event.batchCount
    }
    return totalRows == null && batchCount == null
      ? null
      : { totalRows, batchCount }
  }, [activeJobId, activeRunEvents])

  // Patch live status + merge pending queued jobs not yet in the API list.
  const displayItems = React.useMemo(() => {
    let next = items

    // Apply SSE-driven statuses and row counts for every pending job, not only the focused one.
    if (pendingJobs.length > 0) {
      next = next.map((job) => {
        const pending = pendingJobs.find((p) => sameJobId(p.id, job.id))
        if (!pending) return job
        return {
          ...job,
          status: pending.status || job.status,
          totalRows: pending.totalRows ?? job.totalRows,
          batchCount: pending.batchCount ?? job.batchCount,
        }
      })
    }

    if (activeJobId && activeLiveStatus) {
      next = next.map((job) =>
        sameJobId(job.id, activeJobId)
          ? { ...job, status: activeLiveStatus }
          : job
      )
    }

    const extras: ArrowJobStatus[] = []
    for (const pending of pendingJobs) {
      if (next.some((job) => sameJobId(job.id, pending.id))) continue
      extras.push({
        id: pending.id,
        status: pending.status || "Queued",
        name: pending.name || jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: pending.createdAt || new Date().toISOString(),
        totalRows: pending.totalRows ?? undefined,
        batchCount: pending.batchCount ?? undefined,
      })
    }

    if (
      activeJobId &&
      !next.some((job) => sameJobId(job.id, activeJobId)) &&
      !extras.some((job) => sameJobId(job.id, activeJobId))
    ) {
      extras.unshift({
        id: activeJobId,
        status: activeLiveStatus || "Queued",
        name: jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: new Date().toISOString(),
        totalRows: liveCounts?.totalRows ?? undefined,
        batchCount: liveCounts?.batchCount ?? undefined,
      })
    }

    const combined = extras.length > 0 ? [...extras, ...next] : next

    if (activeJobId && liveCounts) {
      return combined.map((job) =>
        sameJobId(job.id, activeJobId)
          ? {
              ...job,
              totalRows: liveCounts.totalRows ?? job.totalRows,
              batchCount: liveCounts.batchCount ?? job.batchCount,
            }
          : job
      )
    }

    return combined
  }, [items, activeJobId, activeLiveStatus, jobName, pendingJobs, liveCounts])

  const isActiveSelected = sameJobId(selectedId, activeJobId)
  // Canlı adımlar aktarmışsa (SSE çalışıyor) onları göster; SSE tek "job
  // submitted" satırında takılı kaldıysa event-log bootstrap'ına düş.
  const progressEvents =
    isActiveSelected && activeRunEvents.length > 1
      ? activeRunEvents
      : historyEvents.length > 0
        ? historyEvents
        : activeRunEvents
  const progressPhase =
    isActiveSelected && activeRunEvents.length > 1
      ? activeRunPhase
      : progressEvents.some((e) => e.eventName === "completed")
        ? "done"
        : progressEvents.some((e) => e.eventName === "cancelled")
          ? "cancelled"
          : progressEvents.some((e) => e.eventName === "failed")
            ? "idle"
            : isActiveSelected && activeRunEvents.length > 0
              ? activeRunPhase
              : "idle"
  const showProgress = Boolean(selectedId)
  const pendingSelectedStatus = pendingJobs.find((p) =>
    sameJobId(p.id, selectedId)
  )?.status
  const selectedDisplayStatus =
    (isActiveSelected && activeLiveStatus) ||
    pendingSelectedStatus ||
    displayStatusFor(selectedJob, activeJobId, undefined)
  const canOpenSelected =
    selectedDisplayStatus === "Completed" && Boolean(onOpenJob)
  /**
   * 3-panel run flow: selected run in flight → Live panel (read-only criteria
   * + SSE stream); completed (+ renderResult) → embedded result panel;
   * otherwise the classic Detail view.
   */
  const selectedInFlight =
    selectedDisplayStatus === "Running" ||
    selectedDisplayStatus === "Queued" ||
    (isActiveSelected && activeRunPhase === "running")
  const liveMode = Boolean(selectedId) && selectedInFlight
  const resultMode =
    Boolean(selectedId) &&
    selectedDisplayStatus === "Completed" &&
    renderResult != null
  const criteriaVisible = showCriteriaSlot && !selectedId
  const canCancelSelected =
    Boolean(selectedId) && !criteriaVisible && !liveMode && selectedInFlight
  const canDeleteSelected =
    Boolean(selectedId) && !criteriaVisible && !liveMode

  const handleCopy = React.useCallback(
    (value: string, mode: "id" | "url") => {
      const text =
        mode === "url" && openJobHref
          ? `${window.location.origin}${openJobHref(value)}`
          : value
      void copyToClipboard(text)
    },
    [openJobHref]
  )

  const handleCancelSelected = React.useCallback(async () => {
    if (!selectedId || cancelling) return
    setCancelling(true)
    try {
      await cancelArrowJob(selectedId)
      removeTrackedJob(selectedId)
      onJobCancelled?.(selectedId)
      void loadList(undefined, { silent: true })
    } catch (err) {
      console.warn("Cancel job error:", err)
    } finally {
      setCancelling(false)
    }
  }, [selectedId, cancelling, removeTrackedJob, onJobCancelled, loadList])

  const handleConfirmDelete = React.useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault()
      const targetId = deleteTargetId
      if (!targetId || deleting) return
      setDeleting(true)
      setDeleteError(null)
      try {
        await deleteArrowJob(targetId)
        removeTrackedJob(targetId)
        onJobDeleted?.(targetId)
        setDeleteOpen(false)
        setDeleteTargetId(null)
        if (sameJobId(selectedId, targetId)) {
          setSelectedId(null)
          setHistoryEvents([])
          setInputJson("{\n  \n}")
        }
        await loadList(undefined, { silent: true })
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Job silinemedi"
        setDeleteError(message)
      } finally {
        setDeleting(false)
      }
    },
    [deleteTargetId, selectedId, deleting, removeTrackedJob, onJobDeleted, loadList]
  )

  const detailLines = React.useMemo(() => {
    if (!selectedJob && !isActiveSelected) {
      return [{ label: "Status", value: "—" }]
    }
    const duration = formatTotalDuration({
      createdAt: selectedJob?.createdAt,
      completedAt: selectedJob?.completedAt,
      status: selectedDisplayStatus,
      steps: progressEvents,
    })
    const lines = [
      { label: "Status", value: selectedDisplayStatus },
      { label: "Created", value: formatWhen(selectedJob?.createdAt) },
      { label: "Completed", value: formatWhen(selectedJob?.completedAt) },
      { label: "Duration", value: duration ?? "—" },
      {
        label: "Rows",
        value:
          isActiveSelected && liveCounts?.totalRows != null
            ? formatCount(liveCounts.totalRows)
            : selectedJob?.totalRows != null
              ? formatCount(selectedJob.totalRows)
              : "—",
      },
      {
        label: "Batches",
        value:
          isActiveSelected && liveCounts?.batchCount != null
            ? formatCount(liveCounts.batchCount)
            : selectedJob?.batchCount != null
              ? formatCount(selectedJob.batchCount)
              : "—",
      },
    ]
    if (selectedJob?.error) {
      lines.push({ label: "Error", value: selectedJob.error })
    }
    return lines
  }, [
    selectedJob,
    selectedDisplayStatus,
    isActiveSelected,
    liveCounts,
    progressEvents,
  ])

  const running =
    isActiveSelected &&
    activeRunPhase === "running" &&
    progressEvents === activeRunEvents

  React.useEffect(() => {
    if (loading) return
    onListLoaded?.(error ? 0 : displayItems.length)
  }, [loading, error, displayItems.length, onListLoaded])

  /** Detail column header actions — shared by the classic Detail view and
   *  the embedded result view so Delete stays available in both. */
  const detailToolbar = (
    <div className="flex shrink-0 items-center gap-1.5">
      {canCancelSelected && selectedId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            panelHeaderActionClass,
            "gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          )}
          disabled={cancelling}
          onClick={handleCancelSelected}
        >
          <Ban className="size-3.5" />
          {cancelling ? "Cancelling…" : "Cancel"}
        </Button>
      ) : null}
      {canDeleteSelected ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            panelHeaderActionClass,
            "gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          )}
          disabled={deleting}
          onClick={() => {
            setDeleteError(null)
            setDeleteTargetId(selectedId)
            setDeleteOpen(true)
          }}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      ) : null}
      {canOpenSelected && selectedId ? (
        <Button
          type="button"
          size="sm"
          className={panelHeaderActionClass}
          onClick={() => onOpenJob?.(selectedId)}
        >
          View report
        </Button>
      ) : null}
    </div>
  )

  return (
    <>
    {deleteError ? (
      <WorkspaceBanner
        tone="error"
        inset
        className="mx-2 mt-2"
        onDismiss={() => setDeleteError(null)}
      >
        <span title={deleteError}>{deleteError}</span>
      </WorkspaceBanner>
    ) : null}
    <ResizablePanelGroup
      key={executionsOpen ? "split" : "full"}
      orientation="horizontal"
      className={cn("min-h-0 flex-1 overflow-hidden", className)}
    >
      {executionsOpen ? (
        <ResizablePanel defaultSize="38%" minSize="18%" className="min-h-0 min-w-0">
        <section className={cn(panelCardClass, "h-full")}>
            <div className={panelHeaderClass}>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <History className={panelHeaderIconClass} aria-hidden />
                  <span className={panelHeaderTitleClass}>Executions</span>
                </div>
                <span className={panelHeaderSubtitleClass}>
                  {total > 0
                    ? `${formatCount(total)} run${total === 1 ? "" : "s"}`
                    : emptyListHint}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                disabled={loading}
                onClick={() => void loadList()}
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              </Button>
            </div>

          <ScrollArea className="h-0 min-h-0 w-full flex-1">
            {loading && displayItems.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary/60" />
                Loading…
              </div>
            ) : displayItems.length === 0 ? (
              <div className="flex h-full min-h-[12rem] items-center justify-center p-4">
                <Empty className="border-0 p-4">
                  <EmptyHeader>
                    <EmptyMedia
                      variant="icon"
                      className="bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    >
                      <History className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle>No executions yet</EmptyTitle>
                    <EmptyDescription>
                      Run a report to see it here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 border-b border-border/60">
                {displayItems.map((job) => {
                  const selected = sameJobId(selectedId, job.id)
                  return (
                    <li key={job.id} className="group w-full">
                      <button
                        ref={selected ? selectedItemRef : undefined}
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => {
                          setSelectedId(job.id)
                          onJobSelect?.(job.id)
                        }}
                        onDoubleClick={() => onOpenJob?.(job.id)}
                        className={cn(
                          "flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/80",
                          selected && "bg-primary/[0.07] hover:bg-primary/10 dark:bg-primary/15"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1">
                            <span
                              className="min-w-0 truncate font-mono text-xs"
                              title={job.id}
                            >
                              {job.id}
                            </span>
                            <span
                              role="button"
                              tabIndex={-1}
                              title="Copy GUID"
                              aria-label="Copy GUID"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                handleCopy(job.id, "id")
                              }}
                              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                            >
                              <Copy className="size-3" />
                            </span>
                          </div>
                          <span
                            className="flex size-5 shrink-0 items-center justify-center"
                            title={job.status}
                          >
                            <ExecutionStatusMark
                              status={job.status}
                              onDelete={() => {
                                setDeleteError(null)
                                setDeleteTargetId(job.id)
                                setDeleteOpen(true)
                              }}
                            />
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate">
                              {formatWhen(job.createdAt)}
                            </span>
                            <span className="opacity-50">·</span>
                            <span
                              className="shrink-0 tabular-nums"
                              title="Duration"
                            >
                              {formatTotalDuration({
                                createdAt: job.createdAt,
                                completedAt: job.completedAt,
                                status: job.status,
                              }) ?? "—"}
                            </span>
                          </div>
                          <span className="shrink-0">
                            {job.totalRows != null
                              ? `${formatCount(job.totalRows)} rows`
                              : "—"}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </ScrollArea>
        </section>
      </ResizablePanel>
      ) : null}
      {executionsOpen ? (
        <ResizableHandle
          withHandle
          className={panelResizeHandleClass}
        />
      ) : null}

      <ResizablePanel
        defaultSize={executionsOpen ? "62%" : "100%"}
        minSize="30%"
        className="min-h-0 min-w-0"
      >
        {liveMode ? (
          <ArrowJobLivePanel
            className="h-full"
            schema={criteriaSchema}
            requestJson={
              isActiveSelected && activeRequestJson ? activeRequestJson : inputJson
            }
            events={progressEvents}
            phase={progressPhase}
            running={running}
            loading={historyLoading && progressEvents.length === 0}
            liveStatus={selectedDisplayStatus}
            cancelling={cancelling}
            onCancel={
              selectedId ? () => void handleCancelSelected() : undefined
            }
          />
        ) : resultMode && selectedId ? (
          renderResult(selectedId)
        ) : criteriaVisible ? (
          <section className={cn(panelCardClass, "h-full min-w-0")}>
            <div className={panelHeaderClass}>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Filter className={panelHeaderIconClass} aria-hidden />
                  <span className={panelHeaderTitleClass}>{detailSlotTitle}</span>
                </div>
              </div>
              {detailSlotActions ? (
                <div className="flex shrink-0 items-center gap-1.5 self-center">
                  {detailSlotActions}
                </div>
              ) : null}
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {detailSlot}
            </div>
          </section>
        ) : (
          <section className={cn(panelCardClass, "h-full")}>
            <div className={panelHeaderClass}>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <FileText className={panelHeaderIconClass} aria-hidden />
                  <span className={panelHeaderTitleClass}>Detail</span>
                </div>
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className={cn(
                      panelHeaderSubtitleClass,
                      selectedId && "font-mono text-[11px]"
                    )}
                    title={selectedId ?? undefined}
                  >
                    {detailLoading
                      ? "Loading request…"
                      : selectedId
                        ? selectedId
                        : "Status, meta and request payload"}
                  </span>
                  {selectedId ? (
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedId, "url")}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground"
                      aria-label="Copy report URL"
                      title="Copy report URL"
                    >
                      <Copy className="size-3" />
                    </button>
                  ) : null}
                </div>
              </div>
                {detailToolbar}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ScrollArea className="h-0 min-h-0 w-full flex-1">
                <div className="px-4 py-3">
                  <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                    {detailLines.map((line) => (
                      <div
                        key={line.label}
                        className="group grid min-w-0 gap-0.5"
                      >
                        <dt className="text-[11px] text-muted-foreground">
                          {line.label}
                        </dt>
                        <dd
                          className={cn(
                            "text-foreground",
                            line.label === "Error" &&
                              "whitespace-normal break-all"
                          )}
                          title={line.value}
                        >
                          {line.label === "Error" ? (
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 truncate">
                                {line.value}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(line.value, "id")
                                }
                                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                                aria-label="Copy error"
                                title="Copy to clipboard"
                              >
                                <Copy className="size-3" />
                              </button>
                            </span>
                          ) : (
                            line.value
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {showProgress ? (
                    <RunProgressSteps
                      events={progressEvents}
                      phase={progressPhase}
                      running={running}
                      loading={historyLoading && progressEvents.length === 0}
                    />
                  ) : null}

                  <div className="mt-3 flex min-h-0 flex-col space-y-3">
                    <Marker variant="separator">
                      <MarkerContent className="text-[11px] text-muted-foreground">
                        Request Input
                      </MarkerContent>
                    </Marker>
                    <CodeBlock
                      value={inputJson}
                      language="json"
                      className="max-h-[min(24rem,50vh)] min-h-32 rounded-none border-0"
                    />
                  </div>
                </div>
              </ScrollArea>
            </div>
          </section>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>

    <AlertDialog
      open={deleteOpen}
      onOpenChange={(open) => {
        if (deleting) return
        setDeleteOpen(open)
        if (!open) {
          setDeleteError(null)
          setDeleteTargetId(null)
        }
      }}
    >
      <AlertDialogContent className="data-[size=default]:max-w-md data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete this execution?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteTargetId ? (
              <>
                Execution{" "}
                <span className="break-all font-mono text-foreground">
                  {deleteTargetId}
                </span>{" "}
                will be permanently removed from history.
              </>
            ) : (
              <>This execution will be permanently removed from history.</>
            )}
            {deleteError ? (
              <span className="mt-2 block text-destructive">{deleteError}</span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => void handleConfirmDelete(event)}
          >
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
