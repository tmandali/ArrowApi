import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation";import { useJobSync } from "@/context/job-sync-context"
import {
  fetchJobRequest,
  fetchJobStatus,
} from "@/features/jobs/arrow-job-client"
import { arrowJobEventHub } from "@/features/jobs/services/arrow-job-event-hub"
import type { RunEventItem } from "@/features/jobs/run-events"
import { ApiError } from "@/services"
import {
  isTerminalJobStatus,
  useActiveJobsStore,
  type TrackedJob,
} from "@/store/slices/active-jobs-store"
import type {
  ArrowJobStatus,
} from "@/features/jobs/types"
import type { WorkspaceKey } from "@/lib/workspace"
import {
  subscribeExecutionFocus,
  takePendingExecutionFocus,
} from "@/lib/report-run-bus"

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

function isInFlightStatus(status: string | undefined): boolean {
  if (!status) return false
  const s = status.trim().toLowerCase()
  return s === "running" || s === "queued"
}

function prettyJson(value: unknown): string {
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

function normId(id: string | null | undefined): string {
  return id ? id.trim().toLowerCase() : ""
}

export function useArrowJobRunner(options: ArrowJobRunnerOptions) {
  const {
    jobName,
    title,
    basePath,
    jobsEndpoint: _jobsEndpoint,
    workspace = "/stock",
    selectPendingJob,
  } = options

  const router = useRouter();
  const searchParams = useSearchParams()
  // Reaktif query: aynı sayfada router.push ile ?jobId= değişirse remount
  // olmadan focus güncellenir (önceki davranış yalnız mount'ta okurdu).
  const queryJobIdParam = searchParams.get("jobId") || searchParams.get("job")
  const navigate = React.useCallback(
    (to: string | number) => {
      if (typeof to === "number") router.back();
      else void router.push(to);
    },
    [router]
  );
  const location = { pathname: typeof window !== "undefined" ? window.location.pathname : "/", state: null as unknown }
  const { trackJob } = useJobSync()

  const locationState = location.state as {
    focusJobId?: string
    composing?: boolean
  } | null

  const [composing, setComposing] = React.useState(
    locationState?.composing ?? true
  )
  const [activeJobId, setActiveJobId] = React.useState<string | null>(
    locationState?.focusJobId ?? null
  )
  const [activeLiveStatus, setActiveLiveStatus] = React.useState<string | undefined>()
  const [activeRequestJson, setActiveRequestJson] = React.useState<string | undefined>()
  const [activeRunEvents, setActiveRunEvents] = React.useState<RunEventItem[]>([])
  const [activeRunPhase, setActiveRunPhase] = React.useState<
    "idle" | "running" | "done" | "cancelled"
  >("idle")
  const [pendingJobs, setPendingJobs] = React.useState<PendingJobItem[]>([])
  const [listRefreshToken, setListRefreshToken] = React.useState(0)

  const focusJobIdRef = React.useRef<string | null>(null)
  const controllersRef = React.useRef(new Map<string, AbortController>())
  const entryResumeGenRef = React.useRef(0)
  const allowEntryResumeRef = React.useRef(true)

  const jobHref = React.useCallback(
    (jobId: string) => `${basePath}?jobId=${encodeURIComponent(jobId)}`,
    [basePath]
  )

  const syncUrlWithJob = React.useCallback((jobId: string | null) => {
    if (typeof window === "undefined") return
    try {
      const url = new URL(window.location.href)
      if (jobId) {
        url.searchParams.set("jobId", jobId)
        url.searchParams.delete("job")
      } else {
        url.searchParams.delete("jobId")
        url.searchParams.delete("job")
      }
      const nextQuery = url.searchParams.toString()
      const nextUrl = nextQuery ? `${url.pathname}?${nextQuery}` : url.pathname
      if (window.location.pathname + window.location.search !== nextUrl) {
        window.history.replaceState(window.history.state, "", nextUrl)
      }
    } catch {
      // noop
    }
  }, [])

  const publishFocused = React.useCallback((jobId: string | null) => {
    focusJobIdRef.current = jobId
    setActiveJobId(jobId)
    syncUrlWithJob(jobId)
    if (!jobId) {
      setActiveLiveStatus(undefined)
      setActiveRequestJson(undefined)
      setActiveRunEvents([])
      setActiveRunPhase("idle")
      return
    }
    const snap = arrowJobEventHub.getSnapshot(normId(jobId))
    if (snap) {
      setActiveLiveStatus(snap.status)
      setActiveRequestJson(snap.requestJson)
      setActiveRunEvents(snap.events)
      setActiveRunPhase(snap.phase)
    } else {
      setActiveLiveStatus(undefined)
      setActiveRequestJson(undefined)
      setActiveRunEvents([])
      setActiveRunPhase("idle")
    }
  }, [syncUrlWithJob])

  // Aktif iş değiştikçe veya hub üzerinden yeni SSE olayları aktıkça state'i otomatik senkronize et.
  // Replay özelliği sayesinde bileşen sonradan mount olsa dahi birikmiş tüm adımları tek hamlede alır.
  React.useEffect(() => {
    if (!activeJobId) return

    const unsub = arrowJobEventHub.subscribe(
      activeJobId,
      (detail) => {
        setActiveLiveStatus(detail.snapshot.status)
        setActiveRunEvents(detail.snapshot.events)
        setActiveRunPhase(detail.snapshot.phase)
        if (detail.snapshot.requestJson) {
          setActiveRequestJson(detail.snapshot.requestJson)
        }
      },
      { replay: true }
    )

    return unsub
  }, [activeJobId])

  const trackRunnerJob = React.useCallback(
    (
      job: {
        id: string
        name?: string
        status?: string
        eventsUrl?: string
        jobUrl?: string
        createdAt?: string
      },
      payload?: Record<string, unknown>
    ) => {
      if (!job.eventsUrl || !job.jobUrl) return
      trackJob({
        id: job.id,
        name: job.name || jobName,
        title,
        href: jobHref(job.id),
        status: job.status || "Queued",
        eventsUrl: job.eventsUrl,
        jobUrl: job.jobUrl,
        createdAt: job.createdAt || new Date().toISOString(),
        notificationType: "report",
        workspace,
        successTitle: `${title} Ready`,
        successDescription: `${title} job tamamlandı. Açmak için bildirime tıklayın.`,
        failureTitle: `${title} Failed`,
        payload,
      })
    },
    [trackJob, jobName, title, jobHref, workspace]
  )

  const followJob = React.useCallback(
    async (job: ArrowJobStatus, request: Record<string, unknown>) => {
      const jobKey = normId(job.id)
      controllersRef.current.get(jobKey)?.abort()
      const abort = new AbortController()
      controllersRef.current.set(jobKey, abort)

      arrowJobEventHub.startStream(job, { request })
      publishFocused(job.id)

      setPendingJobs((prev) => {
        if (prev.some((p) => sameJobId(p.id, job.id))) return prev
        return [
          {
            id: job.id,
            status: job.status || "Queued",
            createdAt: job.createdAt || new Date().toISOString(),
            name: job.name,
          },
          ...prev,
        ]
      })
      setListRefreshToken((n) => n + 1)

      trackRunnerJob(job, request)

      try {
        await arrowJobEventHub.waitUntilTerminal(job.id, {
          signal: abort.signal,
          onEvent: (_eventName, payload) => {
            setPendingJobs((prev) =>
              prev.map((p) => {
                if (!sameJobId(p.id, job.id)) return p
                return {
                  ...p,
                  status: payload.status || p.status,
                  totalRows:
                    typeof payload.totalRows === "number"
                      ? payload.totalRows
                      : p.totalRows,
                  batchCount:
                    typeof payload.batchCount === "number"
                      ? payload.batchCount
                      : p.batchCount,
                }
              })
            )
          },
        })

        setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, job.id)))
        setListRefreshToken((n) => n + 1)
      } catch {
        const snap = arrowJobEventHub.getSnapshot(jobKey)
        if (snap?.phase === "cancelled" || snap?.status === "Cancelled") {
          setActiveLiveStatus("Cancelled")
          setActiveRunPhase("cancelled")
        }
        setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, job.id)))
        setListRefreshToken((n) => n + 1)
      } finally {
        controllersRef.current.delete(jobKey)
      }
    },
    [publishFocused, trackRunnerJob]
  )

  const handleSubmitted = React.useCallback(
    (job: ArrowJobStatus, request: Record<string, unknown>) => {
      allowEntryResumeRef.current = false
      setComposing(false)
      void followJob(job, request)
    },
    [followJob, setComposing]
  )
  const handleSelectJob = React.useCallback(
    (jobOrId: ArrowJobStatus | string | null) => {
      if (!jobOrId) {
        publishFocused(null)
        return
      }

      const jobId = typeof jobOrId === "string" ? jobOrId : jobOrId.id
      let jobStatus = typeof jobOrId === "string" ? undefined : jobOrId.status

      if (!jobStatus) {
        const tracked = useActiveJobsStore.getState().jobs[jobId]
        if (tracked?.status) {
          jobStatus = tracked.status
        }
      }

      publishFocused(jobId)

      const key = normId(jobId)
      const snap = arrowJobEventHub.getSnapshot(key)
      if (snap) {
        return
      }

      if (jobStatus) {
        setActiveLiveStatus(jobStatus)
        const lower = jobStatus.toLowerCase()
        if (lower === "completed") {
          setActiveRunPhase("done")
        } else if (lower === "cancelled" || lower === "canceled") {
          setActiveRunPhase("cancelled")
        } else if (lower === "failed") {
          setActiveRunPhase("idle")
        } else if (isInFlightStatus(jobStatus)) {
          setActiveRunPhase("running")
        }
      }

      void fetchJobRequest(jobId).then((req) => {
        if (!req) return
        setActiveRequestJson(prettyJson(req))
      })

      const targetJob: ArrowJobStatus =
        typeof jobOrId === "string"
          ? { id: jobId, status: jobStatus || "", jobUrl: "", eventsUrl: "" }
          : jobOrId

      if (jobStatus && isInFlightStatus(jobStatus) && !arrowJobEventHub.isStreaming(key)) {
        void fetchJobRequest(jobId).then((req) => {
          void followJob(targetJob, req ?? {})
        })
      }
    },
    [followJob, publishFocused]
  )

  const applyExecutionFocus = React.useCallback(
    (job: ArrowJobStatus, request?: Record<string, unknown>) => {
      if (isInFlightStatus(job.status)) {
        handleSubmitted(job, request ?? {})
        return
      }
      setComposing(false)
      handleSelectJob(job)
    },
    [handleSelectJob, handleSubmitted, setComposing],
  )

  const applyExecutionFocusRef = React.useRef(applyExecutionFocus)
  React.useEffect(() => {
    applyExecutionFocusRef.current = applyExecutionFocus
  })

  const focusJobIdFromQuery = React.useCallback((queryJobId: string) => {
    const tracked = useActiveJobsStore.getState().jobs[queryJobId]
    if (tracked?.status) {
      applyExecutionFocusRef.current(
        {
          id: queryJobId,
          status: tracked.status,
          eventsUrl: tracked.eventsUrl ?? "",
          jobUrl: tracked.jobUrl ?? "",
          createdAt: tracked.createdAt,
          name: tracked.name,
        },
        tracked.payload,
      )
    } else {
      // Sayfa ilk defa URL query param ile açıldığında işin durumu henüz bilinmiyor.
      // "Completed" varsaymak yerine önce boş geçilir; fetchJobStatus ile gerçek durum öğrenilir.
      applyExecutionFocusRef.current({
        id: queryJobId,
        status: "",
        jobUrl: "",
        eventsUrl: "",
      })
      void fetchJobStatus(queryJobId).then((st) => {
        if (st) {
          applyExecutionFocusRef.current({
            id: queryJobId,
            status: st.status,
            jobUrl: st.jobUrl,
            eventsUrl: st.eventsUrl,
            createdAt: st.createdAt,
            name: st.name,
            totalRows: st.totalRows ?? undefined,
            batchCount: st.batchCount ?? undefined,
          })
        }
      })
    }
  }, [])

  React.useEffect(() => {
    const pending = takePendingExecutionFocus(jobName)
    if (pending) {
      applyExecutionFocusRef.current(pending.job, pending.request)
    } else if (queryJobIdParam) {
      // Aynı job zaten odaktaysa tekrar dokunma (gereksiz fetch/odak sıfırlama yok).
      if (!sameJobId(focusJobIdRef.current, queryJobIdParam)) {
        focusJobIdFromQuery(queryJobIdParam)
      }
    }
    return subscribeExecutionFocus(jobName, (focus) => {
      applyExecutionFocusRef.current(focus.job, focus.request)
    })
  }, [jobName, queryJobIdParam, focusJobIdFromQuery])

  const handleJobCancelled = React.useCallback(
    (jobId: string) => {
      const key = normId(jobId)
      controllersRef.current.get(key)?.abort()
      controllersRef.current.delete(key)
      arrowJobEventHub.cancelJob(jobId)
      setActiveLiveStatus("Cancelled")
      setActiveRunPhase("cancelled")
      setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, jobId)))
      setListRefreshToken((n) => n + 1)
    },
    []
  )

  const handleJobDeleted = React.useCallback(
    (jobId: string) => {
      const key = normId(jobId)
      controllersRef.current.get(key)?.abort()
      controllersRef.current.delete(key)
      arrowJobEventHub.removeJob(jobId)
      setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, jobId)))
      setListRefreshToken((n) => n + 1)
      if (sameJobId(focusJobIdRef.current, jobId)) {
        publishFocused(null)
        setComposing(true)
      }
    },
    [publishFocused, setComposing]
  )

  const handleNavigateToJob = React.useCallback(
    (jobId: string) => {
      navigate(jobHref(jobId))
    },
    [navigate, jobHref]
  )

  // Sayfaya focus-state ile gelinirse in-flight job'ı bağla. Gövdeye bir
  // düz fonksiyon (connectFocus) sarmalanır; tetiklenmesi dış state'tir.
  React.useEffect(() => {
    const connectFocus = () => {
      const focusId = locationState?.focusJobId
      if (focusId) {
        setComposing(false)
        handleSelectJob(focusId)
      }
    }
    connectFocus()
  }, [locationState?.focusJobId, handleSelectJob])

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
  }, [trackedId, followJob, setComposing])

  return {
    composing,
    setComposing,
    activeJobId,
    activeLiveStatus,
    activeRequestJson,
    activeRunEvents,
    activeRunPhase,
    pendingJobs,
    listRefreshToken,
    handleSubmitted,
    handleSelectJob,
    handleJobCancelled,
    handleJobDeleted,
    handleNavigateToJob,
    jobHref,
  }
}
