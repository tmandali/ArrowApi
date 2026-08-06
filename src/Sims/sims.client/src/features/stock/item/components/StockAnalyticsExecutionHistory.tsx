import * as React from "react"
import { Check, History, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useStockAnalyticsReport } from "@/context/stock-analytics-report"
import { stockAnalyticsService } from "../services/stock-analytics-service"
import type { ArrowJobStatus } from "../types/stock-analytics"
import { cn } from "@/utils"

function formatWhen(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date)
}

function statusTone(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Completed":
      return "default"
    case "Failed":
    case "Cancelled":
      return "destructive"
    case "Running":
    case "Queued":
      return "secondary"
    default:
      return "outline"
  }
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function sameJobId(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0
}

export function StockAnalyticsExecutionHistory() {
  const { activeJobId, selectExecution } = useStockAnalyticsReport()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<ArrowJobStatus[]>([])
  const [total, setTotal] = React.useState(0)
  const selectedItemRef = React.useRef<HTMLButtonElement | null>(null)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const page = await stockAnalyticsService.listJobs({
        take: 40,
        signal,
      })
      setItems(page.items ?? [])
      setTotal(page.total ?? 0)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : "Liste alınamadı")
      setItems([])
      setTotal(0)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    void load(abort.signal)
    return () => abort.abort()
  }, [open, load])

  React.useEffect(() => {
    if (!open || loading || !activeJobId) return
    selectedItemRef.current?.scrollIntoView({ block: "nearest" })
  }, [open, loading, activeJobId, items])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 px-2.5"
          title="Execution history"
          aria-label="Execution history"
        >
          <History className="size-3.5" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <p className="text-sm font-medium">Execution history</p>
            <p className="text-xs text-muted-foreground">
              {total > 0 ? `${total} run${total === 1 ? "" : "s"}` : "Past Arrow jobs"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>

        <ScrollArea className="h-72">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="px-3 py-8 text-center text-sm text-destructive">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No executions yet. Run Execute to create one.
            </div>
          ) : (
            <ul className="divide-y p-1">
              {items.map((job) => {
                const selected = sameJobId(activeJobId, job.id)
                const disabled =
                  job.status === "Failed" || job.status === "Cancelled"
                return (
                  <li key={job.id}>
                    <button
                      ref={selected ? selectedItemRef : undefined}
                      type="button"
                      disabled={disabled}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => {
                        selectExecution(job.id)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors",
                        disabled
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-muted/80",
                        selected &&
                          "bg-primary/10 ring-1 ring-inset ring-primary/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
                          {selected ? (
                            <Check
                              className="size-3.5 shrink-0 text-primary"
                              aria-hidden
                            />
                          ) : null}
                          <span className="truncate">{shortId(job.id)}…</span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {selected ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-primary/40 px-1.5 text-[10px] text-primary"
                            >
                              Open
                            </Badge>
                          ) : null}
                          <Badge
                            variant={statusTone(job.status)}
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {job.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{formatWhen(job.createdAt)}</span>
                        <span>
                          {job.totalRows != null
                            ? `${job.totalRows} rows`
                            : "—"}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
