import type { ArrowJobEvent } from "../types"
import { type RunEventItem, appendOrUpdateRunEvent } from "../run-events"
import { fetchJobStatus, readJobSseEvents } from "../arrow-job-client"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"

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

function normId(id: string | null | undefined): string {
  return id ? id.trim().toLowerCase() : ""
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return "{\n  \n}"
  }
}

/**
 * Native EventTarget tabanlı singleton SSE olay dağıtım servisi (Pub/Sub).
 * React bileşen yaşam döngüsünden bağımsız çalışır; SSE stream'lerini
 * deduplicate eder ve bileşenlerin akış ortasında dahi güncel adımları
 * kaçırmadan (replay) dinlemesini sağlar.
 */
export class ArrowJobEventHub extends EventTarget {
  private sessions = new Map<
    string,
    {
      snapshot: JobHubSnapshot
      abortController: AbortController
      subscribersCount: number
      cleanupTimer?: ReturnType<typeof setTimeout> | null
      lastProgressEmitMs?: number
      pendingProgressTimer?: ReturnType<typeof setTimeout> | null
      lastProgressPayload?: ArrowJobEvent | null
    }
  >()

  /** Belirtilen job için mevcut bellek snapshot'ını döner. */
  getSnapshot(jobId: string): JobHubSnapshot | undefined {
    return this.sessions.get(normId(jobId))?.snapshot
  }

  /** Belirtilen job için birikmiş SSE adımlarını döner. */
  getEvents(jobId: string): RunEventItem[] {
    return this.sessions.get(normId(jobId))?.snapshot.events ?? []
  }

  /** Belirtilen job'ın SSE akışı canlı akıyor mu? */
  isStreaming(jobId: string): boolean {
    return Boolean(this.sessions.get(normId(jobId))?.snapshot.isStreaming)
  }

  /**
   * Job için SSE akışını başlatır veya devam eden akışı paylaşır.
   * Aynı jobId için tekrar çağrıldığında mevcut stream deduplicate edilir.
   */
  startStream(
    job: {
      id: string
      status?: string
      eventsUrl?: string
      jobUrl?: string
      name?: string
      createdAt?: string
    },
    options?: {
      request?: Record<string, unknown>
      forceRestart?: boolean
    }
  ): AbortController {
    const key = normId(job.id)
    let session = this.sessions.get(key)

    if (session && !options?.forceRestart && session.snapshot.isStreaming) {
      if (options?.request && !session.snapshot.requestJson) {
        session.snapshot.requestJson = prettyJson(options.request)
      }
      return session.abortController
    }

    if (session?.abortController) {
      session.abortController.abort()
    }

    const abortController = new AbortController()
    const requestJson = options?.request
      ? prettyJson(options.request)
      : session?.snapshot.requestJson

    const initialPhase: JobPhase =
      job.status === "Completed"
        ? "done"
        : job.status === "Cancelled"
          ? "cancelled"
          : job.status === "Failed"
            ? "idle"
            : "running"

    const initialEvents: RunEventItem[] = session?.snapshot.events.length
      ? session.snapshot.events
      : initialPhase === "running"
        ? [
            {
              id: `${key}-status-0`,
              eventName: "status",
              title: "Running",
              detail: "status",
              tone: "muted",
              at: job.createdAt || new Date().toISOString(),
            },
          ]
        : []

    const snapshot: JobHubSnapshot = {
      jobId: key,
      status: job.status || "Queued",
      phase: initialPhase,
      events: initialEvents,
      requestJson,
      eventsUrl: job.eventsUrl,
      jobUrl: job.jobUrl,
      name: job.name,
      createdAt: job.createdAt || new Date().toISOString(),
      isStreaming: initialPhase === "running",
    }

    session = {
      snapshot,
      abortController,
      subscribersCount: session?.subscribersCount ?? 0,
      cleanupTimer: null,
    }
    this.sessions.set(key, session)

    this.emitEvent(key, "init", { id: key, status: snapshot.status })

    if (initialPhase === "running") {
      void this.runSseStream(key, session, job.eventsUrl)
    }

    return abortController
  }

