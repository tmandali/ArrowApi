import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/utils/cn"
import { useWorkspaceNotifications } from "@/context/workspace-notifications"
import { ApiError } from "@/services"
import { stockAnalyticsService } from "../services/stock-analytics-service"
import type {
  ArrowJobEvent,
  ReportColumn,
  ReportGridRow,
} from "../types/stock-analytics"
import {
  BookOpen,
  Calendar as CalendarIcon,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Layers,
  Play,
  Search,
  X,
  Check,
} from "lucide-react"

const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

const cellClass =
  "p-0 border-r border-b border-border/60 last:border-r-0 align-middle"
const headClass =
  "h-8 px-2 py-1.5 border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-tight text-muted-foreground bg-muted/40 align-middle"

function collectIds(rows: ReportGridRow[]): string[] {
  return rows.flatMap((row) => [
    row.id,
    ...(row.children ? collectIds(row.children) : []),
  ])
}

function expandAllIds(rows: ReportGridRow[]): Record<string, boolean> {
  return Object.fromEntries(collectIds(rows).map((id) => [id, true]))
}

type RunEventItem = {
  id: string
  eventName: string
  title: string
  detail: string
  tone: "muted" | "success" | "danger"
}

/** Shared layout % — Filters panel and Account column stay aligned. */
const FILTERS_WIDTH_PERCENT = 20
const REPORT_WIDTH_PERCENT = 100 - FILTERS_WIDTH_PERCENT
const ACCOUNT_COL_STYLE = { width: `${FILTERS_WIDTH_PERCENT}%` } as const

type FilterKey =
  | "values"
  | "fiscalYear"
  | "dateRange"
  | "financeBook"
  | "currency"

const filterCriteria: {
  key: FilterKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  options: { value: string; label: string }[]
}[] = [
  {
    key: "values",
    label: "Values",
    icon: Layers,
    options: [
      { value: "5-values", label: "5 values selected" },
      { value: "all", label: "All Values" },
    ],
  },
  {
    key: "fiscalYear",
    label: "Fiscal Year",
    icon: CalendarRange,
    options: [
      { value: "2025-2026", label: "2025-2026" },
      { value: "2024-2025", label: "2024-2025" },
    ],
  },
  {
    key: "dateRange",
    label: "Date Range",
    icon: CalendarIcon,
    options: [
      { value: "fy-current", label: "Current Fiscal Year" },
      { value: "fy-prev", label: "Previous Fiscal Year" },
    ],
  },
  {
    key: "financeBook",
    label: "Finance Book",
    icon: BookOpen,
    options: [
      { value: "Main Book", label: "Main Book" },
      { value: "Tax Book", label: "Tax Book" },
    ],
  },
  {
    key: "currency",
    label: "Currency",
    icon: CircleDollarSign,
    options: [
      { value: "inr", label: "INR (₹)" },
      { value: "try", label: "TRY (₺)" },
      { value: "usd", label: "USD ($)" },
    ],
  },
]

