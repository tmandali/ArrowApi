"use client";

import { useRouter } from "next/navigation";
import * as React from "react"
import { toast } from "sonner"
import { useWorkspaceNotifications } from "@/context/workspace-notifications-context"
import type { ArrowJobEvent } from "@/features/jobs"
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
import {
  JobSyncContext,
  type JobSyncListener,
} from "./job-sync-context"

const MAX_BACKOFF_MS = 8_000

function notificationIdForJob(jobId: string) {
  return `job-${jobId}`
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

function reportSummary(job: TrackedJob, payload: ArrowJobEvent): string {
  const parts: string[] = []
  if (payload.totalRows != null) {
    parts.push(`${payload.totalRows.toLocaleString("tr-TR")} rows`)
  }
  if (payload.batchCount != null) {
    parts.push(`${payload.batchCount} batches`)
  }
  if (job.createdAt && payload.completedAt) {
    const start = Date.parse(job.createdAt)
    const end = Date.parse(payload.completedAt)
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      parts.push(formatElapsed(end - start))
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "Rapor tamamlandı."
}

export function JobSyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const navigate = React.useCallback(
    (
      to: string | number,
      _options?: { replace?: boolean; state?: unknown },
    ) => {
      if (typeof to === "number") {
        if (to < 0) router.back();
        else router.forward();
      } else {
        void router.push(to);
      }
    },
    [router]
  );

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

        if (job.notificationType === "report" && job.href) {
          toast.success(job.title, {
            description: reportSummary(job, payload),
            action: {
              label: "View",
              onClick: () => navigate(job.href!),
            },
          })
        }
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

        if (job.notificationType === "report") {
          toast.error(job.failureTitle ?? `${job.title} Failed`, {
            description: payload.error || "Rapor hazırlanırken bir hata oluştu.",
          })
        }
        return
      }

      // Cancelled: UI zaten local state ile bilgilendirilir; inbox gürültüsü yok.
    },
    [pushNotification, navigate]
  )

  const finishJob = React.useCallback(
    (job: TrackedJob, payload: ArrowJobEvent) => {
      updateJob(job.id, { status: payload.status })
      pushTerminalNotification(job, payload)
      emitTerminal(job.id, payload)
      removeJob(job.id)
      trackingRef.current.delete(job.id)
      controllersRef.current.delete(job.id)
      // Keep listeners until subscribers unsubscribe — wiping here drops late UI handlers.
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
                if (
                  payload.id != null &&
                  String(payload.id).localeCompare(job.id, undefined, {
                    sensitivity: "accent",
                  }) !== 0
                ) {
                  return
                }
                if (payload.status) {
                  updateJob(job.id, { status: payload.status })
                }
                emitEvent(job.id, eventName, payload)
              }
            )

            // Always finish + notify listeners once SSE reaches a terminal
            // event — even if a resync bumped generation mid-stream.
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
    const generationRefValue = generationRef
    const controllersRefValue = controllersRef
    const trackingRefValue = trackingRef
    return () => {
      generationRefValue.current += 1
      for (const controller of controllersRefValue.current.values()) {
        controller.abort()
      }
      controllersRefValue.current.clear()
      trackingRefValue.current.clear()
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
        if (existing && isTerminalJobStatus(existing.status)) {
          settled = true
          cleanup()
          resolve({
            id: existing.id,
            status: existing.status,
            jobUrl: existing.jobUrl,
            eventsUrl: existing.eventsUrl,
            name: existing.name,
          })
          return
        }

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
