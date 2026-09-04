import * as React from "react"
import type { ArrowJobEvent } from "@/features/jobs"
import type { TrackedJob } from "@/store/slices/active-jobs-store"

export type JobSyncListener = {
  onEvent?: (eventName: string, payload: ArrowJobEvent) => void
  onTerminal?: (payload: ArrowJobEvent) => void
}

export type JobSyncContextValue = {
  trackJob: (job: TrackedJob) => void
  subscribe: (jobId: string, listener: JobSyncListener) => () => void
  waitUntilTerminal: (
    jobId: string,
    options?: {
      signal?: AbortSignal
      onEvent?: (eventName: string, payload: ArrowJobEvent) => void
    }
  ) => Promise<ArrowJobEvent>
  cancelTrackedJob: (jobId: string) => Promise<void>
  resync: () => void
  clearSession: () => void
}

export const JobSyncContext = React.createContext<JobSyncContextValue | null>(
  null
)

export function useJobSync() {
  const context = React.useContext(JobSyncContext)
  if (!context) {
    throw new Error("useJobSync must be used within JobSyncProvider")
  }
  return context
}
