import * as React from "react"
import { Link } from "react-router-dom"
import { FilePlus2 } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { useJobSync } from "@/context/job-sync-context"
import { fetchJobStatus } from "@/features/jobs/arrow-job-client"
import { ApiError } from "@/services"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"
import { ArrowReportGrid } from "@/features/jobs/components/ArrowReportGrid"

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

  const [reportTitle, setReportTitle] = React.useState(DEFAULT_REPORT_TITLE)
  const [error, setError] = React.useState<string | null>(null)
  const [showFilterRow, setShowFilterRow] = React.useState(true)
  const [reportUrl, setReportUrl] = React.useState<string | null>(null)
  const [expectedTotalRows, setExpectedTotalRows] = React.useState<number | null>(null)

  const runIdRef = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setReportUrl(null)
    setExpectedTotalRows(null)
    setError(null)
    setReportTitle(DEFAULT_REPORT_TITLE)

    const load = async () => {
      try {
        const job = await fetchJobStatus(jobId, abort.signal)
        if (runIdRef.current !== runId) return

        if (job?.name) setReportTitle(formatReportTitle(job.name))

        if (!job?.jobUrl) {
          setError("Job bulunamadı")
          return
        }

        const jobStatus = job.status || ""

        if (jobStatus === "Failed") {
          setError(job.error || "Job failed")
          return
        }
        if (jobStatus === "Cancelled") {
          setError("Job cancelled")
          return
        }

        if (jobStatus === "Completed") {
          setExpectedTotalRows(job.totalRows ?? null)
          setReportUrl(job.jobUrl)
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
              return
            }
            setExpectedTotalRows(fresh.totalRows ?? null)
            setReportUrl(fresh.jobUrl)
            return
          }

          if (terminal.status === "Cancelled") {
            setError("Job cancelled")
            return
          }

          setError(terminal.error || "Job failed")
          return
        }

        setError(`Unexpected status: ${jobStatus || "unknown"}`)
      } catch (err) {
        if (runIdRef.current !== runId) return
        if (abort.signal.aborted) return
        setError(errorMessage(err, "Sonuç yüklenemedi"))
      }
    }

    void load()
    return () => {
      abort.abort()
    }
  }, [jobId, waitUntilTerminal])

  const shortId = jobId.slice(0, 8)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              <Link to={STOCK_BALANCE_PATH}>
                <FilePlus2 className="size-3.5" />
                New
              </Link>
            </Button>
            <AIChatAssistant />
          </div>
        }
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
          {!reportUrl && !error ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              Loading result…
            </div>
          ) : reportUrl ? (
            <ArrowReportGrid
              jobId={jobId}
              jobUrl={reportUrl}
              expectedTotalRows={expectedTotalRows}
              title={reportTitle}
              showFilterRow={showFilterRow}
              onShowFilterRowChange={setShowFilterRow}
              onError={setError}
              className="min-h-0 flex-1"
            />
          ) : null}
        </div>
      </WorkspaceAiDock>
    </div>
  )
}
