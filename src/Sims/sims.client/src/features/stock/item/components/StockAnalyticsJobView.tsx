import * as React from "react"
import { Link } from "react-router-dom"
import { ChevronDown, Printer } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { useJobSync } from "@/context/job-sync-provider"
import { fetchJobRequest, fetchJobStatus } from "@/features/jobs/arrow-job-client"
import { ApiError } from "@/services"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"
import { stockAnalyticsService } from "../services/stock-analytics-service"
import type {
  ReportColumn,
  ReportGridRow,
  StockAnalyticsRequest,
} from "../types/stock-analytics"
import { printStockAnalyticsReport } from "./printStockAnalyticsReport"
import {
  StockAnalyticsResultGrid,
  type StockAnalyticsResultGridHandle,
} from "./StockAnalyticsResultGrid"

const STOCK_ANALYTICS_PATH = "/stock/stock-analytics"
const DEFAULT_REPORT_TITLE = "Stock Analytics"

function formatReportTitle(name?: string | null): string {
  const raw = name?.trim()
  if (!raw) return DEFAULT_REPORT_TITLE
  if (raw.toLowerCase() === "stock-analytics") return DEFAULT_REPORT_TITLE
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (
      typeof error.body === "object" &&
      error.body &&
      "error" in error.body
    ) {
      const bodyError = (error.body as { error?: unknown }).error
      if (typeof bodyError === "string" && bodyError.trim()) return bodyError
    }
    return error.message || fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

type StockAnalyticsJobViewProps = {
  jobId: string
}

/**
 * Dedicated Stock Analytics result page (`/stock/stock-analytics/{guid}`).
 * Tree grid only — Criteria lives on the entry page.
 */
export function StockAnalyticsJobView({ jobId }: StockAnalyticsJobViewProps) {
  const { waitUntilTerminal } = useJobSync()
  const gridRef = React.useRef<StockAnalyticsResultGridHandle>(null)

  const [columns, setColumns] = React.useState<ReportColumn[]>([])
  const [rows, setRows] = React.useState<ReportGridRow[]>([])
  const [reportTitle, setReportTitle] = React.useState(DEFAULT_REPORT_TITLE)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [showFilterRow, setShowFilterRow] = React.useState(true)
  const [treeLevel, setTreeLevel] = React.useState("2")
  const [isPrinting, setIsPrinting] = React.useState(false)

  const runIdRef = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setLoading(true)
    setError(null)
    setColumns([])
    setRows([])
    setReportTitle(DEFAULT_REPORT_TITLE)

    const loadReport = async (
      jobUrl: string,
      request: StockAnalyticsRequest
    ) => {
      const report = await stockAnalyticsService.fetchReport(
        jobUrl,
        request,
        abort.signal
      )
      if (runIdRef.current !== runId) return
      setColumns(report.columns)
      setRows(report.rows)
      setLoading(false)
    }

    const load = async () => {
      try {
        const job = await fetchJobStatus(jobId, abort.signal)
        if (runIdRef.current !== runId) return

        if (job?.name) setReportTitle(formatReportTitle(job.name))

        if (!job?.jobUrl) {
          setError("Job bulunamadı")
          setLoading(false)
          return
        }

        const requestBody =
          ((await fetchJobRequest(jobId, abort.signal)) as
            | StockAnalyticsRequest
            | null) ?? {}
        if (runIdRef.current !== runId) return

        const jobStatus = job.status || ""

        if (jobStatus === "Failed") {
          setError(job.error || "Job failed")
          setLoading(false)
          return
        }
        if (jobStatus === "Cancelled") {
          setError("Job cancelled")
          setLoading(false)
          return
        }

        if (jobStatus === "Completed") {
          await loadReport(job.jobUrl, requestBody)
          return
        }

        if (!isTerminalJobStatus(jobStatus)) {
          const terminal = await waitUntilTerminal(jobId, {
            signal: abort.signal,
          })
          if (runIdRef.current !== runId) return

          if (terminal.name) setReportTitle(formatReportTitle(terminal.name))

          if (terminal.status === "Completed") {
            const fresh = await fetchJobStatus(jobId, abort.signal)
            if (runIdRef.current !== runId) return
            if (fresh?.name) setReportTitle(formatReportTitle(fresh.name))
            if (!fresh?.jobUrl) {
              setError("Job sonucu bulunamadı")
              setLoading(false)
              return
            }
            await loadReport(fresh.jobUrl, requestBody)
            return
          }

          if (terminal.status === "Cancelled") {
            setError("Job cancelled")
            setLoading(false)
            return
          }

          setError(terminal.error || "Job failed")
          setLoading(false)
          return
        }

        setError(`Unexpected status: ${jobStatus || "unknown"}`)
        setLoading(false)
      } catch (err) {
        if (runIdRef.current !== runId) return
        if (abort.signal.aborted) return
        setError(errorMessage(err, "Sonuç yüklenemedi"))
        setLoading(false)
      }
    }

    void load()
    return () => {
      abort.abort()
    }
  }, [jobId, waitUntilTerminal])

  const reportReady = columns.length > 0 && !loading && !error
  const shortId = jobId.slice(0, 8)

  const handlePrint = React.useCallback(async () => {
    if (isPrinting) return
    setIsPrinting(true)
    try {
      await printStockAnalyticsReport()
    } finally {
      setIsPrinting(false)
    }
  }, [isPrinting])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden h-7 text-xs gap-1 px-2.5 lg:inline-flex"
                  disabled={!reportReady}
                >
                  Options
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  disabled={!reportReady}
                  onClick={() => gridRef.current?.expandAll()}
                >
                  Expand All
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!reportReady}
                  onClick={() => gridRef.current?.collapseAll()}
                >
                  Collapse All
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Input
                    value={treeLevel}
                    onChange={(event) => setTreeLevel(event.target.value)}
                    className="h-7 w-12 text-center text-xs"
                    disabled={!reportReady}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    disabled={!reportReady}
                    onClick={(event) => {
                      event.preventDefault()
                      const level = Number.parseInt(treeLevel, 10)
                      gridRef.current?.setLevel(
                        Number.isFinite(level) ? level : 2
                      )
                    }}
                  >
                    Set Level
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-7 text-xs gap-1.5 px-2.5 lg:inline-flex"
              disabled={!reportReady || isPrinting}
              onClick={() => {
                void handlePrint()
              }}
            >
              <Printer className="size-3.5" />
              {isPrinting ? "Preparing…" : "Print"}
            </Button>

            <AIChatAssistant variant="toolbar" separator={false} />
          </div>
        }
      >
        <Breadcrumb className="min-w-0 overflow-hidden">
          <BreadcrumbList className="flex-nowrap text-xs">
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbLink asChild>
                <Link to="/stock">Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbLink asChild>
                <Link to="/stock">Reports</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <Link to={STOCK_ANALYTICS_PATH}>Stock Analytics</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="block truncate font-semibold text-foreground">
                {shortId}…
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>

      <WorkspaceAiDock className="overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-2 pb-2 pt-0">
          {error ? (
            <p className="shrink-0 text-xs text-destructive">{error}</p>
          ) : null}
          {loading && columns.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              Loading result…
            </div>
          ) : (
            <StockAnalyticsResultGrid
              ref={gridRef}
              columns={columns}
              rows={rows}
              title={reportTitle}
              showFilterRow={showFilterRow}
              onShowFilterRowChange={setShowFilterRow}
              className="min-h-0 flex-1"
            />
          )}
        </div>
      </WorkspaceAiDock>
    </div>
  )
}
