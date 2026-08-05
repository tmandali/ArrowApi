import * as React from "react"
import { useMatch, useNavigate } from "react-router-dom"
import { useJobSync } from "@/context/job-sync-provider"
import { ApiError } from "@/services"
import { fetchJobStatus } from "@/features/jobs/arrow-job-client"
import { stockAnalyticsService } from "@/features/stock/item/services/stock-analytics-service"
import type {
  ArrowJobEvent,
  ReportColumn,
  ReportGridRow,
  StockAnalyticsRequest,
} from "@/features/stock/item/types/stock-analytics"
import {
  isTerminalJobStatus,
  selectPendingStockAnalyticsJob,
  useActiveJobsStore,
  type TrackedJob,
} from "@/store/slices/active-jobs-store"

export type ReportRunStatus = "idle" | "running" | "done" | "cancelled"

export type RunEventItem = {
  id: string
  eventName: string
  title: string
  detail: string
  tone: "muted" | "success" | "danger"
}

const STOCK_ANALYTICS_PATH = "/stock/stock-analytics"

function jobHref(jobId: string): string {
  return `${STOCK_ANALYTICS_PATH}/${jobId}`
}

function collectIds(rows: ReportGridRow[]): string[] {
  return rows.flatMap((row) => [
    row.id,
    ...(row.children ? collectIds(row.children) : []),
  ])
}

function expandAllIds(rows: ReportGridRow[]): Record<string, boolean> {
  return Object.fromEntries(collectIds(rows).map((id) => [id, true]))
}

function mapSseToRunEvent(
  eventName: string,
  payload: ArrowJobEvent,
  index: number
): RunEventItem {
  if (eventName === "info") {
    return {
      id: `info-${index}`,
      eventName,
      title: "Info",
      detail: payload.message || "…",
      tone: "success",
    }
  }
  if (eventName === "progress") {
    return {
      id: "progress",
      eventName,
      title: "Progress",
      detail: `${payload.totalRows ?? 0} rows`,
      tone: "success",
    }
  }
  if (eventName === "completed") {
    return {
      id: `completed-${index}`,
      eventName,
      title: "Completed",
      detail: `${payload.totalRows ?? 0} rows ready`,
      tone: "success",
    }
  }
  if (eventName === "failed") {
    return {
      id: `failed-${index}`,
      eventName,
      title: "Failed",
      detail: payload.error || "job failed",
      tone: "danger",
    }
  }
  if (eventName === "cancelled") {
    return {
      id: `cancelled-${index}`,
      eventName,
      title: "Cancelled",
      detail: "report stopped",
      tone: "danger",
    }
  }
  return {
    id: `status-${index}`,
    eventName,
    title: payload.status || eventName,
    detail: payload.message || eventName,
    tone: "muted",
  }
}

function appendOrUpdateRunEvent(
  prev: RunEventItem[],
  eventName: string,
  payload: ArrowJobEvent
): RunEventItem[] {
  if (eventName === "progress") {
    const item = mapSseToRunEvent(eventName, payload, prev.length)
    const idx = prev.findIndex((e) => e.eventName === "progress")
    if (idx >= 0) {
      const next = [...prev]
      next[idx] = { ...item, id: prev[idx].id }
      return next
    }
    return [...prev, item]
  }

  return [...prev, mapSseToRunEvent(eventName, payload, prev.length)]
}

