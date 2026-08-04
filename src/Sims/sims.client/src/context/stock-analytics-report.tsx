import * as React from "react"
import { useWorkspaceNotifications } from "@/context/workspace-notifications"
import { ApiError } from "@/services"
import { stockAnalyticsService } from "@/features/stock/item/services/stock-analytics-service"
import type {
  ArrowJobEvent,
  ReportColumn,
  ReportGridRow,
} from "@/features/stock/item/types/stock-analytics"

export type ReportRunStatus = "idle" | "running" | "done" | "cancelled"

export type RunEventItem = {
  id: string
  eventName: string
  title: string
  detail: string
  tone: "muted" | "success" | "danger"
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
  openReportFromNotification: () => void
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
  const { pushNotification } = useWorkspaceNotifications()

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

  const cancelReport = React.useCallback(() => {
    runIdRef.current += 1
    abortRef.current?.abort()
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
  }, [])

  const confirmReportReady = React.useCallback(() => {
    if (reportColumns.length === 0) return
    setReportReady(true)
    setRunStatus("idle")
  }, [reportColumns.length])

  const openReportFromNotification = React.useCallback(() => {
    // Bildirim yalnızca sayfaya yönlendirir; tamamlanan raporda View akışını korur.
  }, [])

  const hasPendingReport = reportColumns.length > 0 && !reportReady
  const isPendingView = runStatus === "done" || hasPendingReport

  React.useEffect(() => {
    if (hasPendingReport && runStatus === "idle") {
      setRunStatus("done")
    }
  }, [hasPendingReport, runStatus])

  const runReport = React.useCallback(async () => {
    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

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

    try {
      const report = await stockAnalyticsService.runReport(
        {
          fromDate,
          toDate,
          fiscalYear,
          financeBook: financeBook || undefined,
          currency: currency || "inr",
          valuesMode,
          showZeroValues,
          showGroupAccounts,
        },
        {
          signal: abort.signal,
          onEvent: (eventName, payload) => {
            if (runIdRef.current !== runId) return
            setRunEvents((prev) =>
              appendOrUpdateRunEvent(prev, eventName, payload)
            )
          },
        }
      )

      if (runIdRef.current !== runId) return

      setReportColumns(report.columns)
      setReportRows(report.rows)
      setExpandedNodes(expandAllIds(report.rows))

      pushNotification({
        title: "Stock Analytics Ready",
        description:
          "Stock Analytics raporu tamamlandı. Açmak için bildirime tıklayın.",
        type: "report",
        href: "/stock/stock-analytics",
      })
      setRunStatus("done")
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (abort.signal.aborted) {
        setRunStatus("cancelled")
        return
      }
      const message =
        error instanceof ApiError
          ? typeof error.body === "object" &&
            error.body &&
            "error" in error.body
            ? String((error.body as { error?: string }).error)
            : error.message
          : error instanceof Error
            ? error.message
            : "Rapor alınamadı"
      setRunEvents((prev) => [
        ...prev,
        {
          id: `error-${prev.length}`,
          eventName: "failed",
          title: "Failed",
          detail: message,
          tone: "danger",
        },
      ])
      pushNotification({
        title: "Stock Analytics Failed",
        description: message,
        type: "report",
      })
      setRunStatus("idle")
      setReportReady(false)
    }
  }, [
    pushNotification,
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
      openReportFromNotification,
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
      openReportFromNotification,
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
