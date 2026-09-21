import type { ArrowJobEvent } from "../types"
import { appendOrUpdateRunEvent } from "../run-events"
import { readJobSseEvents } from "../arrow-job-client"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"
import { deferredManager } from "@my-agent/core"
import { type JobHubSession, type JobPhase, normId } from "./arrow-job-hub-types"

export async function executeJobSseStream(
  key: string,
  session: JobHubSession,
  emitEvent: (key: string, eventName: string, payload: ArrowJobEvent) => void,
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

    // ⏱️ Pi Deferred: Terminal durumda (Completed, Failed, Cancelled) askıya alınmış ajanı uyandır
    if (phase === "done" || phase === "cancelled" || payload.status === "Failed" || eventName === "failed") {
      try {
        deferredManager.resume(normId(session.snapshot.jobId || key), session.snapshot)
      } catch {
        // Deferred resume best-effort
      }
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
        emitEvent(key, eventName, payload)
      } else {
        session.lastProgressPayload = payload
        if (!session.pendingProgressTimer) {
          session.pendingProgressTimer = setTimeout(() => {
            session.pendingProgressTimer = null
            session.lastProgressEmitMs = Date.now()
            const pending = session.lastProgressPayload
            session.lastProgressPayload = null
            if (pending && !abortController.signal.aborted) {
              emitEvent(key, "progress", pending)
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
      emitEvent(key, eventName, payload)
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
    emitEvent(key, terminalEventName, terminal)
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

    emitEvent(key, "failed", {
      id: key,
      status: "Failed",
      error: (err as Error)?.message || "stream error",
    })
  }
}
