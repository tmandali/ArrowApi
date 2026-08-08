import type { ArrowJobEvent } from "@/features/stock/item/types/stock-analytics"

export type RunEventItem = {
  id: string
  eventName: string
  title: string
  detail: string
  tone: "muted" | "success" | "danger"
  /** ISO timestamp when the step occurred (server or client receive time). */
  at?: string
}

function resolveOccurredAt(payload: ArrowJobEvent): string {
  if (typeof payload.occurredAt === "string" && payload.occurredAt.trim()) {
    return payload.occurredAt
  }
  return new Date().toISOString()
}

export function mapSseToRunEvent(
  eventName: string,
  payload: ArrowJobEvent,
  index: number
): RunEventItem {
  const at = resolveOccurredAt(payload)
  if (eventName === "info") {
    return {
      id: `info-${index}`,
      eventName,
      title: "Info",
      detail: payload.message || "…",
      tone: "success",
      at,
    }
  }
  if (eventName === "progress") {
    return {
      id: "progress",
      eventName,
      title: "Progress",
      detail: `${payload.totalRows ?? 0} rows`,
      tone: "success",
      at,
    }
  }
  if (eventName === "completed") {
    return {
      id: "completed",
      eventName,
      title: "Completed",
      detail: `${payload.totalRows ?? 0} rows ready`,
      tone: "success",
      at,
    }
  }
  if (eventName === "failed") {
    return {
      id: "failed",
      eventName,
      title: "Failed",
      detail: payload.error || "job failed",
      tone: "danger",
      at,
    }
  }
  if (eventName === "cancelled") {
    return {
      id: "cancelled",
      eventName,
      title: "Cancelled",
      detail: "report stopped",
      tone: "danger",
      at,
    }
  }
  return {
    id: `status-${index}`,
    eventName,
    title: payload.status || eventName,
    detail: payload.message || eventName,
    tone: "muted",
    at,
  }
}

function sameStep(a: RunEventItem, b: RunEventItem): boolean {
  return (
    a.eventName === b.eventName &&
    a.title === b.title &&
    a.detail === b.detail
  )
}

/**
 * Family key for percentage tick infos that should share one UI row
 * (e.g. "Processing stock balance… 20%" / "… 40%").
 */
function infoPercentFamily(message: string): string | null {
  const trimmed = message.trim()
  const match = trimmed.match(/^(.*?)\s*\d+\s*%\s*$/)
  if (!match?.[1]?.trim()) return null
  return `info-pct:${match[1].trim()}`
}

/**
 * Append SSE step; progress/terminal events upsert; identical consecutive steps are ignored.
 * Percentage info ticks (… 20%, … 40%) update the same row instead of stacking.
 */
export function appendOrUpdateRunEvent(
  prev: RunEventItem[],
  eventName: string,
  payload: ArrowJobEvent
): RunEventItem[] {
  const item = mapSseToRunEvent(eventName, payload, prev.length)

  if (
    eventName === "progress" ||
    eventName === "completed" ||
    eventName === "failed" ||
    eventName === "cancelled"
  ) {
    const idx = prev.findIndex((e) => e.eventName === eventName)
    if (idx >= 0) {
      const next = [...prev]
      next[idx] = { ...item, id: prev[idx].id }
      return next
    }
    return [...prev, item]
  }

  if (eventName === "info") {
    const family = infoPercentFamily(payload.message || "")
    if (family) {
      const upserted = { ...item, id: family }
      const idx = prev.findIndex((e) => e.id === family)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = upserted
        return next
      }
      return [...prev, upserted]
    }
  }

  const last = prev[prev.length - 1]
  if (last && sameStep(last, item)) return prev

  return [...prev, item]
}

/** Rebuild UI steps from a persisted event-log (or live SSE replay). */
export function buildRunEventsFromLog(
  entries: Array<{ eventName: string; payload: ArrowJobEvent }>
): RunEventItem[] {
  let steps: RunEventItem[] = []
  for (const entry of entries) {
    steps = appendOrUpdateRunEvent(steps, entry.eventName, entry.payload)
  }
  return steps
}

/** Format elapsed duration for progress UI (e.g. `420ms`, `1.2s`, `1m 5s`). */
export function formatElapsedMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rem = Math.round(seconds - minutes * 60)
  return `${minutes}m ${rem}s`
}

function parseTime(value?: string | null): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** Elapsed since the first timed step in the list. */
export function elapsedSinceStart(
  steps: RunEventItem[],
  step: RunEventItem
): string | null {
  const start = steps.find((s) => s.at)?.at
  if (!start || !step.at) return null
  const startMs = parseTime(start)
  const atMs = parseTime(step.at)
  if (startMs == null || atMs == null) return null
  return formatElapsedMs(atMs - startMs)
}

/**
 * Total run duration: prefers job created/completed, else first→last progress stamps.
 */
export function formatTotalDuration(options: {
  createdAt?: string | null
  completedAt?: string | null
  status?: string | null
  steps?: RunEventItem[]
  nowMs?: number
}): string | null {
  const createdMs = parseTime(options.createdAt)
  const completedMs = parseTime(options.completedAt)
  if (createdMs != null && completedMs != null) {
    return formatElapsedMs(completedMs - createdMs)
  }

  const timed = (options.steps ?? []).filter((s) => s.at)
  if (timed.length >= 2) {
    const first = parseTime(timed[0]?.at)
    const last = parseTime(timed[timed.length - 1]?.at)
    if (first != null && last != null) {
      return formatElapsedMs(last - first)
    }
  }

  const status = options.status ?? ""
  const running =
    status === "Running" || status === "Queued" || status === "running"
  if (createdMs != null && running) {
    const now = options.nowMs ?? Date.now()
    return formatElapsedMs(now - createdMs)
  }

  if (createdMs != null && timed.length === 1) {
    const only = parseTime(timed[0]?.at)
    if (only != null) return formatElapsedMs(only - createdMs)
  }

  return null
}
