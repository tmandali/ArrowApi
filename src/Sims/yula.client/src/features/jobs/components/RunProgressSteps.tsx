"use client"

import { Check, X } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/ui/marker"
import { Spinner } from "@/components/ui/spinner"
import {
  elapsedSinceStart,
  type RunEventItem,
} from "@/features/jobs/run-events"
import { formatCount } from "@/utils/format"
import { cn } from "@/utils/cn"

/**
 * Live/persisted run steps as marker rows — used by the Detail view and the
 * Live panel (follow mode).
 */
export function RunProgressSteps({
  events,
  phase,
  running,
  loading = false,
  runningOnly = false,
  className,
}: {
  events: RunEventItem[]
  phase: "idle" | "running" | "done" | "cancelled"
  running: boolean
  /** Event-log (history) request in flight. */
  loading?: boolean
  /** In-flight layout: hides the "Progress" separator, shows the waiting hint. */
  runningOnly?: boolean
  className?: string
}) {
  const t = useTranslations("JobExecutions")

  const statusWords: Record<string, string> = {
    Running: t("status_running"),
    Queued: t("status_queued"),
    Completed: t("status_completed"),
    Failed: t("status_failed"),
    Cancelled: t("status_cancelled"),
    Canceled: t("status_cancelled"),
  }
  const titleByEvent: Record<string, string> = {
    info: t("step_info"),
    progress: t("progress"),
    completed: t("step_completed"),
    failed: t("step_failed"),
    cancelled: t("step_cancelled"),
  }

  const resolveTitle = (step: RunEventItem): string => {
    const mapped = titleByEvent[step.eventName]
    if (mapped) return mapped
    if (step.eventName === "status") return statusWords[step.title] ?? step.title
    return step.title
  }

  const resolveDetail = (step: RunEventItem): string => {
    switch (step.eventName) {
      case "progress":
        return step.totalRows != null
          ? t("rows_detail", { count: formatCount(step.totalRows) })
          : step.detail
      case "completed":
        return step.totalRows != null
          ? t("rows_ready_detail", { count: formatCount(step.totalRows) })
          : step.detail
      case "cancelled":
        if (step.totalRows != null && step.totalRows > 0) {
          return t("rows_stopped_detail", { count: formatCount(step.totalRows) })
        }
        return t("report_stopped_detail")
      case "failed":
        return step.detail === "job failed" ? t("job_failed_detail") : step.detail
      default:
        return step.detail
    }
  }

  return (
    <div className={cn("space-y-3", !runningOnly && "mt-3", className)}>
      {!runningOnly ? (
        <Marker variant="separator">
          <MarkerContent className="text-[11px] text-muted-foreground">
            {t("progress")}
          </MarkerContent>
        </Marker>
      ) : null}
      {loading && events.length === 0 ? (
        <Marker role="status">
          <MarkerIcon>
            <Spinner className="size-3.5" />
          </MarkerIcon>
          <MarkerContent>{t("loading_progress")}</MarkerContent>
        </Marker>
      ) : events.length === 0 ? (
        running ? null : (
          <Marker>
            <MarkerContent>{t("no_progress_log")}</MarkerContent>
          </Marker>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((step, index) => {
            const isCurrent = index === events.length - 1
            const isComplete =
              phase === "done" ||
              (running && !isCurrent) ||
              (phase === "cancelled" && !isCurrent)
            const isCancelledHere = phase === "cancelled" && isCurrent
            const isFailedHere = step.tone === "danger" && isCurrent
            const isLiveCurrent = (running || runningOnly) && isCurrent

            const contentClass = cn(
              isCancelledHere || isFailedHere
                ? "text-amber-500"
                : isComplete ||
                    (isCurrent && step.tone === "success")
                  ? "text-emerald-600"
                  : isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground/70",
              isLiveCurrent && "animate-pulse"
            )

            const iconClass = cn(
              isCancelledHere || isFailedHere
                ? "text-amber-500"
                : isComplete ||
                    (isCurrent && step.tone === "success")
                  ? "text-emerald-600"
                  : "text-muted-foreground"
            )

            const title = resolveTitle(step)
            const detail = resolveDetail(step)
            // fallback artifact: "Running — status" gibi boş mesajlı status adımlarında
            // detail = eventName düşer; bu hali görünmez kıl
            const hideDetail = step.eventName === "status" && step.detail === "status"
            const label =
              step.eventName === "progress"
                ? `${title} · ${detail}`
                : detail && !hideDetail
                  ? `${title} — ${detail}`
                  : title
            const elapsed = elapsedSinceStart(events, step)

            return (
              <Marker
                key={step.id}
                role={isLiveCurrent ? "status" : undefined}
                className="items-start"
              >
                <MarkerIcon className={cn("mt-0.5", iconClass)}>
                  {isLiveCurrent ? (
                    <Spinner className="size-3.5" />
                  ) : isComplete &&
                    !isCancelledHere &&
                    !isFailedHere ? (
                    <Check className="size-3.5" />
                  ) : isCancelledHere || isFailedHere ? (
                    <X className="size-3.5" />
                  ) : (
                    <span className="mx-auto mt-1 size-1.5 rounded-full bg-muted-foreground/35" />
                  )}
                </MarkerIcon>
                <MarkerContent
                  className={cn(
                    "flex min-w-0 flex-1 items-baseline justify-between gap-3",
                    contentClass
                  )}
                >
                  <span className="min-w-0">{label}</span>
                  {elapsed ? (
                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                      {elapsed}
                    </span>
                  ) : null}
                </MarkerContent>
              </Marker>
            )
          })}
        </div>
      )}
    </div>
  )
}