  private async runSseStream(
    key: string,
    session: NonNullable<ReturnType<typeof this.sessions.get>>,
    eventsUrl?: string
  ) {
    const url = eventsUrl || `/api/arrow/jobs/${key}/events`
    const { abortController } = session

    const onSseEvent = (eventName: string, payload: ArrowJobEvent) => {
      if (abortController.signal.aborted) return

      const prev = session.snapshot
      const nextEvents = appendOrUpdateRunEvent(prev.events, eventName, payload)

      let phase: JobPhase = prev.phase
      if (payload.status === "Cancelled" || eventName === "cancelled") {
        phase = "cancelled"
      } else if (payload.status === "Completed" || eventName === "completed") {
        phase = "done"
      } else if (payload.status === "Failed" || eventName === "failed") {
        phase = "idle"
      } else if (!isTerminalJobStatus(prev.status)) {
        phase = "running"
      }

      session.snapshot = {
        ...prev,
        events: nextEvents,
        status: payload.status || prev.status,
        phase,
        totalRows:
          typeof payload.totalRows === "number"
            ? payload.totalRows
            : prev.totalRows,
        batchCount:
          typeof payload.batchCount === "number"
            ? payload.batchCount
            : prev.batchCount,
        error: payload.error ?? prev.error,
        completedAt: payload.completedAt ?? prev.completedAt,
        isStreaming: phase === "running",
      }

      // Progress olayları yüksek frekansta (saniyede onlarca kez) gelebilir.
      // Snapshot her zaman anında güncellenirken, UI yayınları ~60ms aralıkla akıcı dağıtılır.
      // Diğer tüm olaylar (status, info, completed, failed, cancelled) bekletilmeden derhal iletilir.
      if (eventName === "progress") {
        const now = Date.now()
        const elapsed = now - (session.lastProgressEmitMs ?? 0)
        if (elapsed >= 60) {
          if (session.pendingProgressTimer) {
            clearTimeout(session.pendingProgressTimer)
            session.pendingProgressTimer = null
          }
          session.lastProgressEmitMs = now
          this.emitEvent(key, eventName, payload)
        } else {
          session.lastProgressPayload = payload
          if (!session.pendingProgressTimer) {
            session.pendingProgressTimer = setTimeout(() => {
              session.pendingProgressTimer = null
              session.lastProgressEmitMs = Date.now()
              const pending = session.lastProgressPayload
              session.lastProgressPayload = null
              if (pending && !abortController.signal.aborted) {
                this.emitEvent(key, "progress", pending)
              }
            }, Math.max(16, 60 - elapsed))
          }
        }
      } else {
        if (session.pendingProgressTimer) {
          clearTimeout(session.pendingProgressTimer)
          session.pendingProgressTimer = null
          session.lastProgressPayload = null
        }
        this.emitEvent(key, eventName, payload)
      }
    }

    try {
      const terminal = await readJobSseEvents(
        url,
        abortController.signal,
        onSseEvent
      )

      const prev = session.snapshot
      let events = prev.events
      let phase: JobPhase = "idle"

      if (terminal.status === "Cancelled") {
        phase = "cancelled"
        events = appendOrUpdateRunEvent(events, "cancelled", {
          id: key,
          status: "Cancelled",
          totalRows: terminal.totalRows,
          batchCount: terminal.batchCount,
        })
      } else if (terminal.status === "Failed") {
        phase = "idle"
        if (!events.some((e) => e.eventName === "failed")) {
          events = appendOrUpdateRunEvent(events, "failed", {
            id: key,
            status: "Failed",
            error: terminal.error || "job failed",
          })
        }
      } else if (terminal.status === "Completed") {
        phase = "done"
        if (!events.some((e) => e.eventName === "completed")) {
          events = appendOrUpdateRunEvent(events, "completed", {
            id: key,
            status: "Completed",
            totalRows: terminal.totalRows,
            batchCount: terminal.batchCount,
          })
        }
      }

      session.snapshot = {
        ...prev,
        events,
        status: terminal.status,
        phase,
        isStreaming: false,
        totalRows:
          typeof terminal.totalRows === "number"
            ? terminal.totalRows
            : prev.totalRows,
        batchCount:
          typeof terminal.batchCount === "number"
            ? terminal.batchCount
            : prev.batchCount,
      }

      if (session.pendingProgressTimer) {
        clearTimeout(session.pendingProgressTimer)
        session.pendingProgressTimer = null
        session.lastProgressPayload = null
      }

      const terminalEventName = terminal.status.toLowerCase()
      this.emitEvent(key, terminalEventName, terminal)
    } catch (err) {
      if (session.pendingProgressTimer) {
        clearTimeout(session.pendingProgressTimer)
        session.pendingProgressTimer = null
        session.lastProgressPayload = null
      }
      if (abortController.signal.aborted) return

      const prev = session.snapshot
      const events = appendOrUpdateRunEvent(prev.events, "failed", {
        id: key,
        status: "Failed",
        error: (err as Error)?.message || "stream error",
      })

      session.snapshot = {
        ...prev,
        events,
        status: "Failed",
        phase: "idle",
        isStreaming: false,
        error: (err as Error)?.message || "stream error",
      }

      this.emitEvent(key, "failed", {
        id: key,
        status: "Failed",
        error: (err as Error)?.message || "stream error",
      })
    }
  }

