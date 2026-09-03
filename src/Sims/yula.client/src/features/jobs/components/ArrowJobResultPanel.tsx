"use client";

import * as React from "react"
import { useYulaGridStore } from "@/lib/stores/grid"
import { Spinner } from "@/components/ui/spinner"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { useJobSync } from "@/context/job-sync-context"
import { fetchJobStatus } from "@/features/jobs/arrow-job-client"
import { opfsReportCache } from "@/services/opfs/opfs-cache"
import { ApiError } from "@/services"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"
import { ArrowReportGrid } from "@/features/jobs/components/ArrowReportGrid"
import { findReport } from "@/features/reports/report-registry"
import { readReportAiMetadata } from "@/lib/report-ai-metadata"
import { cn } from "@/utils/cn"

function formatReportTitle(name?: string | null, fallback = "Report"): string {
  const raw = name?.trim()
  if (!raw) return fallback
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

export type ArrowJobResultPanelProps = {
  jobId: string
  /** Title shown until the job name resolves. */
  title?: string
  className?: string
  /** Grid-level errors are surfaced here in addition to the inline banner. */
  onError?: (message: string | null) => void
}

/**
 * Reusable result panel (panel 3 of the report run flow): waits for the job
 * to reach a terminal state, then renders the standard OPFS + WASM
 * `<ArrowReportGrid />`. Embedded on the criteria page and shared by the
 * dedicated `/<report>/<jobId>` result pages.
 */
export function ArrowJobResultPanel({
  jobId,
  title,
  className,
  onError,
}: ArrowJobResultPanelProps) {
  const fallbackTitle = title ?? "Report"

  const { waitUntilTerminal } = useJobSync()

  const [reportTitle, setReportTitle] = React.useState(fallbackTitle)
  const [error, setError] = React.useState<string | null>(null)
  const [showFilterRow, setShowFilterRow] = React.useState(true)
  const [reportUrl, setReportUrl] = React.useState<string | null>(null)
  const [expectedTotalRows, setExpectedTotalRows] = React.useState<number | null>(null)
  const [columnDescriptions, setColumnDescriptions] = React.useState<Record<string, string> | undefined>()
  const [reportScope, setReportScope] = React.useState<string | undefined>()

  const onErrorRef = React.useRef(onError)
  onErrorRef.current = onError

  const pushError = React.useCallback((message: string | null) => {
    setError(message)
    onErrorRef.current?.(message)
  }, [])

  const runIdRef = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)

  // Yula evre bildirimi: sonuç açılır açılmaz kayıt (grid mount öncesi).
  React.useEffect(() => {
    if (!jobId) return
    useYulaGridStore.getState().register({
      tableName: `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      title: reportTitle,
      columns: [],
      rowCount: null,
    })
    return () => {
      useYulaGridStore.getState().unregister()
    }
  }, [jobId, reportTitle])

  /**
   * Sunucu job kaydını bilmiyorsa (restart / silinmiş kayıt) ama yerel OPFS
   * `.arrow` cache varsa raporu cache'ten aç. jobUrl desenine yine server
   * ucu yazılır; stream manager önce OPFS cache'i tercih eder, 404'e düşmez.
   */
  const openFromLocalCache = React.useCallback(async (): Promise<boolean> => {
    const cached = await opfsReportCache.has(jobId)
    if (!cached) {
      pushError("Job bulunamadı")
      return false
    }
    setReportUrl(`/api/arrow/jobs/${jobId}`)
    return true
  }, [jobId, pushError])

  React.useEffect(() => {
    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setReportUrl(null)
    setExpectedTotalRows(null)
    setError(null)
    setReportTitle(fallbackTitle)
    setColumnDescriptions(undefined)
    setReportScope(undefined)

    const load = async () => {
      try {
        const job = await fetchJobStatus(jobId, abort.signal)
        if (runIdRef.current !== runId) return

        if (job?.name) {
          setReportTitle(formatReportTitle(job.name, fallbackTitle))
          // Kolon açıklamaları: rapor şemasının x-ai.columnDescriptions'ı
          // (yetkili semantik tanım — Yula kolonları tahmin etmez)
          const report = findReport(job.name) ?? findReport(job.name.toLowerCase())
          setColumnDescriptions(
            report ? readReportAiMetadata(report.fullSchema).columnDescriptions : undefined,
          )
          setReportScope(report?.scope)
        }

        if (!job?.jobUrl) {
          await openFromLocalCache()
          return
        }

        const jobStatus = job.status || ""

        if (jobStatus === "Failed") {
          pushError(job.error || "Job failed")
          return
        }
        if (jobStatus === "Cancelled") {
          pushError("Job cancelled")
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

          if (terminal.name) setReportTitle(formatReportTitle(terminal.name, fallbackTitle))

          if (terminal.status === "Completed") {
            const fresh = await fetchJobStatus(jobId, abort.signal)
            if (runIdRef.current !== runId) return
            if (fresh?.name) setReportTitle(formatReportTitle(fresh.name, fallbackTitle))
            if (!fresh?.jobUrl) {
              pushError("Job sonucu bulunamadı")
              return
            }
            setExpectedTotalRows(fresh.totalRows ?? null)
            setReportUrl(fresh.jobUrl)
            return
          }

          if (terminal.status === "Cancelled") {
            pushError("Job cancelled")
            return
          }

          pushError(terminal.error || "Job failed")
          return
        }

        pushError(`Unexpected status: ${jobStatus || "unknown"}`)
      } catch (err) {
        if (runIdRef.current !== runId) return
        if (abort.signal.aborted) return
        // Sunucuya ulaşılamadı / job kaydı yok — yerel cache kurtarır
        const opened = await openFromLocalCache()
        if (runIdRef.current !== runId) return
        if (!opened) {
          pushError(errorMessage(err, "Sonuç yüklenemedi"))
        }
      }
    }

    void load()
    return () => {
      abort.abort()
    }
  }, [jobId, fallbackTitle, waitUntilTerminal, pushError, openFromLocalCache])

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        className
      )}
    >
      {error ? (
        <WorkspaceBanner tone="error">
          <span title={error}>{error}</span>
        </WorkspaceBanner>
      ) : null}

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
          onError={pushError}
          className="min-h-0 flex-1"
        />
      ) : null}
    </div>
  )
}
