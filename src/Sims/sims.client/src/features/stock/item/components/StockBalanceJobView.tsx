import * as React from "react"
import { Link } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Spinner } from "@/components/ui/spinner"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { useJobSync } from "@/context/job-sync-context"
import { fetchJobStatus } from "@/features/jobs/arrow-job-client"
import { ApiError } from "@/services"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"
import {
  fetchStockBalanceArrowReport,
  type StockBalanceColumn,
  type StockBalanceGridRow,
} from "../services/stock-balance-arrow"
import { StockBalanceResultGrid } from "./StockBalanceResultGrid"

const STOCK_BALANCE_PATH = "/stock/stock-balance"
const DEFAULT_REPORT_TITLE = "Stock Balance"

function formatReportTitle(name?: string | null): string {
  const raw = name?.trim()
  if (!raw) return DEFAULT_REPORT_TITLE
  if (raw.toLowerCase() === "stock-balance") return DEFAULT_REPORT_TITLE
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

type StockBalanceJobViewProps = {
  jobId: string
}

/**
 * Dedicated Stock Balance result page (`/stock/stock-balance/{guid}`).
 * Spreadsheet result only — Query panel lives on the criteria page.
 */
export function StockBalanceJobView({ jobId }: StockBalanceJobViewProps) {
  const { waitUntilTerminal } = useJobSync()

  const [columns, setColumns] = React.useState<StockBalanceColumn[]>([])
  const [rows, setRows] = React.useState<StockBalanceGridRow[]>([])
  const [reportTitle, setReportTitle] = React.useState(DEFAULT_REPORT_TITLE)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [showFilterRow, setShowFilterRow] = React.useState(true)

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

    const loadReport = async (jobUrl: string) => {
      const report = await fetchStockBalanceArrowReport(jobUrl, abort.signal)
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
          await loadReport(job.jobUrl)
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
            await loadReport(fresh.jobUrl)
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

  const shortId = jobId.slice(0, 8)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={<AIChatAssistant variant="toolbar" />}
      >
        <Breadcrumb className="min-w-0 overflow-hidden">
          <BreadcrumbList className="flex-nowrap text-xs">
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbLink asChild>
                <Link to="/stock" state={{ yulaClosed: true }}>Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbPage className="text-foreground">Reports</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <Link to={STOCK_BALANCE_PATH}>Stock Balance</Link>
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

      {error ? (
        <WorkspaceBanner tone="error">
          <span title={error}>{error}</span>
        </WorkspaceBanner>
      ) : null}

      <WorkspaceAiDock className="overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-2 pb-2 pt-0">
          {loading && columns.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              Loading result…
            </div>
          ) : (
            <StockBalanceResultGrid
              columns={columns}
              rows={rows}
              title={reportTitle}
              reportId={jobId}
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
