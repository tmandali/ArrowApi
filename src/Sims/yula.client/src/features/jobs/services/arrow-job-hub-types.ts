import type { ArrowJobEvent } from "../types"
import type { RunEventItem } from "../run-events"

export type JobPhase = "idle" | "running" | "done" | "cancelled"

export type JobHubSnapshot = {
  jobId: string
  status: string
  phase: JobPhase
  events: RunEventItem[]
  requestJson?: string
  totalRows?: number | null
  batchCount?: number | null
  error?: string | null
  isStreaming: boolean
  eventsUrl?: string
  jobUrl?: string
  name?: string
  createdAt?: string
  completedAt?: string
}

export type JobHubEventDetail = {
  jobId: string
  eventName: string
  payload: ArrowJobEvent
  snapshot: JobHubSnapshot
}

export type JobHubSession = {
  snapshot: JobHubSnapshot
  abortController: AbortController
  subscribersCount: number
  cleanupTimer?: ReturnType<typeof setTimeout> | null
  lastProgressEmitMs?: number
  pendingProgressTimer?: ReturnType<typeof setTimeout> | null
  lastProgressPayload?: ArrowJobEvent | null
}

export function normId(id: string | null | undefined): string {
  return id ? id.trim().toLowerCase() : ""
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return "{\n  \n}"
  }
}
