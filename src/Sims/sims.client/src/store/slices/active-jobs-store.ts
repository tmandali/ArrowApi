import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { WorkspaceKey } from "@/lib/workspace"
import { resolveNotificationWorkspace } from "@/lib/workspace"
import { useNotificationsStore } from "./notifications-store"

export const TERMINAL_JOB_STATUSES = new Set([
  "Completed",
  "Failed",
  "Cancelled",
])

export function isTerminalJobStatus(status: string | undefined): boolean {
  return status != null && TERMINAL_JOB_STATUSES.has(status)
}

export type TrackedJobNotificationType =
  | "order"
  | "report"
  | "stock"
  | "manufacturing"

export type TrackedJob = {
  id: string
  name: string
  title: string
  href?: string
  status: string
  eventsUrl: string
  jobUrl: string
  createdAt: string
  notificationType: TrackedJobNotificationType
  /** İşlemin başladığı workspace (ör. /stock). */
  workspace: WorkspaceKey
  successTitle?: string
  successDescription?: string
  failureTitle?: string
  /** Job'a özel serializable payload (ör. rapor request parametreleri). */
  payload?: Record<string, unknown>
}

type ActiveJobsState = {
  jobs: Record<string, TrackedJob>
  addJob: (job: TrackedJob) => void
  updateJob: (id: string, patch: Partial<TrackedJob>) => void
  removeJob: (id: string) => void
  clearTerminal: () => void
  clear: () => void
}

export const useActiveJobsStore = create<ActiveJobsState>()(
  persist(
    (set, get) => ({
      jobs: {},
      addJob: (job) => {
        const normalized: TrackedJob = {
          ...job,
          workspace: resolveNotificationWorkspace({
            workspace: job.workspace,
            href: job.href,
            type: job.notificationType,
          }),
        }
        set({ jobs: { ...get().jobs, [normalized.id]: normalized } })
      },
      updateJob: (id, patch) => {
        const existing = get().jobs[id]
        if (!existing) return
        set({ jobs: { ...get().jobs, [id]: { ...existing, ...patch } } })
      },
      removeJob: (id) => {
        const { [id]: _removed, ...rest } = get().jobs
        set({ jobs: rest })
        useNotificationsStore.getState().removeNotificationByJobId(id)
      },
      clearTerminal: () => {
        const next: Record<string, TrackedJob> = {}
        const removedIds: string[] = []
        for (const [id, job] of Object.entries(get().jobs)) {
          if (!isTerminalJobStatus(job.status)) {
            next[id] = job
          } else {
            removedIds.push(id)
          }
        }
        set({ jobs: next })
        for (const id of removedIds) {
          useNotificationsStore.getState().removeNotificationByJobId(id)
        }
      },
      clear: () => {
        const allIds = Object.keys(get().jobs)
        set({ jobs: {} })
        for (const id of allIds) {
          useNotificationsStore.getState().removeNotificationByJobId(id)
        }
      },
    }),
    {
      name: "sims:active-jobs",
      partialize: (state) => ({ jobs: state.jobs }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<ActiveJobsState>
        const jobs: Record<string, TrackedJob> = {}
        for (const [id, job] of Object.entries(raw.jobs ?? {})) {
          jobs[id] = {
            ...job,
            workspace: resolveNotificationWorkspace({
              workspace: job.workspace,
              href: job.href,
              type: job.notificationType,
            }),
          }
        }
        return {
          ...current,
          ...raw,
          jobs,
        }
      },
    }
  )
)

export function selectPendingJobs(
  jobs: Record<string, TrackedJob>,
  workspace?: WorkspaceKey
): TrackedJob[] {
  return Object.values(jobs).filter((job) => {
    if (isTerminalJobStatus(job.status)) return false
    if (!workspace) return true
    return (
      resolveNotificationWorkspace({
        workspace: job.workspace,
        href: job.href,
        type: job.notificationType,
      }) === workspace
    )
  })
}

/** En son başlatılan pending Stock Analytics job (href / name ile). */
export function selectPendingStockAnalyticsJob(
  jobs: Record<string, TrackedJob>
): TrackedJob | null {
  const pending = selectPendingJobs(jobs, "/stock").filter(
    (job) =>
      job.href?.startsWith("/stock/stock-analytics") ||
      job.name === "stock-analytics" ||
      job.name.startsWith("stock-analytics")
  )
  if (pending.length === 0) return null
  return pending.reduce((latest, job) =>
    createdAtMs(job.createdAt) > createdAtMs(latest.createdAt) ? job : latest
  )
}

/** En son başlatılan pending Stock Balance job (href / name ile). */
export function selectPendingStockBalanceJob(
  jobs: Record<string, TrackedJob>
): TrackedJob | null {
  return selectPendingJobByName(jobs, "stock-balance", "/stock")
}

/** En son başlatılan pending job — name veya href prefix ile. */
export function selectPendingJobByName(
  jobs: Record<string, TrackedJob>,
  jobName: string,
  workspace: WorkspaceKey = "/stock"
): TrackedJob | null {
  const hrefPrefix = `${workspace}/${jobName}`
  const pending = selectPendingJobs(jobs, workspace).filter(
    (job) =>
      job.href?.startsWith(hrefPrefix) ||
      job.name === jobName ||
      job.name.startsWith(`${jobName}-`) ||
      job.name.startsWith(`${jobName}/`)
  )
  if (pending.length === 0) return null
  return pending.reduce((latest, job) =>
    createdAtMs(job.createdAt) > createdAtMs(latest.createdAt) ? job : latest
  )
}

function createdAtMs(createdAt: string): number {
  const parsed = Date.parse(createdAt)
  return Number.isFinite(parsed) ? parsed : 0
}
