import * as React from "react"
import { useRouter } from "next/navigation";import { useJobSync } from "@/context/job-sync-context"
import {
  fetchJobRequest,
  listArrowJobs,
} from "@/features/jobs/arrow-job-client"
import {
  appendOrUpdateRunEvent,
  type RunEventItem,
} from "@/features/jobs/run-events"
import { ApiError } from "@/services"
import {
  isTerminalJobStatus,
  useActiveJobsStore,
  type TrackedJob,
} from "@/store/slices/active-jobs-store"
import type {
  ArrowJobEvent,
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
  return status === "Running" || status === "Queued"
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

function sameJobId(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0
}

function payloadBelongsToJob(payload: ArrowJobEvent, jobId: string): boolean {
  if (payload.id == null || payload.id === "") return true
  return sameJobId(String(payload.id), jobId)
}

export function useArrowJobRunner(options: ArrowJobRunnerOptions) {
  const {
    jobName,
    title,
    basePath,
    jobsEndpoint,
    workspace = "/stock",
    selectPendingJob,
  } = options

  const router = useRouter();
  const navigate = (to: string | number) => { if (typeof to === "number") router.back(); else void router.push(to); };
  const location = { pathname: typeof window !== "undefined" ? window.location.pathname : "/", state: null as unknown }
  const { trackJob, waitUntilTerminal } = useJobSync()

  const locationState = location.state as {
    focusJobId?: string
    composing?: boolean
  } | null

  const [composing, setComposing] = React.useState(
    locationState?.composing ?? true
  )
  const preferCriteriaRef = React.useRef(locationState?.composing ?? true)
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
  const liveByJobRef = React.useRef(new Map<string, JobLiveSnapshot>())
  const controllersRef = React.useRef(new Map<string, AbortController>())
  const entryResumeGenRef = React.useRef(0)
  const allowEntryResumeRef = React.useRef(true)

  const jobHref = React.useCallback(
    (jobId: string) => `${basePath}/${jobId}`,
    [basePath]
  )

  const publishFocused = React.useCallback((jobId: string | null) => {
    focusJobIdRef.current = jobId
    setActiveJobId(jobId)
    if (!jobId) {
      setActiveLiveStatus(undefined)
      setActiveRequestJson(undefined)
      setActiveRunEvents([])
      setActiveRunPhase("idle")
      return
    }
    const snap = liveByJobRef.current.get(jobId)
    setActiveLiveStatus(snap?.status)
    setActiveRequestJson(snap?.requestJson)
    setActiveRunEvents(snap?.events ?? [])
    setActiveRunPhase(snap?.phase ?? "idle")
  }, [])

  const patchLive = React.useCallback(
    (jobId: string, patch: Partial<JobLiveSnapshot>) => {
      const prev = liveByJobRef.current.get(jobId) ?? {
        events: [],
        phase: "idle" as const,
      }
      const next: JobLiveSnapshot = {
        ...prev,
        ...patch,
        events: patch.events ?? prev.events,
      }
      liveByJobRef.current.set(jobId, next)
      if (!sameJobId(focusJobIdRef.current, jobId)) return
      if (patch.status !== undefined) setActiveLiveStatus(patch.status)
      if (patch.requestJson !== undefined) setActiveRequestJson(patch.requestJson)
      if (patch.events) setActiveRunEvents(patch.events)
      if (patch.phase) setActiveRunPhase(patch.phase)
    },
    []
  )

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
      controllersRef.current.get(job.id)?.abort()
      const abort = new AbortController()
      controllersRef.current.set(job.id, abort)

      const requestJson = prettyJson(request)
      const initialEvents: RunEventItem[] = [
        {
          id: "local-0",
          eventName: "status",
          title: job.status === "Running" ? "Running" : "Queued",
          detail: "job submitted",
          tone: "muted",
          at: new Date().toISOString(),
        },
      ]

      liveByJobRef.current.set(job.id, {
        status: job.status || "Queued",
        requestJson,
        events: initialEvents,
        phase: "running",
      })
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

      const onSseEvent = (eventName: string, payload: ArrowJobEvent) => {
        if (!payloadBelongsToJob(payload, job.id)) return

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

        const prev = liveByJobRef.current.get(job.id)
        const events = appendOrUpdateRunEvent(
          prev?.events ?? [],
          eventName,
          payload
        )
        let phase: JobLiveSnapshot["phase"] = prev?.phase ?? "running"
        if (payload.status === "Cancelled" || eventName === "cancelled") {
          phase = "cancelled"
        } else if (payload.status === "Completed" || eventName === "completed") {
          phase = "done"
        } else if (payload.status === "Failed" || eventName === "failed") {
          phase = "idle"
        } else if (!isTerminalJobStatus(prev?.status)) {
          phase = "running"
        }

        patchLive(job.id, {
          events,
          status: payload.status || prev?.status,
          phase,
        })
      }

      try {
        const terminal = await waitUntilTerminal(job.id, {
          signal: abort.signal,
          onEvent: onSseEvent,
        })

        setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, job.id)))
        setListRefreshToken((n) => n + 1)

        const prev = liveByJobRef.current.get(job.id)
        let events = prev?.events ?? []
        let phase: JobLiveSnapshot["phase"] = "idle"

        if (terminal.status === "Cancelled") {
          phase = "cancelled"
        } else if (terminal.status === "Failed") {
          phase = "idle"
          if (!events.some((e) => e.eventName === "failed")) {
            events = appendOrUpdateRunEvent(events, "failed", {
              id: job.id,
              status: "Failed",
              error: terminal.error || "job failed",
            })
          }
        } else if (terminal.status === "Completed") {
          phase = "done"
          if (!events.some((e) => e.eventName === "completed")) {
            events = appendOrUpdateRunEvent(events, "completed", {
              id: job.id,
              status: "Completed",
              totalRows: terminal.totalRows,
              batchCount: terminal.batchCount,
            })
          }
        }

        patchLive(job.id, {
          events,
          status: terminal.status,
          phase,
        })
      } catch (err) {
        if (abort.signal.aborted) return
        setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, job.id)))
        setListRefreshToken((n) => n + 1)
        const prev = liveByJobRef.current.get(job.id)
        const events = appendOrUpdateRunEvent(prev?.events ?? [], "failed", {
          id: job.id,
          status: "Failed",
          error: (err as Error)?.message || "stream error",
        })
        patchLive(job.id, {
          events,
          status: "Failed",
          phase: "idle",
        })
      } finally {
        controllersRef.current.delete(job.id)
      }
    },
    [patchLive, publishFocused, trackRunnerJob, waitUntilTerminal]
  )

  const handleSubmitted = React.useCallback(
    (job: ArrowJobStatus, request: Record<string, unknown>) => {
      allowEntryResumeRef.current = false
      preferCriteriaRef.current = false
      setComposing(false)
      void followJob(job, request)
    },
    [followJob]
  )
  const handleSelectJob = React.useCallback(
    (jobOrId: ArrowJobStatus | string | null) => {
      if (!jobOrId) {
        publishFocused(null)
        return
      }

      const jobId = typeof jobOrId === "string" ? jobOrId : jobOrId.id
      const jobStatus = typeof jobOrId === "string" ? undefined : jobOrId.status

      publishFocused(jobId)

      if (liveByJobRef.current.has(jobId)) return

      const initialPhase: JobLiveSnapshot["phase"] =
        jobStatus === "Completed"
          ? "done"
          : jobStatus === "Cancelled"
            ? "cancelled"
            : jobStatus && isTerminalJobStatus(jobStatus)
              ? "idle"
              : "running"

      liveByJobRef.current.set(jobId, {
        status: jobStatus,
        events: [],
        phase: initialPhase,
      })
      publishFocused(jobId)

      void fetchJobRequest(jobId).then((req) => {
        if (!req) return
        patchLive(jobId, { requestJson: prettyJson(req) })
      })

      const targetJob: ArrowJobStatus =
        typeof jobOrId === "string"
          ? { id: jobId, status: jobStatus || "Queued", jobUrl: "", eventsUrl: "" }
          : jobOrId

      if (isInFlightStatus(targetJob.status) && !controllersRef.current.has(jobId)) {
        void fetchJobRequest(jobId).then((req) => {
          void followJob(targetJob, req ?? {})
        })
      }
    },
    [followJob, patchLive, publishFocused]
  )

  const applyExecutionFocus = React.useCallback(
    (job: ArrowJobStatus, request?: Record<string, unknown>) => {
      if (isInFlightStatus(job.status)) {
        handleSubmitted(job, request ?? {})
        return
      }
      preferCriteriaRef.current = false
      setComposing(false)
      handleSelectJob(job)
    },
    [handleSelectJob, handleSubmitted],
  )

  const applyExecutionFocusRef = React.useRef(applyExecutionFocus)
  applyExecutionFocusRef.current = applyExecutionFocus

  React.useEffect(() => {
    const pending = takePendingExecutionFocus(jobName)
    if (pending) {
      applyExecutionFocusRef.current(pending.job, pending.request)
    } else if (typeof window !== "undefined") {
      const jobId = new URLSearchParams(window.location.search).get("job")
      if (jobId) {
        const tracked = useActiveJobsStore.getState().jobs[jobId]
        applyExecutionFocusRef.current(
          {
            id: jobId,
            status: tracked?.status || "Completed",
            eventsUrl: tracked?.eventsUrl ?? "",
            jobUrl: tracked?.jobUrl ?? "",
            createdAt: tracked?.createdAt,
            name: tracked?.name,
          },
          tracked?.payload,
        )
      }
    }
    return subscribeExecutionFocus(jobName, (focus) => {
      applyExecutionFocusRef.current(focus.job, focus.request)
    })
  }, [jobName])

  const handleJobCancelled = React.useCallback(
    (jobId: string) => {
      controllersRef.current.get(jobId)?.abort()
      controllersRef.current.delete(jobId)
      patchLive(jobId, { status: "Cancelled", phase: "cancelled" })
      setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, jobId)))
      setListRefreshToken((n) => n + 1)
    },
    [patchLive]
  )

  const handleJobDeleted = React.useCallback(
    (jobId: string) => {
      controllersRef.current.get(jobId)?.abort()
      controllersRef.current.delete(jobId)
      liveByJobRef.current.delete(jobId)
      setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, jobId)))
      setListRefreshToken((n) => n + 1)
      if (sameJobId(focusJobIdRef.current, jobId)) {
        publishFocused(null)
        setComposing(true)
      }
    },
    [publishFocused]
  )

  const handleNavigateToJob = React.useCallback(
    (jobId: string) => {
      navigate(jobHref(jobId))
    },
    [navigate, jobHref]
  )

  React.useEffect(() => {
    const focusId = locationState?.focusJobId
    if (focusId) {
      preferCriteriaRef.current = false
      setComposing(false)
      handleSelectJob(focusId)
    }
  }, [locationState?.focusJobId, handleSelectJob])

  // Sayfaya ilk girişte varsa in-flight job'ı otomatik bağla
  const pendingTrackedJob = useActiveJobsStore((s) =>
    selectPendingJob ? selectPendingJob(s.jobs) : null
  )
  const trackedId = pendingTrackedJob?.id
  const trackedStatus = pendingTrackedJob?.status
  const trackedName = pendingTrackedJob?.name
  const trackedEventsUrl = pendingTrackedJob?.eventsUrl
  const trackedJobUrl = pendingTrackedJob?.jobUrl
  const trackedCreatedAt = pendingTrackedJob?.createdAt

  React.useEffect(() => {
    if (!trackedId) return
    if (!allowEntryResumeRef.current) return
    if (controllersRef.current.has(trackedId)) return

    const abort = new AbortController()
    const gen = ++entryResumeGenRef.current

    const resumeEntryInFlight = async () => {
      try {
        const page = await listArrowJobs(jobsEndpoint, {
          take: 20,
          signal: abort.signal,
        })
        const match = page.items?.find((item) => sameJobId(item.id, trackedId))
        let resumeTarget: ArrowJobStatus | null = null

        if (match && isInFlightStatus(match.status)) {
          resumeTarget = match
        } else if (!match) {
          resumeTarget = {
            id: trackedId,
            status: trackedStatus || "Queued",
            name: trackedName,
            eventsUrl: trackedEventsUrl ?? "",
            jobUrl: trackedJobUrl ?? "",
            createdAt: trackedCreatedAt,
          }
        }

        if (abort.signal.aborted || gen !== entryResumeGenRef.current) return
        if (!resumeTarget) return

        preferCriteriaRef.current = false
        setComposing(false)

        const req = (await fetchJobRequest(resumeTarget.id, abort.signal)) ?? {}
        if (abort.signal.aborted || gen !== entryResumeGenRef.current) return

        void followJob(resumeTarget, req)
      } catch {
        // yoksay
      }
    }

    void resumeEntryInFlight()

    return () => {
      abort.abort()
    }
  }, [
    trackedId,
    trackedStatus,
    trackedName,
    trackedEventsUrl,
    trackedJobUrl,
    trackedCreatedAt,
    jobsEndpoint,
    followJob,
  ])

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