const formatFilterDate = (date?: Date) =>
  date ? date.toLocaleDateString("en-GB").replace(/\//g, "-") : undefined

type ReportRunStatus = "idle" | "running" | "done" | "cancelled"

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
  // Batch row progress: tek satırda rows sayısını güncelle
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

export type StockAnalyticsTreeAction =
  | { id: number; type: "expand-all" }
  | { id: number; type: "collapse-all" }
  | { id: number; type: "set-level"; level: number }

export function StockAnalyticsReportTab({
  filtersOpen: filtersOpenProp,
  onFiltersOpenChange,
  runReportToken = 0,
  treeAction = null,
  onReportReadyChange,
  showFilterRow = true,
}: {
  filtersOpen?: boolean
  onFiltersOpenChange?: (open: boolean) => void
  runReportToken?: number
  treeAction?: StockAnalyticsTreeAction | null
  onReportReadyChange?: (ready: boolean) => void
  showFilterRow?: boolean
} = {}) {
  const [expandedNodes, setExpandedNodes] =
    React.useState<Record<string, boolean>>({})
  const [reportRows, setReportRows] = React.useState<ReportGridRow[]>([])
  const [reportColumns, setReportColumns] = React.useState<ReportColumn[]>([])
  const [runEvents, setRunEvents] = React.useState<RunEventItem[]>([])
  const [internalFiltersOpen, setInternalFiltersOpen] = React.useState(true)
  const filtersOpen = filtersOpenProp ?? internalFiltersOpen
  const setFiltersOpen = onFiltersOpenChange ?? setInternalFiltersOpen
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
  const [activeFilter, setActiveFilter] = React.useState<FilterKey | null>(null)
  const [openPicker, setOpenPicker] = React.useState<FilterKey | null>(null)
  const [showZeroValues, setShowZeroValues] = React.useState(false)
  const [showGroupAccounts, setShowGroupAccounts] = React.useState(true)
  const [runStatus, setRunStatus] = React.useState<ReportRunStatus>("idle")
  const [reportReady, setReportReady] = React.useState(false)
  const runIdRef = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)
  const isMountedRef = React.useRef(true)
  const running = runStatus === "running"
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushNotification } = useWorkspaceNotifications()

  React.useEffect(() => {
    onReportReadyChange?.(reportReady)
  }, [reportReady, onReportReadyChange])

  React.useEffect(() => {
    return () => onReportReadyChange?.(false)
  }, [onReportReadyChange])

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const openReportFromNotification = React.useCallback(() => {
    setReportReady(true)
    setRunStatus("idle")
  }, [])

  React.useEffect(() => {
    if (searchParams.get("openReport") !== "1") return
    openReportFromNotification()
    const next = new URLSearchParams(searchParams)
    next.delete("openReport")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, openReportFromNotification])

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

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
    setReportReady(true)
    setRunStatus("idle")
  }, [])

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
        href: "/stock/stock-analytics?openReport=1",
      })
      if (!isMountedRef.current) return
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
      if (!isMountedRef.current) return
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
      : runStatus === "done"
        ? "View"
        : "Execute"

  const primaryActionButtonProps = (() => {
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
  })()

  const onPrimaryAction = React.useCallback(() => {
    if (runStatus === "running") {
      cancelReport()
      return
    }
    if (runStatus === "done") {
      confirmReportReady()
      return
    }
    void runReport()
  }, [runStatus, cancelReport, confirmReportReady, runReport])

  React.useEffect(() => {
    if (runReportToken > 0) {
      void runReport()
    }
  }, [runReportToken, runReport])

  React.useEffect(() => {
    if (!treeAction) return
    if (treeAction.type === "expand-all") {
      expandAll()
      return
    }
    if (treeAction.type === "collapse-all") {
      collapseAll()
      return
    }
    setLevel(treeAction.level)
  }, [treeAction, expandAll, collapseAll, setLevel])

  const currencyLabel =
    currency === "try"
      ? "TRY (₺)"
      : currency === "usd"
        ? "USD ($)"
        : currency === "inr"
          ? "INR (₹)"
          : ""
  const valuesLabel =
    valuesMode === "all"
      ? "All Values"
      : valuesMode === "5-values"
        ? "5 values selected"
        : ""
  const dateRangeLabel = [formatFilterDate(fromDate), formatFilterDate(toDate)]
    .filter(Boolean)
    .join(" → ")

  const filterChips: Record<FilterKey, string[]> = {
    values: valuesLabel ? [valuesLabel] : [],
    fiscalYear: fiscalYear ? [fiscalYear] : [],
    dateRange: dateRangeLabel ? [dateRangeLabel] : [],
    financeBook: financeBook ? [financeBook] : [],
    currency: currencyLabel ? [currencyLabel] : [],
  }

  const selectedValue: Record<FilterKey, string> = {
    values: valuesMode,
    fiscalYear,
    dateRange: "",
    financeBook,
    currency,
  }

  const applyFilterOption = (key: FilterKey, value: string) => {
    switch (key) {
      case "values":
        setValuesMode(value)
        break
      case "fiscalYear":
        setFiscalYear(value)
        break
      case "dateRange":
        if (value === "fy-current") {
          setFromDate(new Date(2025, 3, 1))
          setToDate(new Date(2026, 2, 31))
        } else if (value === "fy-prev") {
          setFromDate(new Date(2024, 3, 1))
          setToDate(new Date(2025, 2, 31))
        }
        break
      case "financeBook":
        setFinanceBook(value)
        break
      case "currency":
        setCurrency(value)
        break
      default: {
        const _exhaustive: never = key
        return _exhaustive
      }
    }
  }

  const clearFilter = (key: FilterKey) => {
    switch (key) {
      case "values":
        setValuesMode("")
        break
      case "fiscalYear":
        setFiscalYear("")
        break
      case "dateRange":
        setFromDate(undefined)
        setToDate(undefined)
        break
      case "financeBook":
        setFinanceBook("")
        break
      case "currency":
        setCurrency("")
        break
      default: {
        const _exhaustive: never = key
        return _exhaustive
      }
    }
  }

  const activeFilterMeta = filterCriteria.find((c) => c.key === activeFilter)

  const showGrid = reportReady && runStatus === "idle" && reportColumns.length > 0
  const showRunSteps =
    runStatus === "running" ||
    runStatus === "cancelled" ||
    runStatus === "done"

  const renderRows = (rows: ReportGridRow[], depth = 0): React.ReactNode =>
    rows.map((row) => {
      const hasChildren = !!row.children?.length
      const isExpanded = !!expandedNodes[row.id]

      return (
        <React.Fragment key={row.id}>
          <tr className="hover:bg-muted/30 text-xs">
            {reportColumns.map((col) => {
              if (col.kind === "account") {
                return (
                  <td key={col.name} className={cellClass}>
                    <div
                      className="flex h-7 items-center gap-1.5 px-2 whitespace-nowrap"
                      style={{ paddingLeft: `${8 + depth * 16}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggleNode(row.id)}
                          className="size-4 inline-flex shrink-0 items-center justify-center rounded hover:bg-muted text-muted-foreground"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              !isExpanded && "-rotate-90"
                            )}
                          />
                        </button>
                      ) : (
                        <span className="size-4 inline-block shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate font-medium",
                          hasChildren
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {row.name}
                      </span>
                    </div>
                  </td>
                )
              }

              return (
                <td key={col.name} className={cellClass}>
                  <div
                    className={cn(
                      "flex h-7 items-center justify-end px-2 whitespace-nowrap",
                      col.name === "Debit" || col.name === "ClosingDr"
                        ? "font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {row.values[col.name] ?? "—"}
                  </div>
                </td>
              )
            })}
          </tr>
          {hasChildren && isExpanded
            ? renderRows(row.children!, depth + 1)
            : null}
        </React.Fragment>
      )
    })

  return (
    <ResizablePanelGroup
      key={filtersOpen ? "split" : "full"}
      orientation="horizontal"
      className="h-full min-h-0 w-full"
    >
      <ResizablePanel
        defaultSize={filtersOpen ? String(REPORT_WIDTH_PERCENT) : "100"}
        minSize="45"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden p-4 gap-3">
          {showGrid ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
              <div className="shrink-0 border-b">
                <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                  <colgroup>
                    {reportColumns.map((col) => (
                      <col
                        key={col.name}
                        style={
                          col.kind === "account" ? ACCOUNT_COL_STYLE : undefined
                        }
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {reportColumns.map((col) => (
                        <th
                          key={col.name}
                          className={cn(
                            headClass,
                            col.align === "left" ? "text-left" : "text-right"
                          )}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                    {showFilterRow ? (
                    <tr className="bg-muted/10">
                      {reportColumns.map((col, index) => (
                        <th key={col.name} className={cellClass}>
                          <Input
                            className={cn(
                              cellInputClass,
                              index > 0 && "text-right"
                            )}
                            placeholder={index === 0 ? "Filter…" : undefined}
                          />
                        </th>
                      ))}
                    </tr>
                    ) : null}
                  </thead>
                </table>
              </div>

              <ScrollArea className="h-0 min-h-0 w-full flex-1">
                <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                  <colgroup>
                    {reportColumns.map((col) => (
                      <col
                        key={col.name}
                        style={
                          col.kind === "account" ? ACCOUNT_COL_STYLE : undefined
                        }
                      />
                    ))}
                  </colgroup>
                  <tbody>{renderRows(reportRows)}</tbody>
                </table>
              </ScrollArea>
            </div>
          ) : showRunSteps ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-4 px-1 pb-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold tracking-tight">
                    {runStatus === "cancelled"
                      ? "Report cancelled"
                      : runStatus === "done"
                        ? "Report ready"
                        : "Running Stock Analytics"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Arrow job · live SSE
                  </p>
                </div>
              </div>

              <ScrollArea className="h-0 min-h-0 w-full flex-1">
                <div className="flex flex-col gap-2.5 px-1 pr-3 pb-2">
                  {runEvents.map((step, index) => {
                    const isCurrent = index === runEvents.length - 1
                    const isComplete =
                      runStatus === "done" ||
                      (runStatus === "running" && !isCurrent) ||
                      (runStatus === "cancelled" && !isCurrent)
                    const isCancelledHere =
                      runStatus === "cancelled" && isCurrent
                    const isFailedHere =
                      step.tone === "danger" && isCurrent
                    const isProgress = step.eventName === "progress"

                    const titleClass = isCancelledHere || isFailedHere
                      ? "font-medium text-amber-500"
                      : isComplete || (isCurrent && step.tone === "success")
                        ? "font-medium text-emerald-600"
                        : isCurrent
                          ? "text-foreground"
                          : "text-muted-foreground/70"

                    const iconClass = isCancelledHere || isFailedHere
                      ? "text-amber-500"
                      : isComplete || (isCurrent && step.tone === "success")
                        ? "text-emerald-600"
                        : "text-muted-foreground"

                    return (
                      <div
                        key={step.id}
                        className="flex items-start gap-2.5"
                      >
                        <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                          {runStatus === "running" && isCurrent ? (
                            <Spinner
                              className={cn("size-3.5", iconClass)}
                            />
                          ) : isComplete && !isCancelledHere && !isFailedHere ? (
                            <Check
                              className={cn("size-3.5", iconClass)}
                            />
                          ) : isCancelledHere || isFailedHere ? (
                            <X className={cn("size-3.5", iconClass)} />
                          ) : (
                            <span className="size-1.5 rounded-full bg-muted-foreground/35" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className={cn("text-sm", titleClass)}>
                              {step.title}
                            </span>
                            {isProgress ? (
                              <span className="tabular-nums text-sm font-medium text-foreground">
                                {step.detail}
                              </span>
                            ) : null}
                          </div>
                          {!isProgress ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {step.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <Empty className="max-w-md border rounded-xl bg-card p-10">
                <EmptyHeader>
                  <EmptyMedia>
                    <AvatarGroup className="*:data-[slot=avatar]:size-12 *:data-[slot=avatar]:grayscale-[0.35] hover:*:data-[slot=avatar]:grayscale-0">
                      <Avatar>
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Layers className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600">
                          <BookOpen className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarFallback className="bg-amber-500/10 text-amber-600">
                          <CircleDollarSign className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                    </AvatarGroup>
                  </EmptyMedia>
                  <EmptyTitle className="text-base font-semibold">
                    No report yet
                  </EmptyTitle>
                  <EmptyDescription>
                    Query panelinden filtreleri seçin ve Execute ile Stock
                    Analytics raporunu Arrow job + SSE akışıyla üretin.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    size="sm"
                    className={cn(
                      "h-8 gap-1.5 text-xs",
                      primaryActionButtonProps.className
                    )}
                    variant={primaryActionButtonProps.variant}
                    onClick={onPrimaryAction}
                  >
                    <Play className="size-3.5" />
                    Execute Report
                  </Button>
                </EmptyContent>
              </Empty>
            </div>
          )}
        </div>
      </ResizablePanel>

      {filtersOpen ? (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={String(FILTERS_WIDTH_PERCENT)}
            minSize={String(FILTERS_WIDTH_PERCENT)}
            maxSize="40"
            collapsible
            collapsedSize={0}
            onResize={(size) => {
              if (size.asPercentage <= 0 || size.inPixels <= 0) {
                setFiltersOpen(false)
              }
            }}
          >
            <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/10">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="flex shrink-0 w-full items-center justify-between gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                aria-label="Collapse filters"
              >
                <span className="text-sm font-semibold">Query</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>

              <ScrollArea className="h-0 min-h-0 flex-1">
                <div className="py-1">
                  {filterCriteria.map((criterion) => {
                    const Icon = criterion.icon
                    const chips = filterChips[criterion.key]
                    const isOpen = openPicker === criterion.key
                    return (
                      <div key={criterion.key} className="px-1">
                        <Popover
                          open={isOpen}
                          onOpenChange={(open) =>
                            setOpenPicker(open ? criterion.key : null)
                          }
                        >
                          <PopoverAnchor asChild>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenPicker(isOpen ? null : criterion.key)
                              }
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
                            >
                              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-foreground">
                                {criterion.label}
                              </span>
                            </button>
                          </PopoverAnchor>
                          <PopoverContent
                            align="start"
                            side="bottom"
                            sideOffset={4}
                            className="w-56 gap-0 rounded-md p-1 shadow-md ring-1 ring-border"
                          >
                            <Command className="rounded-md bg-transparent p-0">
                              <CommandList className="max-h-56">
                                <CommandEmpty className="py-3 text-xs">
                                  No results.
                                </CommandEmpty>
                                <CommandGroup className="p-0">
                                  {criterion.options.map((option) => (
                                    <CommandItem
                                      key={option.value}
                                      value={option.label}
                                      data-checked={
                                        selectedValue[criterion.key] ===
                                          option.value || undefined
                                      }
                                      className="rounded-md px-2.5 py-1.5 text-xs"
                                      onSelect={() => {
                                        applyFilterOption(
                                          criterion.key,
                                          option.value
                                        )
                                        setOpenPicker(null)
                                      }}
                                    >
                                      {option.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                              <CommandSeparator />
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                                onClick={() => {
                                  setOpenPicker(null)
                                  setActiveFilter(criterion.key)
                                }}
                              >
                                <Search className="size-3.5 text-muted-foreground" />
                                Advanced Search
                              </button>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {chips.length > 0 ? (
                          <div className="space-y-0.5 pb-1 pl-7 pr-1">
                            {chips.map((chip) => (
                              <div
                                key={chip}
                                className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/40"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {chip}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Clear ${criterion.label}`}
                                  className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-70 transition-opacity hover:text-foreground group-hover:opacity-100"
                                  onClick={() => clearFilter(criterion.key)}
                                >
                                  <X className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  <Separator className="my-2" />

                  <div className="space-y-2.5 px-3 py-1">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="sa-show-zero"
                        checked={showZeroValues}
                        onCheckedChange={(checked) =>
                          setShowZeroValues(!!checked)
                        }
                      />
                      <Label
                        htmlFor="sa-show-zero"
                        className="text-xs font-normal leading-snug cursor-pointer"
                      >
                        Show zero values
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="sa-show-group"
                        checked={showGroupAccounts}
                        onCheckedChange={(checked) =>
                          setShowGroupAccounts(!!checked)
                        }
                      />
                      <Label
                        htmlFor="sa-show-group"
                        className="text-xs font-normal leading-snug cursor-pointer"
                      >
                        Show Group Accounts
                      </Label>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <div className="shrink-0 border-t p-3">
                <Button
                  type="button"
                  className={cn(
                    "w-full h-8 text-xs gap-1.5",
                    primaryActionButtonProps.className
                  )}
                  variant={primaryActionButtonProps.variant}
                  onClick={onPrimaryAction}
                >
                  {runStatus === "running" ? (
                    <X className="size-3.5" />
                  ) : runStatus === "done" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  {primaryActionLabel}
                </Button>
              </div>
            </aside>
          </ResizablePanel>
        </>
      ) : null}

      <Dialog
        open={activeFilter !== null}
        onOpenChange={(open) => {
          if (!open) setActiveFilter(null)
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
            <DialogTitle className="text-sm font-semibold">
              Advanced Search — {activeFilterMeta?.label ?? "Filter"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 p-4 text-xs">
            {activeFilter === "values" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Values
                </Label>
                <Select value={valuesMode || undefined} onValueChange={setValuesMode}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Select values" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5-values">5 values selected</SelectItem>
                    <SelectItem value="all">All Values</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {activeFilter === "fiscalYear" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Fiscal Year
                </Label>
                <Select
                  value={fiscalYear || undefined}
                  onValueChange={setFiscalYear}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Select fiscal year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025-2026">2025-2026</SelectItem>
                    <SelectItem value="2024-2025">2024-2025</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {activeFilter === "dateRange" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    From Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-8 justify-between text-left font-normal text-xs px-2.5"
                      >
                        {formatFilterDate(fromDate) ?? "Start Date"}
                        <CalendarIcon className="size-3.5 text-muted-foreground/60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={fromDate}
                        onSelect={setFromDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    To Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-8 justify-between text-left font-normal text-xs px-2.5"
                      >
                        {formatFilterDate(toDate) ?? "End Date"}
                        <CalendarIcon className="size-3.5 text-muted-foreground/60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={toDate}
                        onSelect={setToDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : null}

            {activeFilter === "financeBook" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Finance Book
                </Label>
                <Input
                  value={financeBook}
                  onChange={(event) => setFinanceBook(event.target.value)}
                  placeholder="Finance Book"
                  className="h-8 text-xs"
                />
              </div>
            ) : null}

            {activeFilter === "currency" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Currency
                </Label>
                <Select
                  value={currency || undefined}
                  onValueChange={setCurrency}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inr">INR (₹)</SelectItem>
                    <SelectItem value="try">TRY (₺)</SelectItem>
                    <SelectItem value="usd">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-4 py-3 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (activeFilter) clearFilter(activeFilter)
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs"
              onClick={() => setActiveFilter(null)}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResizablePanelGroup>
  )
}
