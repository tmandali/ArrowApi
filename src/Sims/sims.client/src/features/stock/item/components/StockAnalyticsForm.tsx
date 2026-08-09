import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useJobSync } from "@/context/job-sync-context"
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
  selectPendingStockAnalyticsJob,
  useActiveJobsStore,
} from "@/store/slices/active-jobs-store"
import type {
  ArrowJobEvent,
  ArrowJobStatus,
} from "@/features/stock/item/types/stock-analytics"
import { ItemForm } from "./ItemForm"

const STOCK_ANALYTICS_PATH = "/stock/stock-analytics"
const STOCK_ANALYTICS_JOBS = "/api/arrow/jobs/stock-analytics"

function isInFlightStatus(status: string | undefined): boolean {
  return status === "Running" || status === "Queued"
}

function pickLatestInFlight(items: ArrowJobStatus[]): ArrowJobStatus | null {
  const inFlight = items.filter((job) => isInFlightStatus(job.status))
  if (inFlight.length === 0) return null
  return inFlight.reduce((latest, job) => {
    const latestMs = Date.parse(latest.createdAt || "") || 0
    const jobMs = Date.parse(job.createdAt || "") || 0
    return jobMs >= latestMs ? job : latest
  })
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return "{\n  \n}"
  }
}

function errorMessage(error: unknown, fallback: string): string {
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

function jobHref(jobId: string): string {
  return `${STOCK_ANALYTICS_PATH}/${jobId}`
}

function sameJobId(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0
}

function payloadBelongsToJob(payload: ArrowJobEvent, jobId: string): boolean {
  if (payload.id == null || payload.id === "") return true
  return sameJobId(String(payload.id), jobId)
}

type PendingJob = {
  id: string
  status: string
  createdAt: string
  name?: string
}

type JobLiveSnapshot = {
  status?: string
  requestJson?: string
  events: RunEventItem[]
  phase: "idle" | "running" | "done" | "cancelled"
}

export function StockAnalyticsForm() {
  const navigate = useNavigate()
  const { trackJob, waitUntilTerminal } = useJobSync()

  const [composing, setComposing] = React.useState(true)
  const preferCriteriaRef = React.useRef(true)
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null)
  const [activeLiveStatus, setActiveLiveStatus] = React.useState<
    string | undefined
  >()
  const [activeRequestJson, setActiveRequestJson] = React.useState<
    string | undefined
  >()
  const [activeRunEvents, setActiveRunEvents] = React.useState<RunEventItem[]>(
    []
  )
  const [activeRunPhase, setActiveRunPhase] = React.useState<
    "idle" | "running" | "done" | "cancelled"
  >("idle")
  const [pendingJobs, setPendingJobs] = React.useState<PendingJob[]>([])
  const [listRefreshToken, setListRefreshToken] = React.useState(0)

  const focusJobIdRef = React.useRef<string | null>(null)
  const liveByJobRef = React.useRef(new Map<string, JobLiveSnapshot>())
  const controllersRef = React.useRef(new Map<string, AbortController>())
  const entryResumeGenRef = React.useRef(0)
  const allowEntryResumeRef = React.useRef(true)

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

  const trackAnalyticsJob = React.useCallback(
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
        name: job.name || "stock-analytics",
        title: "Stock Analytics",
        href: jobHref(job.id),
        status: job.status || "Queued",
        eventsUrl: job.eventsUrl,
        jobUrl: job.jobUrl,
        createdAt: job.createdAt || new Date().toISOString(),
        notificationType: "report",
        workspace: "/stock",
        successTitle: "Stock Analytics Ready",
        successDescription:
          "Stock Analytics job tamamlandı. Açmak için bildirime tıklayın.",
        failureTitle: "Stock Analytics Failed",
        payload,
      })
    },
    [trackJob]
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

      trackAnalyticsJob(job, request)

      const onSseEvent = (eventName: string, payload: ArrowJobEvent) => {
        if (!payloadBelongsToJob(payload, job.id)) return

        if (payload.status) {
          setPendingJobs((prev) =>
            prev.map((p) =>
              sameJobId(p.id, job.id)
                ? { ...p, status: payload.status || p.status }
                : p
            )
          )
        }

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
              totalRows: terminal.totalRows ?? undefined,
            })
          }
        }

        patchLive(job.id, {
          status: terminal.status || prev?.status,
          events,
          phase,
        })
      } catch (error) {
        setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, job.id)))
        if (abort.signal.aborted) return
        const prev = liveByJobRef.current.get(job.id)
        patchLive(job.id, {
          status: "Failed",
          phase: "idle",
          events: appendOrUpdateRunEvent(prev?.events ?? [], "failed", {
            id: job.id,
            status: "Failed",
            error: errorMessage(error, "job failed"),
          }),
        })
        setListRefreshToken((n) => n + 1)
      } finally {
        controllersRef.current.delete(job.id)
      }
    },
    [trackAnalyticsJob, waitUntilTerminal, publishFocused, patchLive]
  )

  const handleJobCreated = React.useCallback(
    (job: ArrowJobStatus, request: Record<string, unknown>) => {
      allowEntryResumeRef.current = false
      preferCriteriaRef.current = false
      setComposing(false)
      void followJob(job, request)
    },
    [followJob]
  )

  React.useEffect(() => {
    if (!allowEntryResumeRef.current) return
    const gen = ++entryResumeGenRef.current

    const resume = async () => {
      try {
        const tracked = selectPendingStockAnalyticsJob(
          useActiveJobsStore.getState().jobs
        )

        let job: ArrowJobStatus | null = tracked
          ? {
              id: tracked.id,
              status: tracked.status,
              jobUrl: tracked.jobUrl,
              eventsUrl: tracked.eventsUrl,
              name: tracked.name,
              createdAt: tracked.createdAt,
            }
          : null

        let request: Record<string, unknown> =
          (tracked?.payload as Record<string, unknown> | undefined) ?? {}

        if (!job) {
          const page = await listArrowJobs(STOCK_ANALYTICS_JOBS, { take: 50 })
          if (
            entryResumeGenRef.current !== gen ||
            !allowEntryResumeRef.current
          ) {
            return
          }
          job = pickLatestInFlight(page.items ?? [])
        }

        if (
          !job ||
          entryResumeGenRef.current !== gen ||
          !allowEntryResumeRef.current
        ) {
          return
        }

        if (!Object.keys(request).length) {
          const body = await fetchJobRequest(job.id)
          if (
            entryResumeGenRef.current !== gen ||
            !allowEntryResumeRef.current
          ) {
            return
          }
          request = body ?? {}
        }

        allowEntryResumeRef.current = false
        preferCriteriaRef.current = false
        setComposing(false)
        void followJob(job, request)
      } catch {
        // Keep Criteria on resume failure.
      }
    }

    void resume()
  }, [followJob])

  const handleListLoaded = React.useCallback((count: number) => {
    if (count === 0) {
      preferCriteriaRef.current = true
      setComposing(true)
      return
    }
    if (preferCriteriaRef.current) return
    setComposing(false)
  }, [])

  const openJobResult = React.useCallback(
    (jobId: string) => {
      navigate(jobHref(jobId))
    },
    [navigate]
  )

  const handleJobSelect = React.useCallback(
    (jobId: string) => {
      preferCriteriaRef.current = false
      setComposing(false)
      if (liveByJobRef.current.has(jobId)) {
        publishFocused(jobId)
        return
      }
      focusJobIdRef.current = null
      setActiveJobId(null)
      setActiveLiveStatus(undefined)
      setActiveRequestJson(undefined)
      setActiveRunEvents([])
      setActiveRunPhase("idle")
    },
    [publishFocused]
  )

  const handleJobDeleted = React.useCallback(
    (jobId: string) => {
      controllersRef.current.get(jobId)?.abort()
      controllersRef.current.delete(jobId)
      liveByJobRef.current.delete(jobId)
      setPendingJobs((prev) => prev.filter((p) => !sameJobId(p.id, jobId)))
      if (!sameJobId(focusJobIdRef.current, jobId)) return
      publishFocused(null)
    },
    [publishFocused]
  )

  return (
    <ItemForm
      mode="stock-analytics"
      tabs={[]}
      onStartNewReport={() => {
        allowEntryResumeRef.current = false
        entryResumeGenRef.current += 1
        preferCriteriaRef.current = true
        setComposing(true)
        publishFocused(null)
      }}
      onStockAnalyticsJobCreated={handleJobCreated}
      stockAnalyticsJobSession={{
        activeJobId,
        activeLiveStatus,
        activeRequestJson,
        activeRunEvents,
        activeRunPhase,
        composing,
        pendingJobs,
        listRefreshToken,
        onExitCompose: () => {
          preferCriteriaRef.current = false
          setComposing(false)
        },
        onJobSelect: handleJobSelect,
        onOpenJob: openJobResult,
        openJobHref: jobHref,
        onJobDeleted: handleJobDeleted,
        onListLoaded: handleListLoaded,
      }}
    />
  )
}
