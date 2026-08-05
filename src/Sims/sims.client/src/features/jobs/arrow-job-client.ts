import { ApiError } from "@/services"
import type {
  ArrowJobEvent,
  ArrowJobStatus,
} from "@/features/stock/item/types/stock-analytics"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"

export async function fetchJobStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<ArrowJobStatus | null> {
  const response = await fetch(`/api/arrow/jobs/${jobId}`, {
    headers: { Accept: "application/json" },
    signal,
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(
      response.statusText || "Job durumu alınamadı",
      response.status,
      body
    )
  }

  return (await response.json()) as ArrowJobStatus
}

export async function cancelArrowJob(jobId: string): Promise<void> {
  await fetch(`/api/arrow/jobs/${jobId}/cancel`, { method: "POST" })
}

/**
 * SSE stream until a terminal status event. Does not throw on Failed/Cancelled.
 * Throws if the stream ends without a terminal event (unless aborted).
 */
export async function readJobSseEvents(
  eventsUrl: string,
  signal: AbortSignal,
  onEvent: (eventName: string, payload: ArrowJobEvent) => void
): Promise<ArrowJobEvent> {
  const response = await fetch(eventsUrl, {
    headers: { Accept: "text/event-stream" },
    signal,
  })

  if (!response.ok || !response.body) {
    throw new ApiError(
      response.statusText || "SSE bağlantısı başarısız",
      response.status
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventName = "message"
  let dataLines: string[] = []
  const received: ArrowJobEvent[] = []

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = "message"
      return
    }
    const raw = dataLines.join("\n")
    dataLines = []
    const name = eventName
    eventName = "message"
    try {
      const payload = JSON.parse(raw) as ArrowJobEvent
      received.push(payload)
      onEvent(name, payload)
    } catch {
      // ignore malformed keepalive payloads
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() ?? ""

    for (const line of parts) {
      if (line === "") {
        flush()
        continue
      }
      if (line.startsWith(":")) continue
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    const latest = received[received.length - 1]
    if (latest && isTerminalJobStatus(latest.status)) {
      break
    }
  }

  const terminal = received[received.length - 1]
  if (!terminal) {
    throw new Error("SSE tamamlanmadan kapandı")
  }
  return terminal
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}
