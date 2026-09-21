import * as React from "react"
import { fetchJobRequest, fetchJobStatus } from "@/features/jobs/arrow-job-client"
import {
  isTerminalJobStatus,
  useActiveJobsStore,
  type TrackedJob,
} from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs/types"
import { isInFlightStatus, normId } from "./arrow-job-runner-types"

export type UseEntryJobResumeOptions = {
  selectPendingJob?: (jobs: Record<string, TrackedJob>) => TrackedJob | null
  allowEntryResumeRef: React.RefObject<boolean>
  controllersRef: React.RefObject<Map<string, AbortController>>
  followJob: (job: ArrowJobStatus, request: Record<string, unknown>) => Promise<void>
  setComposing: (composing: boolean) => void
}

export function useEntryJobResume({
  selectPendingJob,
  allowEntryResumeRef,
  controllersRef,
  followJob,
  setComposing,
}: UseEntryJobResumeOptions) {
  const entryResumeGenRef = React.useRef(0)

  // Sayfaya ilk girişte varsa in-flight job'ı otomatik bağla
  const pendingTrackedJob = useActiveJobsStore((s) =>
    selectPendingJob ? selectPendingJob(s.jobs) : null
  )
  const trackedId = pendingTrackedJob?.id

  React.useEffect(() => {
    if (!trackedId) return
    if (!allowEntryResumeRef.current) return
    if (controllersRef.current.has(normId(trackedId))) return

    const abort = new AbortController()
    const gen = ++entryResumeGenRef.current

    const resumeEntryInFlight = async () => {
      try {
        const status = await fetchJobStatus(trackedId, abort.signal)
        if (abort.signal.aborted || gen !== entryResumeGenRef.current) return

        if (!status || isTerminalJobStatus(status.status)) {
          // Sunucuda job zaten tamamlanmış, başarısız veya silinmiş.
          // Store'u güncelle/temizle ve kriter formunda kal (canlı ilerleme ekranına geçme).
          if (status?.status) {
            useActiveJobsStore.getState().updateJob(trackedId, { status: status.status })
          } else {
            useActiveJobsStore.getState().removeJob(trackedId)
          }
          return
        }

        if (!isInFlightStatus(status.status)) return

        setComposing(false)

        const req = (await fetchJobRequest(status.id, abort.signal)) ?? {}
        if (abort.signal.aborted || gen !== entryResumeGenRef.current) return

        void followJob(status, req)
      } catch {
        // yoksay
      }
    }

    void resumeEntryInFlight()

    return () => {
      abort.abort()
    }
  }, [trackedId, followJob, setComposing, allowEntryResumeRef, controllersRef])
}
