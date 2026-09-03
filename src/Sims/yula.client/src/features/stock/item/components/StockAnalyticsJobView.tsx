"use client";

import { useYulaGridStore } from "@/lib/stores/grid";
import * as React from "react"
import Link from "next/link";
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
import { findReport } from "@/features/reports/report-registry"
import { readReportAiMetadata } from "@/lib/report-ai-metadata"

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
 * Standard OPFS report grid — Criteria lives on the entry page.
 */
export function StockAnalyticsJobView({ jobId }: StockAnalyticsJobViewProps) {
  React.useEffect(() => {
    if (!jobId) return;
    useYulaGridStore.getState().register({
      tableName: `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      title: "Stok Analiz Raporu",
      columns: [],
      rowCount: null,
    });
    return () => {
      useYulaGridStore.getState().unregister();
    };
  }, [jobId]);

  const { waitUntilTerminal } = useJobSync()

  const [reportTitle, setReportTitle] = React.useState(DEFAULT_REPORT_TITLE)
  const [error, setError] = React.useState<string | null>(null)
  const [showFilterRow, setShowFilterRow] = React.useState(true)
  const [reportUrl, setReportUrl] = React.useState<string | null>(null)
  const [expectedTotalRows, setExpectedTotalRows] = React.useState<number | null>(null)
  const [columnDescriptions, setColumnDescriptions] = React.useState<Record<string, string> | undefined>()
  const [reportScope, setReportScope] = React.useState<string | undefined>("stock-analytics")

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
    setColumnDescriptions(undefined)
    setReportScope("stock-analytics")

    const load = async () => {
      try {
        const job = await fetchJobStatus(jobId, abort.signal)
        if (runIdRef.current !== runId) return

        if (job?.name) {
          setReportTitle(formatReportTitle(job.name))
          const report = findReport(job.name) ?? findReport(job.name.toLowerCase())
          setColumnDescriptions(
            report ? readReportAiMetadata(report.fullSchema).columnDescriptions : undefined,
          )
          if (report?.scope) setReportScope(report.scope)
        }

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
              <Link href={STOCK_ANALYTICS_PATH}>
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
                <Link href="/stock">Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbPage className="text-foreground">Reports</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <Link href={STOCK_ANALYTICS_PATH}>Stock Analytics</Link>
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
          <div className="flex items-center justify-between w-full">
            <span title={error}>{error}</span>
            <Link
              href={STOCK_ANALYTICS_PATH}
              className="underline text-xs font-semibold ml-4 hover:opacity-80"
            >
              Yeni Rapor Başlat →
            </Link>
          </div>
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
              columnDescriptions={columnDescriptions}
              reportScope={reportScope}
              onError={setError}
              className="min-h-0 flex-1"
            />
          ) : null}
        </div>
      </WorkspaceAiDock>
    </div>
  )
}
