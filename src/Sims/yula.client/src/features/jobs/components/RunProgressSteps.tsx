import { Check, X } from "lucide-react"
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
  return (
    <div className={cn("space-y-3", !runningOnly && "mt-3", className)}>
      {!runningOnly ? (
        <Marker variant="separator">
          <MarkerContent className="text-[11px] text-muted-foreground">
            Progress
          </MarkerContent>
        </Marker>
      ) : null}
      {loading && events.length === 0 ? (
        <Marker role="status">
          <MarkerIcon>
            <Spinner className="size-3.5" />
          </MarkerIcon>
          <MarkerContent>Loading progress…</MarkerContent>
        </Marker>
      ) : events.length === 0 ? (
        <Marker>
          <MarkerContent>
            {runningOnly
              ? "Waiting for SSE events…"
              : "No progress log for this run."}
          </MarkerContent>
        </Marker>
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

            const label =
              step.eventName === "progress"
                ? `${step.title} · ${step.detail}`
                : step.detail
                  ? `${step.title} — ${step.detail}`
                  : step.title
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