  private emitEvent(key: string, eventName: string, payload: ArrowJobEvent) {
    const session = this.sessions.get(key)
    if (!session) return

    const detail: JobHubEventDetail = {
      jobId: key,
      eventName,
      payload,
      snapshot: session.snapshot,
    }

    this.dispatchEvent(new CustomEvent(`job:${key}`, { detail }))
    this.dispatchEvent(new CustomEvent(`job:${key}:${eventName}`, { detail }))
    this.dispatchEvent(new CustomEvent("job:event", { detail }))
  }

  /**
   * Belirtilen jobId'nin SSE akışına abone olur.
   * `replay !== false` iken varsa bellekteki güncel durumu anında geri oynatır.
   * Native `signal` desteği ile unmount anında tek satırda otomatik temizlenir.
   */
  subscribe(
    jobId: string,
    listener: (detail: JobHubEventDetail) => void,
    options?: { signal?: AbortSignal; replay?: boolean }
  ): () => void {
    const key = normId(jobId)
    const eventType = `job:${key}`

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<JobHubEventDetail>
      if (customEvent.detail) {
        listener(customEvent.detail)
      }
    }

    this.addEventListener(eventType, handler, { signal: options?.signal })

    const session = this.sessions.get(key)
    if (session) {
      session.subscribersCount++
      if (session.cleanupTimer) {
        clearTimeout(session.cleanupTimer)
        session.cleanupTimer = null
      }

      if (options?.replay !== false) {
        listener({
          jobId: key,
          eventName: "replay",
          payload: {
            id: key,
            status: session.snapshot.status,
            totalRows: session.snapshot.totalRows ?? undefined,
            batchCount: session.snapshot.batchCount ?? undefined,
          },
          snapshot: session.snapshot,
        })
      }
    }

