import * as React from "react"
import { useWorkspaceNotifications } from "@/context/workspace-notifications"
import type { ArrowJobEvent } from "@/features/stock/item/types/stock-analytics"
import {
  cancelArrowJob,
  fetchJobStatus,
  readJobSseEvents,
  sleep,
} from "@/features/jobs/arrow-job-client"
import {
  isTerminalJobStatus,
  selectPendingJobs,
  useActiveJobsStore,
  type TrackedJob,
} from "@/store/slices/active-jobs-store"

export type JobSyncListener = {
  onEvent?: (eventName: string, payload: ArrowJobEvent) => void
  onTerminal?: (payload: ArrowJobEvent) => void
}

type JobSyncContextValue = {
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

const JobSyncContext = React.createContext<JobSyncContextValue | null>(null)

const MAX_BACKOFF_MS = 8_000

function notificationIdForJob(jobId: string) {
  return `job-${jobId}`
}

export function JobSyncProvider({ children }: { children: React.ReactNode }) {
  const { pushNotification } = useWorkspaceNotifications()
  const jobs = useActiveJobsStore((s) => s.jobs)
  const addJob = useActiveJobsStore((s) => s.addJob)
  const updateJob = useActiveJobsStore((s) => s.updateJob)
  const removeJob = useActiveJobsStore((s) => s.removeJob)
  const clear = useActiveJobsStore((s) => s.clear)

  const listenersRef = React.useRef(new Map<string, Set<JobSyncListener>>())
  const controllersRef = React.useRef(new Map<string, AbortController>())
  const trackingRef = React.useRef(new Set<string>())
  const notifiedRef = React.useRef(new Set<string>())
  const generationRef = React.useRef(0)

  const emitEvent = React.useCallback(
    (jobId: string, eventName: string, payload: ArrowJobEvent) => {
      const set = listenersRef.current.get(jobId)
      if (!set) return
      for (const listener of set) {
        listener.onEvent?.(eventName, payload)
      }
    },
    []
  )

  const emitTerminal = React.useCallback(
    (jobId: string, payload: ArrowJobEvent) => {
      const set = listenersRef.current.get(jobId)
      if (!set) return
      for (const listener of set) {
        listener.onTerminal?.(payload)
      }
    },
    []
  )

  const pushTerminalNotification = React.useCallback(
    (job: TrackedJob, payload: ArrowJobEvent) => {
      if (notifiedRef.current.has(job.id)) return
      notifiedRef.current.add(job.id)

      if (payload.status === "Completed") {
        pushNotification({
          id: notificationIdForJob(job.id),
          title: job.successTitle ?? `${job.title} Ready`,
          description:
            job.successDescription ??
            `${job.title} tamamlandı. Açmak için bildirime tıklayın.`,
          type: job.notificationType,
          href: job.href,
          workspace: job.workspace,
        })
        return
      }

      if (payload.status === "Failed") {
        pushNotification({
          id: notificationIdForJob(job.id),
          title: job.failureTitle ?? `${job.title} Failed`,
          description: payload.error || "İşlem başarısız oldu.",
          type: job.notificationType,
          href: job.href,
          workspace: job.workspace,
        })
        return
      }

      // Cancelled: UI zaten local state ile bilgilendirilir; inbox gürültüsü yok.
    },
    [pushNotification]
  )

  const finishJob = React.useCallback(
    (job: TrackedJob, payload: ArrowJobEvent) => {
      updateJob(job.id, { status: payload.status })
      pushTerminalNotification(job, payload)
      emitTerminal(job.id, payload)
      removeJob(job.id)
      trackingRef.current.delete(job.id)
      controllersRef.current.delete(job.id)
      listenersRef.current.delete(job.id)
    },
    [updateJob, pushTerminalNotification, emitTerminal, removeJob]
  )

  const abortTracking = React.useCallback((jobId: string) => {
    const controller = controllersRef.current.get(jobId)
    if (controller) {
      controller.abort()
      controllersRef.current.delete(jobId)
    }
    trackingRef.current.delete(jobId)
  }, [])

  const startTracking = React.useCallback(
    async (job: TrackedJob, generation: number) => {
      if (trackingRef.current.has(job.id)) return
      trackingRef.current.add(job.id)

      const controller = new AbortController()
      controllersRef.current.set(job.id, controller)

      let backoffMs = 500

      try {
        while (!controller.signal.aborted && generationRef.current === generation) {
          const latest =
            useActiveJobsStore.getState().jobs[job.id] ?? job

          try {
            const status = await fetchJobStatus(job.id, controller.signal)
            if (generationRef.current !== generation) return

            if (status == null) {
              removeJob(job.id)
              trackingRef.current.delete(job.id)
              controllersRef.current.delete(job.id)
              return
            }

            updateJob(job.id, {
              status: status.status,
              jobUrl: status.jobUrl || latest.jobUrl,
              eventsUrl: status.eventsUrl || latest.eventsUrl,
            })

            if (isTerminalJobStatus(status.status)) {
              finishJob(
                { ...latest, status: status.status },
                {
                  id: status.id,
                  status: status.status,
                  error: status.error,
                  totalRows: status.totalRows,
                  batchCount: status.batchCount,
                  jobUrl: status.jobUrl,
                  eventsUrl: status.eventsUrl,
                  completedAt: status.completedAt,
                  name: status.name,
                }
              )
              return
            }

            const eventsUrl = status.eventsUrl || latest.eventsUrl
            const terminal = await readJobSseEvents(
              eventsUrl,
              controller.signal,
              (eventName, payload) => {
                if (payload.status) {
                  updateJob(job.id, { status: payload.status })
                }
                emitEvent(job.id, eventName, payload)
              }
            )

            if (generationRef.current !== generation) return
            const current =
              useActiveJobsStore.getState().jobs[job.id] ?? latest
            finishJob(current, terminal)
            return
          } catch (error) {
            if (controller.signal.aborted || generationRef.current !== generation) {
              return
            }
            if (error instanceof DOMException && error.name === "AbortError") {
              return
            }

            await sleep(backoffMs, controller.signal)
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
          }
        }
      } finally {
        trackingRef.current.delete(job.id)
        if (controllersRef.current.get(job.id) === controller) {
          controllersRef.current.delete(job.id)
        }
      }
    },
    [removeJob, updateJob, finishJob, emitEvent]
  )

  const ensureTracking = React.useCallback(() => {
    const generation = generationRef.current
    const pending = selectPendingJobs(useActiveJobsStore.getState().jobs)
    for (const job of pending) {
      if (!trackingRef.current.has(job.id)) {
        void startTracking(job, generation)
      }
    }
  }, [startTracking])

  React.useEffect(() => {
    ensureTracking()
  }, [jobs, ensureTracking])

  React.useEffect(() => {
    const onOnline = () => ensureTracking()
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [ensureTracking])

  React.useEffect(() => {
    return () => {
      generationRef.current += 1
      for (const controller of controllersRef.current.values()) {
        controller.abort()
      }
      controllersRef.current.clear()
      trackingRef.current.clear()
    }
  }, [])

  const trackJob = React.useCallback(
    (job: TrackedJob) => {
      addJob(job)
    },
    [addJob]
  )

  const subscribe = React.useCallback(
    (jobId: string, listener: JobSyncListener) => {
      let set = listenersRef.current.get(jobId)
      if (!set) {
        set = new Set()
        listenersRef.current.set(jobId, set)
      }
      set.add(listener)
      return () => {
        set?.delete(listener)
        if (set && set.size === 0) {
          listenersRef.current.delete(jobId)
        }
      }
    },
    []
  )

  const waitUntilTerminal = React.useCallback(
    (
      jobId: string,
      options?: {
        signal?: AbortSignal
        onEvent?: (eventName: string, payload: ArrowJobEvent) => void
      }
    ) => {
      return new Promise<ArrowJobEvent>((resolve, reject) => {
        if (options?.signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"))
          return
        }

        let settled = false
        let unsubscribe = () => {}

        const cleanup = () => {
          unsubscribe()
          options?.signal?.removeEventListener("abort", onAbort)
        }

        const onAbort = () => {
          if (settled) return
          settled = true
          cleanup()
          reject(new DOMException("Aborted", "AbortError"))
        }

        unsubscribe = subscribe(jobId, {
          onEvent: options?.onEvent,
          onTerminal: (payload) => {
            if (settled) return
            settled = true
            cleanup()
            resolve(payload)
          },
        })

        options?.signal?.addEventListener("abort", onAbort, { once: true })

        const existing = useActiveJobsStore.getState().jobs[jobId]
        if (!existing) {
          void fetchJobStatus(jobId, options?.signal)
            .then((status) => {
              if (settled) return
              if (status && isTerminalJobStatus(status.status)) {
                settled = true
                cleanup()
                resolve({
                  id: status.id,
                  status: status.status,
                  error: status.error,
                  totalRows: status.totalRows,
                  batchCount: status.batchCount,
                  jobUrl: status.jobUrl,
                  eventsUrl: status.eventsUrl,
                  completedAt: status.completedAt,
                  name: status.name,
                })
                return
              }
              ensureTracking()
            })
            .catch((error) => {
              if (settled) return
              if (error instanceof DOMException && error.name === "AbortError") {
                return
              }
              settled = true
              cleanup()
              reject(error)
            })
          return
        }

        ensureTracking()
      })
    },
    [subscribe, ensureTracking]
  )

  const cancelTrackedJob = React.useCallback(
    async (jobId: string) => {
      try {
        await cancelArrowJob(jobId)
      } catch {
        // cancel best-effort; local abort still stops SSE
      }
      const cancelled: ArrowJobEvent = {
        id: jobId,
        status: "Cancelled",
      }
      emitTerminal(jobId, cancelled)
      abortTracking(jobId)
      removeJob(jobId)
      listenersRef.current.delete(jobId)
    },
    [abortTracking, emitTerminal, removeJob]
  )

  const resync = React.useCallback(() => {
    generationRef.current += 1
    for (const controller of controllersRef.current.values()) {
      controller.abort()
    }
    controllersRef.current.clear()
    trackingRef.current.clear()
    ensureTracking()
  }, [ensureTracking])

  const clearSession = React.useCallback(() => {
    generationRef.current += 1
    for (const controller of controllersRef.current.values()) {
      controller.abort()
    }
    controllersRef.current.clear()
    trackingRef.current.clear()
    listenersRef.current.clear()
    notifiedRef.current.clear()
    clear()
  }, [clear])

  const value = React.useMemo(
    () => ({
      trackJob,
      subscribe,
      waitUntilTerminal,
      cancelTrackedJob,
      resync,
      clearSession,
    }),
    [
      trackJob,
      subscribe,
      waitUntilTerminal,
      cancelTrackedJob,
      resync,
      clearSession,
    ]
  )

  return (
    <JobSyncContext.Provider value={value}>{children}</JobSyncContext.Provider>
  )
}

export function useJobSync() {
  const context = React.useContext(JobSyncContext)
  if (!context) {
    throw new Error("useJobSync must be used within JobSyncProvider")
  }
  return context
}
