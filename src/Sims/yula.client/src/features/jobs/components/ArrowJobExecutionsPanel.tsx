"use client";

import * as React from "react"
import { usePersistedPanelLayout } from "@/lib/use-persisted-panel-layout"
import {
  CircleCheck,
  CircleX,
  Copy,
  FileText,
  Filter,
  History,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronRight,
} from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import {
  panelCardClass,
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
import { statusTone } from "@/features/jobs/lib/status-tone"
import {
  arrowJobEventHub,
  type JobHubSnapshot,
} from "@/features/jobs/services/arrow-job-event-hub"
import { RunProgressSteps } from "./RunProgressSteps"
import {
  buildRunEventsFromLog,
  formatTotalDuration,
  type RunEventItem,
} from "@/features/jobs/run-events"
import type { JsonSchemaObject } from "@/features/report-criteria"
import type { ArrowJobStatus } from "../types"
import { isTerminalJobStatus, useActiveJobsStore } from "@/store/slices/active-jobs-store"
import { cn } from "@/utils/cn"
import { formatCount, formatBytes } from "@/utils/format"
import { opfsReportCache, type OpfsJobParquetDetail } from "@/services/opfs/opfs-cache"
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
    case "Cancelled":
    case "Canceled": {
      const isFailed = status === "Failed"
      const Icon = CircleX
      const mark = (
        <span
          className="relative block size-4 shrink-0"
          role="img"
          aria-label={status}
        >
          <Icon
            className={cn(
              "absolute inset-0 size-4 transition-opacity",
              isFailed ? "text-destructive/70" : "text-muted-foreground/70",
              onDelete && "group-hover:opacity-0"
            )}
            aria-hidden
          />
          {onDelete ? (
            <Trash2
              className="absolute inset-0 size-4 text-destructive/70 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          ) : null}
        </span>
      )
      if (!onDelete) return mark
      return (
        <span
          role="button"
          tabIndex={-1}
          title={`Delete ${status.toLowerCase()} execution`}
          aria-label={`Delete ${status.toLowerCase()} execution`}
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
  onJobSelect?: (jobId: string, job?: ArrowJobStatus) => void
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
  /** Bitmiş raporlarda "result" (grid) veya "detail" kutusu görünümü */
  viewMode?: "result" | "detail"
  onViewModeChange?: (mode: "result" | "detail") => void
  onSelectedCompletedChange?: (isCompleted: boolean) => void
  deleteJobTriggerRef?: React.MutableRefObject<(() => void) | null>
  onCanDeleteChange?: (canDelete: boolean) => void
  cancelJobTriggerRef?: React.MutableRefObject<(() => void) | null>
  onCanCancelChange?: (canCancel: boolean) => void
  onCancellingChange?: (cancelling: boolean) => void
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
  criteriaSchema: _criteriaSchema,
  renderResult,
  viewMode,
  onViewModeChange,
  onSelectedCompletedChange,
  deleteJobTriggerRef,
  onCanDeleteChange,
  cancelJobTriggerRef,
  onCanCancelChange,
  onCancellingChange,
}: ArrowJobExecutionsPanelProps) {
  const showCriteriaSlot = detailSlot != null
  const removeTrackedJob = useActiveJobsStore((s) => s.removeJob)
  // Header butonunun (PagePanelTrigger) hedefi — Executions kolonu açık/kapalı.
  // Resize düzenini oturumlar arası koru (localStorage) — criteria/detail oranları.
  const { groupRef, onLayoutChanged } = usePersistedPanelLayout(
    "arrow-jobs-executions"
  )
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
  const selectedJob = React.useMemo(() => {
    const found = items.find((item) => sameJobId(item.id, selectedId))
    if (found) return found
    const pending = pendingJobs.find((item) => sameJobId(item.id, selectedId))
    if (pending) {
      return {
        id: pending.id,
        status: pending.status || "Queued",
        name: pending.name || jobName,
        createdAt: pending.createdAt || new Date().toISOString(),
        totalRows: pending.totalRows ?? undefined,
        batchCount: pending.batchCount ?? undefined,
        jobUrl: "",
        eventsUrl: "",
      } as ArrowJobStatus
    }
    return null
  }, [items, pendingJobs, selectedId, jobName])
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
  const [detailRefreshToken, setDetailRefreshToken] = React.useState(0)
  const [refreshing, setRefreshing] = React.useState(false)
  const [opfsDetail, setOpfsDetail] = React.useState<OpfsJobParquetDetail | null>(null)
  const [opfsLoadedId, setOpfsLoadedId] = React.useState<string | null>(null)
  const opfsLoading = Boolean(selectedId && opfsLoadedId !== selectedId)

  const onListLoadedRef = React.useRef(onListLoaded)
  const onListErrorRef = React.useRef(onListError)

  React.useEffect(() => {
    onListLoadedRef.current = onListLoaded
    onListErrorRef.current = onListError
  }, [onListLoaded, onListError])

  const loadList = React.useCallback(
    async (signal?: AbortSignal, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const page = await listArrowJobs(jobsEndpoint, {
          take: 50,
          signal,
        })
        setItems(page.items ?? [])
        setTotal(page.total ?? 0)
        setError(null)
        onListLoadedRef.current?.(page.total ?? (page.items?.length ?? 0))
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

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    const minSpinPromise = new Promise((resolve) => setTimeout(resolve, 500))
    try {
      setDetailRefreshToken((prev) => prev + 1)
      await loadList()
      await minSpinPromise
    } finally {
      setRefreshing(false)
    }
  }, [loadList])

  React.useEffect(() => {
    onListErrorRef.current?.(error)
  }, [error])

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
  }, [selectedId, activeJobId, activeRequestJson, detailRefreshToken])

  // Seçili işe ait OPFS yerel disk dosyalarını yükle
  React.useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void (async () => {
      try {
        const detail = await opfsReportCache.getParquetJobDetail(selectedId)
        if (!cancelled) {
          setOpfsDetail(detail)
          setOpfsLoadedId(selectedId)
        }
      } catch {
        if (!cancelled) {
          setOpfsDetail(null)
          setOpfsLoadedId(selectedId)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId, detailRefreshToken, selectedJob?.status])

  // Load persisted progress for the selected run (skip while watching live active job).
  // Aktif çalışan run için canlı SSE akışı tek güven kaynağıdır; geçmiş yüklenmez.
  const isActiveSelected = sameJobId(selectedId, activeJobId)

  // Seçili iş için ArrowJobEventHub snapshot'ı ve canlı aboneliği
  const [hubSnapshot, setHubSnapshot] = React.useState<JobHubSnapshot | null>(
    () => (selectedId ? arrowJobEventHub.getSnapshot(selectedId) ?? null : null)
  )

  const [syncedSelectedId, setSyncedSelectedId] = React.useState(selectedId)
  if (syncedSelectedId !== selectedId) {
    setSyncedSelectedId(selectedId)
    setHubSnapshot(selectedId ? arrowJobEventHub.getSnapshot(selectedId) ?? null : null)
    setOpfsDetail(null)
  }

  React.useEffect(() => {
    if (!selectedId) return

    const isJobInFlight =
      selectedJob?.status === "Running" ||
      selectedJob?.status === "Queued" ||
      (isActiveSelected && activeRunPhase === "running")

    if (isJobInFlight && !arrowJobEventHub.isStreaming(selectedId)) {
      arrowJobEventHub.startStream({
        id: selectedId,
        status: selectedJob?.status || activeLiveStatus || "Running",
        name: selectedJob?.name || jobName,
        eventsUrl: selectedJob?.eventsUrl,
        jobUrl: selectedJob?.jobUrl,
        createdAt: selectedJob?.createdAt,
      })
    }

    const unsub = arrowJobEventHub.subscribe(
      selectedId,
      (detail) => {
        setHubSnapshot({ ...detail.snapshot })
      },
      { replay: true }
    )

    return unsub
  }, [
    selectedId,
    selectedJob?.status,
    selectedJob?.name,
    selectedJob?.eventsUrl,
    selectedJob?.jobUrl,
    selectedJob?.createdAt,
    jobName,
    isActiveSelected,
    activeLiveStatus,
    activeRunPhase,
  ])

  const hubEvents = hubSnapshot?.events ?? []
  const hasHubEvents = hubEvents.length > 0

  const isRunningPhase =
    hubSnapshot?.phase === "running" ||
    (isActiveSelected && activeRunPhase === "running") ||
    selectedJob?.status === "Running" ||
    selectedJob?.status === "Queued"

  const isLiveActive =
    isRunningPhase ||
    Boolean(hubSnapshot?.isStreaming) ||
    (isActiveSelected && activeRunPhase === "running")

  const pendingSelectedStatus = pendingJobs.find((p) =>
    sameJobId(p.id, selectedId)
  )?.status
  const selectedDisplayStatus =
    hubSnapshot?.status ||
    (isActiveSelected && activeLiveStatus) ||
    pendingSelectedStatus ||
    displayStatusFor(selectedJob, activeJobId, undefined)

  const normStatus = (selectedDisplayStatus || "").trim().toLowerCase()
  const isTerminal =
    normStatus === "completed" ||
    normStatus === "cancelled" ||
    normStatus === "canceled" ||
    normStatus === "failed"

  const historyResetKey = `${selectedId ?? ""}|${activeJobId ?? ""}|${activeRunPhase ?? ""}`
  const [syncedHistoryResetKey, setSyncedHistoryResetKey] =
    React.useState(historyResetKey)
  if (syncedHistoryResetKey !== historyResetKey) {
    setSyncedHistoryResetKey(historyResetKey)
    const shouldClearHistory = !selectedId || isLiveActive
    if (shouldClearHistory) {
      setHistoryEvents([])
    }
  }

  React.useEffect(() => {
    if (!selectedId) return
    // Canlı aktif SSE akışı varsa HTTP ile polling yapma
    if (isLiveActive) return
    // Terminal bir işse ve sunucunun persisted event-log'u zaten çekildiyse tekrarlama
    if (isTerminal && historyEvents.length > 0) return
    // Devam eden olmayan ama henüz history çekilmemişse ya da hub event'i yoksa yükle
    if (!isTerminal && hasHubEvents) return

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

    // Sadece aktif olmayan ama listede hala "Running/Queued" görünen geçmiş bir iş seçilmişse event-log ile takip et.
    const isOtherRunning =
      !isLiveActive &&
      (selectedJob?.status === "Running" || selectedJob?.status === "Queued")
    if (isOtherRunning) {
      timer = setInterval(() => {
        void loadHistory()
      }, 3000)
    }

    return () => {
      if (timer !== null) clearInterval(timer)
      abort.abort()
    }
  }, [
    selectedId,
    isLiveActive,
    isTerminal,
    hasHubEvents,
    historyEvents.length,
    selectedJob?.status,
    detailRefreshToken,
  ])

  // Live row/batch counts for the currently selected job (when running in EventHub).
  const liveCounts = React.useMemo(() => {
    if (!selectedId) return null
    if (hubSnapshot?.totalRows != null || hubSnapshot?.batchCount != null) {
      return {
        totalRows: hubSnapshot.totalRows ?? null,
        batchCount: hubSnapshot.batchCount ?? null,
      }
    }
    const sourceEvents =
      hubSnapshot?.events?.length
        ? hubSnapshot.events
        : isActiveSelected && activeRunEvents.length > 0
          ? activeRunEvents
          : []
    let totalRows: number | null = null
    let batchCount: number | null = null
    for (const event of sourceEvents) {
      if (typeof event.totalRows === "number") totalRows = event.totalRows
      if (typeof event.batchCount === "number") batchCount = event.batchCount
    }
    return totalRows == null && batchCount == null
      ? null
      : { totalRows, batchCount }
  }, [selectedId, hubSnapshot, isActiveSelected, activeRunEvents])

  // Patch live status + merge pending queued jobs not yet in the API list.
  // TEK KAYNAK (Single Source of Truth):
  // 1. Bitmiş işler (Completed, Cancelled, Failed) için `items` (veritabanı) kesindir.
  // 2. Devam eden işler (Running, Queued) için `pendingJobs` veya aktif SSE akışı günceller.
  // 3. SEÇİLEN İŞ (selectedId) ASLA LİSTEDEKİ SATIR SAYISINI VEYA DURUMUNU EZEMEZ!
  // Patch live status + merge pending queued jobs not yet in the API list.
  // TEK KAYNAK (Single Source of Truth):
  // 1. Bitmiş işler (Completed, Cancelled, Failed) için sunucu veritabanı (items) kesindir.
  // 2. Devam eden işler (Running, Queued) için EventHub canlı SSE akışındaki satır/batch sayıları anlık yansıtılır.
  // 3. Bitmiş bir iş seçildiğinde asla ara SSE sayılarıyla ezilemez.
  const displayItems = React.useMemo(() => {
    const next = items.map((job) => {
      // Bitmiş işler için sunucu veritabanındaki değerler korunur
      if (isTerminalJobStatus(job.status)) {
        return job
      }

      // Devam eden iş için canlı EventHub snapshot'ı veya pendingJobs'tan anlık sayaçları al
      const liveSnap = sameJobId(job.id, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(job.id)
      const pending = pendingJobs.find((p) => sameJobId(p.id, job.id))

      const liveStatus =
        liveSnap?.status ||
        pending?.status ||
        (sameJobId(job.id, activeJobId) ? activeLiveStatus : null) ||
        job.status

      const liveTotalRows =
        liveSnap?.totalRows ?? pending?.totalRows ?? job.totalRows
      const liveBatchCount =
        liveSnap?.batchCount ?? pending?.batchCount ?? job.batchCount

      return {
        ...job,
        status: liveStatus,
        totalRows: liveTotalRows ?? undefined,
        batchCount: liveBatchCount ?? undefined,
      }
    })

    // API listesine henüz girmemiş yeni başlatılan bekleyen işler
    const extras: ArrowJobStatus[] = []
    for (const pending of pendingJobs) {
      if (next.some((job) => sameJobId(job.id, pending.id))) continue
      const snap = sameJobId(pending.id, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(pending.id)
      extras.push({
        id: pending.id,
        status: snap?.status || pending.status || "Queued",
        name: pending.name || jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: pending.createdAt || new Date().toISOString(),
        totalRows: snap?.totalRows ?? pending.totalRows ?? undefined,
        batchCount: snap?.batchCount ?? pending.batchCount ?? undefined,
      })
    }

    if (
      activeJobId &&
      !next.some((job) => sameJobId(job.id, activeJobId)) &&
      !extras.some((job) => sameJobId(job.id, activeJobId))
    ) {
      const activeSnap = sameJobId(activeJobId, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(activeJobId)
      extras.unshift({
        id: activeJobId,
        status: activeLiveStatus || activeSnap?.status || "Queued",
        name: jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: new Date().toISOString(),
        totalRows: activeSnap?.totalRows ?? undefined,
        batchCount: activeSnap?.batchCount ?? undefined,
      })
    }

    return extras.length > 0 ? [...extras, ...next] : next
  }, [items, pendingJobs, activeJobId, activeLiveStatus, jobName, hubSnapshot, selectedId])

  // Seçili işin gösterilecek adımları:
  // - Bitmiş (terminal) işler için sunucunun event-log'u (historyEvents) esastır.
  // - Canlı akan işler için EventHub (hubEvents) veya activeRunEvents önceliklidir.
  const rawProgressEvents =
    isTerminal && historyEvents.length > 0
      ? historyEvents
      : hasHubEvents
        ? hubEvents
        : isActiveSelected && activeRunEvents.length > 0
          ? activeRunEvents
          : historyEvents

  // İlerleme adımlarındaki satır sayısını seçili işin authoritative `totalRows` değeriyle eşitle.
  // Yalnızca iş terminal (Completed / Cancelled) ise sunucu sayısına eşitlenir;
  // İş akarken canlı SSE sayaçları olduğu gibi akar.
  const progressEvents = React.useMemo(() => {
    if (
      !isTerminal ||
      !selectedJob ||
      typeof selectedJob.totalRows !== "number" ||
      selectedJob.totalRows <= 0
    ) {
      return rawProgressEvents
    }
    const targetRows = selectedJob.totalRows
    const hasProgress = rawProgressEvents.some((e) => e.eventName === "progress")
    if (!hasProgress) return rawProgressEvents

    return rawProgressEvents.map((e) => {
      if (
        e.eventName === "progress" &&
        (e.totalRows == null || e.totalRows < targetRows)
      ) {
        return {
          ...e,
          detail: `${formatCount(targetRows)} rows`,
          totalRows: targetRows,
          batchCount: selectedJob.batchCount ?? e.batchCount,
        }
      }
      if (
        e.eventName === "cancelled" &&
        (e.totalRows == null || e.totalRows < targetRows)
      ) {
        return {
          ...e,
          detail: `${formatCount(targetRows)} rows · stopped`,
          totalRows: targetRows,
          batchCount: selectedJob.batchCount ?? e.batchCount,
        }
      }
      if (
        e.eventName === "completed" &&
        (e.totalRows == null || e.totalRows < targetRows)
      ) {
        return {
          ...e,
          detail: `${formatCount(targetRows)} rows ready`,
          totalRows: targetRows,
          batchCount: selectedJob.batchCount ?? e.batchCount,
        }
      }
      return e
    })
  }, [rawProgressEvents, selectedJob, isTerminal])

  const [internalViewMode, setInternalViewMode] = React.useState<"result" | "detail">("result")
  const currentViewMode = viewMode ?? internalViewMode

  const setEffectiveViewMode = React.useCallback(
    (mode: "result" | "detail") => {
      setInternalViewMode(mode)
      onViewModeChange?.(mode)
    },
    [onViewModeChange]
  )

  const progressPhase =
    hubSnapshot?.phase ??
    (isActiveSelected
      ? activeRunPhase
      : normStatus === "completed" || progressEvents.some((e) => e.eventName === "completed")
        ? "done"
        : normStatus === "cancelled" || normStatus === "canceled" || progressEvents.some((e) => e.eventName === "cancelled")
          ? "cancelled"
          : normStatus === "failed" || progressEvents.some((e) => e.eventName === "failed")
            ? "idle"
            : isRunningPhase
              ? "running"
              : "idle")
  const showProgress = Boolean(selectedId)

  const selectedInFlight =
    !isTerminal &&
    (normStatus === "running" ||
      normStatus === "queued" ||
      isRunningPhase)
  const isSelectedCompleted =
    Boolean(selectedId) && normStatus === "completed"

  const onSelectedCompletedChangeRef = React.useRef(onSelectedCompletedChange)

  React.useEffect(() => {
    onSelectedCompletedChangeRef.current = onSelectedCompletedChange
  }, [onSelectedCompletedChange])

  React.useEffect(() => {
    onSelectedCompletedChangeRef.current?.(isSelectedCompleted)
  }, [isSelectedCompleted])

  const resultMode =
    isSelectedCompleted &&
    renderResult != null &&
    currentViewMode !== "detail"
  const criteriaVisible = showCriteriaSlot && !selectedId
  const canDeleteSelected =
    Boolean(selectedId) && !criteriaVisible && !selectedInFlight

  const onCanDeleteChangeRef = React.useRef(onCanDeleteChange)
  React.useEffect(() => {
    onCanDeleteChangeRef.current = onCanDeleteChange
  }, [onCanDeleteChange])

  React.useEffect(() => {
    onCanDeleteChangeRef.current?.(canDeleteSelected)
  }, [canDeleteSelected])

  React.useEffect(() => {
    if (deleteJobTriggerRef) {
      deleteJobTriggerRef.current = () => {
        if (!selectedId || deleting) return
        setDeleteError(null)
        setDeleteTargetId(selectedId)
        setDeleteOpen(true)
      }
      return () => {
        deleteJobTriggerRef.current = null
      }
    }
  }, [deleteJobTriggerRef, selectedId, deleting])

  const canCancelSelected =
    Boolean(selectedId) && !criteriaVisible && selectedInFlight

  const onCanCancelChangeRef = React.useRef(onCanCancelChange)
  React.useEffect(() => {
    onCanCancelChangeRef.current = onCanCancelChange
  }, [onCanCancelChange])

  React.useEffect(() => {
    onCanCancelChangeRef.current?.(canCancelSelected)
  }, [canCancelSelected])

  const onCancellingChangeRef = React.useRef(onCancellingChange)
  React.useEffect(() => {
    onCancellingChangeRef.current = onCancellingChange
  }, [onCancellingChange])

  const handleCancelSelected = React.useCallback(async () => {
    if (!selectedId || cancelling) return
    setCancelling(true)
    onCancellingChangeRef.current?.(true)
    try {
      const cancelledStatus = await cancelArrowJob(selectedId)
      arrowJobEventHub.cancelJob(selectedId, {
        totalRows: cancelledStatus?.totalRows,
        batchCount: cancelledStatus?.batchCount,
      })
      removeTrackedJob(selectedId)
      setItems((prev) =>
        prev.map((item) =>
          sameJobId(item.id, selectedId)
            ? {
                ...item,
                status: "Cancelled",
                totalRows: cancelledStatus?.totalRows ?? item.totalRows,
                batchCount: cancelledStatus?.batchCount ?? item.batchCount,
              }
            : item
        )
      )
      onJobCancelled?.(selectedId)
      void loadList(undefined, { silent: true })
    } catch (err) {
      console.warn("Cancel job error:", err)
    } finally {
      setCancelling(false)
      onCancellingChangeRef.current?.(false)
    }
  }, [selectedId, cancelling, removeTrackedJob, onJobCancelled, loadList])

  React.useEffect(() => {
    if (cancelJobTriggerRef) {
      cancelJobTriggerRef.current = handleCancelSelected
      return () => {
        cancelJobTriggerRef.current = null
      }
    }
  }, [cancelJobTriggerRef, handleCancelSelected])

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
          isTerminal && selectedJob?.totalRows != null
            ? formatCount(selectedJob.totalRows)
            : liveCounts?.totalRows != null
              ? formatCount(liveCounts.totalRows)
              : selectedJob?.totalRows != null
                ? formatCount(selectedJob.totalRows)
                : "—",
      },
      {
        label: "Batches",
        value:
          isTerminal && selectedJob?.batchCount != null
            ? formatCount(selectedJob.batchCount)
            : liveCounts?.batchCount != null
              ? formatCount(liveCounts.batchCount)
              : selectedJob?.batchCount != null
                ? formatCount(selectedJob.batchCount)
                : "—",
      },
      {
        label: "OPFS Cache",
        value: opfsDetail?.hasParts
          ? `${opfsDetail.partCount} parça (${formatBytes(opfsDetail.totalSizeBytes)})`
          : opfsLoading
            ? "Taranıyor…"
            : "Yok",
      },
      {
        label: "OPFS Date",
        value: opfsDetail?.files?.[0]?.lastModified
          ? formatWhen(new Date(opfsDetail.files[0].lastModified).toISOString())
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
    isTerminal,
    isActiveSelected,
    liveCounts,
    progressEvents,
    opfsDetail,
    opfsLoading,
  ])

  const running =
    isRunningPhase &&
    progressPhase !== "done" &&
    progressPhase !== "cancelled"

  React.useEffect(() => {
    if (loading) return
    onListLoadedRef.current?.(error ? 0 : displayItems.length)
  }, [loading, error, displayItems.length])



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
      orientation="horizontal"
      groupRef={groupRef}
      onLayoutChanged={onLayoutChanged}
      className={cn("min-h-0 flex-1 overflow-hidden", className)}
    >
      <ResizablePanel
        id="executions-criteria"
        defaultSize={360}
        minSize={320}
        maxSize={520}
        groupResizeBehavior="preserve-pixel-size"
        className="min-h-0 min-w-0"
      >
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
                disabled={loading || refreshing}
                onClick={handleRefresh}
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw className={cn("size-3.5", (loading || refreshing) && "animate-spin")} />
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
                          setEffectiveViewMode("result")
                          onJobSelect?.(job.id, job)
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
      <ResizableHandle withHandle className={panelResizeHandleClass} />

      <ResizablePanel
        id="executions-detail"
        minSize="30%"
        className="min-h-0 min-w-0"
      >
        {resultMode && selectedId ? (
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
                {selectedDisplayStatus ? (
                  <Badge
                    variant={statusTone(selectedDisplayStatus)}
                    className="h-5 shrink-0 px-1.5 text-[10px]"
                  >
                    {selectedDisplayStatus}
                  </Badge>
                ) : null}
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
                    {opfsDetail && opfsDetail.files.length > 0 ? (
                      <div className="sm:col-span-2 pt-1">
                        <Collapsible defaultOpen={false}>
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="group/trigger flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <ChevronRight className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90" />
                              <dt className="cursor-pointer font-medium">
                                OPFS Files ({opfsDetail.files.length})
                              </dt>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <dd className="mt-1 flex flex-col gap-0.5 rounded border border-border/40 bg-muted/20 p-2 font-mono text-[11px]">
                              {opfsDetail.files.map((file) => (
                                <div
                                  key={file.name}
                                  className="flex items-center justify-between gap-2 border-b border-border/20 py-0.5 last:border-0 last:pb-0"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="truncate font-medium text-foreground">
                                      {file.name}
                                    </span>
                                    {file.lastModified ? (
                                      <span className="text-[10px] text-muted-foreground/80">
                                        [{formatWhen(new Date(file.lastModified).toISOString())}]
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="shrink-0 text-muted-foreground tabular-nums">
                                    {formatBytes(file.sizeBytes)}
                                  </span>
                                </div>
                              ))}
                            </dd>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    ) : null}
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