    return () => {
      this.removeEventListener(eventType, handler)
      const cur = this.sessions.get(key)
      if (cur) {
        cur.subscribersCount = Math.max(0, cur.subscribersCount - 1)
        if (cur.subscribersCount === 0 && !cur.snapshot.isStreaming) {
          cur.cleanupTimer = setTimeout(() => {
            if (cur.subscribersCount === 0) {
              this.sessions.delete(key)
            }
          }, 60000)
        }
      }
    }
  }

  /**
   * Job'ın tamamlanmasını (Completed, Failed, Cancelled) Promise olarak bekler.
   * Bellekte iş zaten tamamlanmışsa derhal resolve eder.
   */
  async waitUntilTerminal(
    jobId: string,
    options?: {
      signal?: AbortSignal
      onEvent?: (eventName: string, payload: ArrowJobEvent) => void
    }
  ): Promise<ArrowJobEvent> {
    const key = normId(jobId)
    const existing = this.getSnapshot(key)

    if (existing && isTerminalJobStatus(existing.status)) {
      return {
        id: key,
        status: existing.status,
        totalRows: existing.totalRows ?? undefined,
        batchCount: existing.batchCount ?? undefined,
        error: existing.error ?? undefined,
        completedAt: existing.completedAt,
        name: existing.name,
        jobUrl: existing.jobUrl,
        eventsUrl: existing.eventsUrl,
      }
    }

    if (!existing) {
      try {
        const status = await fetchJobStatus(key, options?.signal)
        if (status && isTerminalJobStatus(status.status)) {
          return {
            id: key,
            status: status.status,
            totalRows: status.totalRows ?? undefined,
            batchCount: status.batchCount ?? undefined,
            error: status.error ?? undefined,
            completedAt: status.completedAt ?? undefined,
            name: status.name,
            jobUrl: status.jobUrl,
            eventsUrl: status.eventsUrl,
          }
        }
      } catch {
        if (options?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }
      }
    }

    return new Promise<ArrowJobEvent>((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"))
        return
      }

      let settled = false
      let unsub = () => {}

      const cleanup = () => {
        unsub()
        options?.signal?.removeEventListener("abort", onAbort)
      }

      const onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(new DOMException("Aborted", "AbortError"))
      }

      options?.signal?.addEventListener("abort", onAbort, { once: true })

      unsub = this.subscribe(
        key,
        (detail) => {
          if (settled) return
          options?.onEvent?.(detail.eventName, detail.payload)

          if (
            isTerminalJobStatus(detail.snapshot.status) ||
            !detail.snapshot.isStreaming
          ) {
            settled = true
            cleanup()
            resolve(detail.payload)
          }
        },
        { signal: options?.signal, replay: false }
      )
    })
  }

  cancelJob(
    jobId: string,
    finalCounts?: { totalRows?: number | null; batchCount?: number | null }
  ) {
    const key = normId(jobId)
    let session = this.sessions.get(key)
    const totalRows =
      typeof finalCounts?.totalRows === "number"
        ? finalCounts.totalRows
        : session?.snapshot.totalRows
    const batchCount =
      typeof finalCounts?.batchCount === "number"
        ? finalCounts.batchCount
        : session?.snapshot.batchCount

    if (session) {
      if (session.pendingProgressTimer) {
        clearTimeout(session.pendingProgressTimer)
        session.pendingProgressTimer = null
        session.lastProgressPayload = null
      }
      session.abortController.abort()

      let events = session.snapshot.events
      events = appendOrUpdateRunEvent(events, "cancelled", {
        id: key,
        status: "Cancelled",
        totalRows: totalRows ?? undefined,
        batchCount: batchCount ?? undefined,
      })

      session.snapshot = {
        ...session.snapshot,
        status: "Cancelled",
        phase: "cancelled",
        isStreaming: false,
        totalRows,
        batchCount,
        events,
      }
    } else {
      const events = appendOrUpdateRunEvent([], "cancelled", {
        id: key,
        status: "Cancelled",
        totalRows: totalRows ?? undefined,
        batchCount: batchCount ?? undefined,
      })

      session = {
        snapshot: {
          jobId: key,
          status: "Cancelled",
          phase: "cancelled",
          events,
          isStreaming: false,
          totalRows,
          batchCount,
        },
        abortController: new AbortController(),
        subscribersCount: 0,
        cleanupTimer: null,
      }
      this.sessions.set(key, session)
    }
    this.emitEvent(key, "cancelled", {
      id: key,
      status: "Cancelled",
      totalRows: totalRows ?? undefined,
      batchCount: batchCount ?? undefined,
    })
  }

  removeJob(jobId: string) {
    const key = normId(jobId)
    const session = this.sessions.get(key)
    if (session) {
      if (session.pendingProgressTimer) {
        clearTimeout(session.pendingProgressTimer)
        session.pendingProgressTimer = null
        session.lastProgressPayload = null
      }
      session.abortController.abort()
      this.sessions.delete(key)
    }
  }
}

export const arrowJobEventHub = new ArrowJobEventHub()