function toIsoDateString(value: Date | string | undefined): string | undefined {
  if (!value) return undefined
  if (typeof value === "string") return value.slice(0, 10)
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, "0")
  const d = String(value.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function parseStoredDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function serializeReportRequest(
  request: StockAnalyticsRequest
): Record<string, unknown> {
  return {
    fromDate: toIsoDateString(request.fromDate),
    toDate: toIsoDateString(request.toDate),
    fiscalYear: request.fiscalYear,
    financeBook: request.financeBook,
    currency: request.currency,
    valuesMode: request.valuesMode,
    showZeroValues: request.showZeroValues ?? false,
    showGroupAccounts: request.showGroupAccounts ?? true,
  }
}

function requestFromJobPayload(
  payload: Record<string, unknown> | undefined
): StockAnalyticsRequest {
  if (!payload) return {}
  return {
    fromDate: typeof payload.fromDate === "string" ? payload.fromDate : undefined,
    toDate: typeof payload.toDate === "string" ? payload.toDate : undefined,
    fiscalYear:
      typeof payload.fiscalYear === "string" ? payload.fiscalYear : undefined,
    financeBook:
      typeof payload.financeBook === "string" ? payload.financeBook : undefined,
    currency: typeof payload.currency === "string" ? payload.currency : undefined,
    valuesMode:
      typeof payload.valuesMode === "string" ? payload.valuesMode : undefined,
    showZeroValues:
      typeof payload.showZeroValues === "boolean"
        ? payload.showZeroValues
        : undefined,
    showGroupAccounts:
      typeof payload.showGroupAccounts === "boolean"
        ? payload.showGroupAccounts
        : undefined,
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (
      typeof error.body === "object" &&
      error.body &&
      "error" in error.body
    ) {
      return String((error.body as { error?: string }).error)
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return fallback
}

type StockAnalyticsReportContextValue = {
  expandedNodes: Record<string, boolean>
  setExpandedNodes: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
  reportRows: ReportGridRow[]
  reportColumns: ReportColumn[]
  runEvents: RunEventItem[]
  runStatus: ReportRunStatus
  reportReady: boolean
  running: boolean
  hasPendingReport: boolean
  isPendingView: boolean
  fromDate: Date | undefined
  setFromDate: React.Dispatch<React.SetStateAction<Date | undefined>>
  toDate: Date | undefined
  setToDate: React.Dispatch<React.SetStateAction<Date | undefined>>
  valuesMode: string
  setValuesMode: React.Dispatch<React.SetStateAction<string>>
  fiscalYear: string
  setFiscalYear: React.Dispatch<React.SetStateAction<string>>
  financeBook: string
  setFinanceBook: React.Dispatch<React.SetStateAction<string>>
  currency: string
  setCurrency: React.Dispatch<React.SetStateAction<string>>
  showZeroValues: boolean
  setShowZeroValues: React.Dispatch<React.SetStateAction<boolean>>
  showGroupAccounts: boolean
  setShowGroupAccounts: React.Dispatch<React.SetStateAction<boolean>>
  toggleNode: (id: string) => void
  collapseAll: () => void
  expandAll: () => void
  setLevel: (level: number) => void
  runReport: () => Promise<void>
  cancelReport: () => void
  confirmReportReady: () => void
  activeJobId: string | null
  selectExecution: (jobId: string) => void
  primaryActionLabel: string
  primaryActionButtonProps: {
    variant: "default" | "destructive"
    className?: string
  }
  onPrimaryAction: () => void
}

const StockAnalyticsReportContext =
  React.createContext<StockAnalyticsReportContextValue | null>(null)

export function StockAnalyticsReportProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const jobMatch = useMatch({
    path: `${STOCK_ANALYTICS_PATH}/:jobId`,
    end: true,
  })
  const urlJobId = jobMatch?.params.jobId
  const { trackJob, waitUntilTerminal, cancelTrackedJob } = useJobSync()

  const [expandedNodes, setExpandedNodes] =
    React.useState<Record<string, boolean>>({})
  const [reportRows, setReportRows] = React.useState<ReportGridRow[]>([])
  const [reportColumns, setReportColumns] = React.useState<ReportColumn[]>([])
  const [runEvents, setRunEvents] = React.useState<RunEventItem[]>([])
  const [fromDate, setFromDate] = React.useState<Date | undefined>(
    new Date(2025, 3, 1)
  )
  const [toDate, setToDate] = React.useState<Date | undefined>(
    new Date(2026, 2, 31)
  )
  const [valuesMode, setValuesMode] = React.useState("5-values")
  const [fiscalYear, setFiscalYear] = React.useState("2025-2026")
  const [financeBook, setFinanceBook] = React.useState("")
  const [currency, setCurrency] = React.useState("inr")
  const [showZeroValues, setShowZeroValues] = React.useState(false)
  const [showGroupAccounts, setShowGroupAccounts] = React.useState(true)
  const [runStatus, setRunStatus] = React.useState<ReportRunStatus>("idle")
  const [reportReady, setReportReady] = React.useState(false)

  const runIdRef = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)
  const activeJobIdRef = React.useRef<string | null>(null)
  const loadedJobIdRef = React.useRef<string | null>(null)
  const resumedRef = React.useRef(false)
  const running = runStatus === "running"

  const toggleNode = React.useCallback((id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const collapseAll = React.useCallback(() => setExpandedNodes({}), [])

  const expandAll = React.useCallback(() => {
    setExpandedNodes(expandAllIds(reportRows))
  }, [reportRows])

  const setLevel = React.useCallback(
    (level: number) => {
      const next: Record<string, boolean> = {}
      const walk = (rows: ReportGridRow[], depth: number) => {
        for (const row of rows) {
          if (!row.children?.length) continue
          next[row.id] = depth < level
          walk(row.children, depth + 1)
        }
      }
      walk(reportRows, 1)
      setExpandedNodes(next)
    },
    [reportRows]
  )

  const applyRequestToForm = React.useCallback(
    (request: StockAnalyticsRequest) => {
      const from = parseStoredDate(request.fromDate)
      const to = parseStoredDate(request.toDate)
      if (from) setFromDate(from)
      if (to) setToDate(to)
      if (request.fiscalYear) setFiscalYear(request.fiscalYear)
      if (request.financeBook != null) setFinanceBook(request.financeBook)
      if (request.currency) setCurrency(request.currency)
      if (request.valuesMode) setValuesMode(request.valuesMode)
      if (typeof request.showZeroValues === "boolean") {
        setShowZeroValues(request.showZeroValues)
      }
      if (typeof request.showGroupAccounts === "boolean") {
        setShowGroupAccounts(request.showGroupAccounts)
      }
    },
    []
  )

  const followJob = React.useCallback(
    async (
      job: Pick<TrackedJob, "id" | "jobUrl">,
      request: StockAnalyticsRequest,
      runId: number,
      abort: AbortController,
      options?: { autoOpen?: boolean }
    ) => {
      activeJobIdRef.current = job.id
      loadedJobIdRef.current = job.id

      const terminal = await waitUntilTerminal(job.id, {
        signal: abort.signal,
        onEvent: (eventName, payload) => {
          if (runIdRef.current !== runId) return
          setRunEvents((prev) =>
            appendOrUpdateRunEvent(prev, eventName, payload)
          )
        },
      })

      if (runIdRef.current !== runId) return
      activeJobIdRef.current = null

      if (terminal.status === "Cancelled") {
        setRunStatus("cancelled")
        return
      }

      if (terminal.status === "Failed") {
        throw new Error(terminal.error || "Rapor job'ı başarısız")
      }

      const report = await stockAnalyticsService.fetchReport(
        terminal.jobUrl || job.jobUrl,
        request,
        abort.signal
      )

      if (runIdRef.current !== runId) return

      setReportColumns(report.columns)
      setReportRows(report.rows)
      setExpandedNodes(expandAllIds(report.rows))
      if (options?.autoOpen) {
        setReportReady(true)
        setRunStatus("idle")
      } else {
        setRunStatus("done")
      }
    },
    [waitUntilTerminal]
  )

  const cancelReport = React.useCallback(() => {
    runIdRef.current += 1
    const jobId = activeJobIdRef.current
    activeJobIdRef.current = null
    abortRef.current?.abort()
    if (jobId) {
      void cancelTrackedJob(jobId)
    }
    setRunStatus("cancelled")
    setRunEvents((prev) => [
      ...prev,
      {
        id: `cancelled-local-${prev.length}`,
        eventName: "cancelled",
        title: "Cancelled",
        detail: "report stopped",
        tone: "danger",
      },
    ])
  }, [cancelTrackedJob])

  const confirmReportReady = React.useCallback(() => {
    if (reportColumns.length === 0) return
    setReportReady(true)
    setRunStatus("idle")
  }, [reportColumns.length])

  const hasPendingReport = reportColumns.length > 0 && !reportReady
  const isPendingView = runStatus === "done" || hasPendingReport

  React.useEffect(() => {
    if (hasPendingReport && runStatus === "idle") {
      setRunStatus("done")
    }
  }, [hasPendingReport, runStatus])

  const handleJobError = React.useCallback(
    (runId: number, abort: AbortController, error: unknown) => {
      if (runIdRef.current !== runId) return
      activeJobIdRef.current = null
      if (abort.signal.aborted) {
        setRunStatus("cancelled")
        return
      }
      setRunEvents((prev) => [
        ...prev,
        {
          id: `error-${prev.length}`,
          eventName: "failed",
          title: "Failed",
          detail: errorMessage(error, "Rapor alınamadı"),
          tone: "danger",
        },
      ])
      setRunStatus("idle")
      setReportReady(false)
    },
    []
  )

  const resumePendingJob = React.useCallback(
    (job: TrackedJob) => {
      if (activeJobIdRef.current) return

      const request = requestFromJobPayload(job.payload)
      applyRequestToForm(request)

      const runId = ++runIdRef.current
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      loadedJobIdRef.current = job.id

      setReportReady(false)
      setRunStatus("running")
      setRunEvents([
        {
          id: "resume-0",
          eventName: "status",
          title: job.status || "Running",
          detail: "workspace dönüşünde job'a yeniden bağlanıldı",
          tone: "muted",
        },
      ])

      if (!window.location.pathname.includes(job.id)) {
        navigate(jobHref(job.id), { replace: true })
      }

      void followJob(job, request, runId, abort).catch((error) => {
        handleJobError(runId, abort, error)
      })
    },
    [applyRequestToForm, followJob, handleJobError, navigate]
  )

  const loadJobById = React.useCallback(
    async (jobId: string) => {
      if (activeJobIdRef.current === jobId || loadedJobIdRef.current === jobId) {
        return
      }

      const runId = ++runIdRef.current
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      resumedRef.current = true
      loadedJobIdRef.current = jobId

      setReportReady(false)
      setReportRows([])
      setReportColumns([])
      setRunStatus("running")
      setRunEvents([
        {
          id: "hydrate-0",
          eventName: "status",
          title: "Loading",
          detail: `job ${jobId}`,
          tone: "muted",
        },
      ])

      try {
        const status = await fetchJobStatus(jobId, abort.signal)
        if (runIdRef.current !== runId) return

        if (!status) {
          setRunEvents([
            {
              id: "hydrate-404",
              eventName: "failed",
              title: "Not found",
              detail: "Job bulunamadı",
              tone: "danger",
            },
          ])
          setRunStatus("idle")
          loadedJobIdRef.current = null
          return
        }

        const requestBody = await stockAnalyticsService.fetchJobRequest(
          jobId,
          abort.signal
        )
        if (runIdRef.current !== runId) return

        const request: StockAnalyticsRequest = requestBody
          ? {
              fromDate: requestBody.fromDate,
              toDate: requestBody.toDate,
              fiscalYear: requestBody.fiscalYear,
              financeBook: requestBody.financeBook,
              currency: requestBody.currency,
              valuesMode: requestBody.valuesMode,
              showZeroValues: requestBody.showZeroValues,
              showGroupAccounts: requestBody.showGroupAccounts,
            }
          : {}
        applyRequestToForm(request)

        const jobStatus = status.status || ""
        if (
          jobStatus === "Queued" ||
          jobStatus === "Running" ||
          !isTerminalJobStatus(jobStatus)
        ) {
          trackJob({
            id: status.id,
            name: status.name || "stock-analytics",
            title: "Stock Analytics",
            href: jobHref(status.id),
            status: jobStatus || "Queued",
            eventsUrl: status.eventsUrl,
            jobUrl: status.jobUrl,
            createdAt: status.createdAt || new Date().toISOString(),
            notificationType: "report",
            workspace: "/stock",
            successTitle: "Stock Analytics Ready",
            successDescription:
              "Stock Analytics raporu tamamlandı. Açmak için bildirime tıklayın.",
            failureTitle: "Stock Analytics Failed",
            payload: serializeReportRequest(request),
          })

          setRunEvents((prev) => [
            ...prev,
            {
              id: "hydrate-follow",
              eventName: "status",
              title: jobStatus || "Running",
              detail: "GUID ile job'a bağlanıldı",
              tone: "muted",
            },
          ])

          await followJob(
            { id: status.id, jobUrl: status.jobUrl },
            request,
            runId,
            abort,
            { autoOpen: true }
          )
          return
        }

        if (jobStatus === "Cancelled") {
          setRunStatus("cancelled")
          setRunEvents((prev) => [
            ...prev,
            mapSseToRunEvent("cancelled", { id: jobId, status: jobStatus }, prev.length),
          ])
          return
        }

        if (jobStatus === "Failed") {
          setRunEvents((prev) => [
            ...prev,
            {
              id: `failed-${prev.length}`,
              eventName: "failed",
              title: "Failed",
              detail: status.error || "job failed",
              tone: "danger",
            },
          ])
          setRunStatus("idle")
          return
        }

        const report = await stockAnalyticsService.fetchReport(
          status.jobUrl,
          request,
          abort.signal
        )
        if (runIdRef.current !== runId) return

        setReportColumns(report.columns)
        setReportRows(report.rows)
        setExpandedNodes(expandAllIds(report.rows))
        setRunEvents((prev) => [
          ...prev,
          {
            id: `completed-${prev.length}`,
            eventName: "completed",
            title: "Completed",
            detail: `${report.totalRows} rows ready`,
            tone: "success",
          },
        ])
        setReportReady(true)
        setRunStatus("idle")
      } catch (error) {
        handleJobError(runId, abort, error)
        if (!abort.signal.aborted) {
          loadedJobIdRef.current = null
        }
      }
    },
    [applyRequestToForm, followJob, handleJobError, trackJob]
  )

  // URL GUID öncelikli: sayfa /stock/stock-analytics/{guid} ile açıldığında sonuçları yükle.
  React.useEffect(() => {
    if (!urlJobId) return
    resumedRef.current = true
    void loadJobById(urlJobId)
  }, [urlJobId, loadJobById])

  // Persist hydrate / hard reload sonrası pending job (URL'de GUID yoksa).
  React.useEffect(() => {
    if (urlJobId) return
    if (resumedRef.current) return

    const tryResume = () => {
      if (resumedRef.current || urlJobId) return
      const job = selectPendingStockAnalyticsJob(
        useActiveJobsStore.getState().jobs
      )
      if (!job) return
      resumedRef.current = true
      resumePendingJob(job)
    }

    if (useActiveJobsStore.persist.hasHydrated()) {
      tryResume()
      return
    }

    return useActiveJobsStore.persist.onFinishHydration(() => {
      tryResume()
    })
  }, [resumePendingJob, urlJobId])

  const runReport = React.useCallback(async () => {
    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    resumedRef.current = true

    setReportReady(false)
    setRunStatus("running")
    setRunEvents([
      {
        id: "local-0",
        eventName: "status",
        title: "Queued",
        detail: "creating Arrow job",
        tone: "muted",
      },
    ])

    const request: StockAnalyticsRequest = {
      fromDate,
      toDate,
      fiscalYear,
      financeBook: financeBook || undefined,
      currency: currency || "inr",
      valuesMode,
      showZeroValues,
      showGroupAccounts,
    }

    try {
      const job = await stockAnalyticsService.createJob(request, abort.signal)
      if (runIdRef.current !== runId) return

      loadedJobIdRef.current = job.id
      navigate(jobHref(job.id), { replace: true })

      trackJob({
        id: job.id,
        name: job.name || "stock-analytics",
        title: "Stock Analytics",
        href: jobHref(job.id),
        status: job.status || "Queued",
        eventsUrl: job.eventsUrl,
        jobUrl: job.jobUrl,
        createdAt: job.createdAt || new Date().toISOString(),
        notificationType: "report",
        workspace: "/stock",
        successTitle: "Stock Analytics Ready",
        successDescription:
          "Stock Analytics raporu tamamlandı. Açmak için bildirime tıklayın.",
        failureTitle: "Stock Analytics Failed",
        payload: serializeReportRequest(request),
      })

      await followJob(
        { id: job.id, jobUrl: job.jobUrl },
        request,
        runId,
        abort
      )
    } catch (error) {
      handleJobError(runId, abort, error)
    }
  }, [
    trackJob,
    followJob,
    handleJobError,
    navigate,
    fromDate,
    toDate,
    fiscalYear,
    financeBook,
    currency,
    valuesMode,
    showZeroValues,
    showGroupAccounts,
  ])

  const primaryActionLabel =
    runStatus === "running"
      ? "Cancel"
      : isPendingView
        ? "View"
        : "Execute"

  const primaryActionButtonProps = React.useMemo(() => {
    switch (runStatus) {
      case "running":
        return {
          variant: "destructive" as const,
          className: undefined as string | undefined,
        }
      case "done":
        return {
          variant: "default" as const,
          className:
            "bg-emerald-600 text-white hover:bg-emerald-600/90 focus-visible:ring-emerald-600/30",
        }
      case "idle":
        if (hasPendingReport) {
          return {
            variant: "default" as const,
            className:
              "bg-emerald-600 text-white hover:bg-emerald-600/90 focus-visible:ring-emerald-600/30",
          }
        }
        return {
          variant: "default" as const,
          className: undefined as string | undefined,
        }
      case "cancelled":
        return {
          variant: "default" as const,
          className: undefined as string | undefined,
        }
      default: {
        const _exhaustive: never = runStatus
        return _exhaustive
      }
    }
  }, [runStatus, hasPendingReport])

  const onPrimaryAction = React.useCallback(() => {
    if (runStatus === "running") {
      cancelReport()
      return
    }
    if (isPendingView) {
      confirmReportReady()
      return
    }
    void runReport()
  }, [runStatus, isPendingView, cancelReport, confirmReportReady, runReport])

  const selectExecution = React.useCallback(
    (jobId: string) => {
      if (!jobId) return
      if (urlJobId === jobId && reportReady && runStatus === "idle") return
      loadedJobIdRef.current = null
      resumedRef.current = true
      navigate(jobHref(jobId))
    },
    [navigate, reportReady, runStatus, urlJobId]
  )

  const activeJobId = urlJobId ?? activeJobIdRef.current

  const value = React.useMemo(
    () => ({
      expandedNodes,
      setExpandedNodes,
      reportRows,
      reportColumns,
      runEvents,
      runStatus,
      reportReady,
      running,
      hasPendingReport,
      isPendingView,
      fromDate,
      setFromDate,
      toDate,
      setToDate,
      valuesMode,
      setValuesMode,
      fiscalYear,
      setFiscalYear,
      financeBook,
      setFinanceBook,
      currency,
      setCurrency,
      showZeroValues,
      setShowZeroValues,
      showGroupAccounts,
      setShowGroupAccounts,
      toggleNode,
      collapseAll,
      expandAll,
      setLevel,
      runReport,
      cancelReport,
      confirmReportReady,
      activeJobId,
      selectExecution,
      primaryActionLabel,
      primaryActionButtonProps,
      onPrimaryAction,
    }),
    [
      expandedNodes,
      reportRows,
      reportColumns,
      runEvents,
      runStatus,
      reportReady,
      running,
      hasPendingReport,
      isPendingView,
      fromDate,
      toDate,
      valuesMode,
      fiscalYear,
      financeBook,
      currency,
      showZeroValues,
      showGroupAccounts,
      toggleNode,
      collapseAll,
      expandAll,
      setLevel,
      runReport,
      cancelReport,
      confirmReportReady,
      activeJobId,
      selectExecution,
      primaryActionLabel,
      primaryActionButtonProps,
      onPrimaryAction,
    ]
  )

  return (
    <StockAnalyticsReportContext.Provider value={value}>
      {children}
    </StockAnalyticsReportContext.Provider>
  )
}

export function useStockAnalyticsReport() {
  const context = React.useContext(StockAnalyticsReportContext)
  if (!context) {
    throw new Error(
      "useStockAnalyticsReport must be used within StockAnalyticsReportProvider"
    )
  }
  return context
}
