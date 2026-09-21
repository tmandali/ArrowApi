import { ApiError } from "@/services"
import type { TrackedJob } from "@/store/slices/active-jobs-store"
import type { RunEventItem } from "@/features/jobs/run-events"
import type { WorkspaceKey } from "@/lib/workspace"

export type ArrowJobRunnerOptions = {
  jobName: string
  title: string
  basePath: string
  jobsEndpoint: string
  workspace?: WorkspaceKey
  selectPendingJob?: (jobs: Record<string, TrackedJob>) => TrackedJob | null
}

export type PendingJobItem = {
  id: string
  status: string
  createdAt: string
  name?: string
  totalRows?: number | null
  batchCount?: number | null
}

export type JobLiveSnapshot = {
  status?: string
  requestJson?: string
  events: RunEventItem[]
  phase: "idle" | "running" | "done" | "cancelled"
}

export function isInFlightStatus(status: string | undefined): boolean {
  if (!status) return false
  const s = status.trim().toLowerCase()
  return s === "running" || s === "queued"
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return "{\n  \n}"
  }
}

export function formatErrorMessage(error: unknown, fallback: string): string {
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

export function sameJobId(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0
}

export function normId(id: string | null | undefined): string {
  return id ? id.trim().toLowerCase() : ""
}
