import { RecordBatchReader, type RecordBatch } from "apache-arrow"
import { ApiError, safeParseResponseBody } from "@/services"
import { getCompanyHeaders } from "@/lib/company-headers"
import { resolveApiUrl } from "@/lib/api-url"
import type {
  ArrowJobEvent,
  ArrowJobStatus,
  ArrowJobHubMessage,
} from "./types"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"

const ARROW_ACCEPT = "application/vnd.apache.arrow.stream"

/**
 * Tamamlanmış bir job'ın Arrow IPC sonucunu gövdeyi tamponlamadan,
 * batch batch (RecordBatch) akış halinde okur.
 * .NET client'ın `ArrowBatchReader.ReadBatchesAsync<T>()` deseninin React karşılığı.
 */
export async function* streamArrowRecordBatches(
  jobUrl: string,
  signal: AbortSignal
): AsyncGenerator<RecordBatch> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(jobUrl), {
      headers: { Accept: ARROW_ACCEPT, ...getCompanyHeaders() },
      signal,
    })
  } catch (networkErr: unknown) {
    if (signal?.aborted) throw networkErr
    const err = networkErr as Error
    throw new ApiError(
      `Arrow veri akışı kurulamadı: ${err.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }

  if (!response.ok) {
    const body = await safeParseResponseBody(response)
    throw new ApiError(
      response.statusText || "Arrow IPC alınamadı",
      response.status,
      body
    )
  }

  if (!response.body) {
    throw new ApiError("Yanıt gövdesi boş", response.status)
  }

  const reader = await RecordBatchReader.from(response)
  for await (const batch of reader) {
    yield batch
  }
}

export async function createArrowJob(
  endpoint: string,
  body: unknown,
  signal?: AbortSignal
): Promise<ArrowJobStatus> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(endpoint), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getCompanyHeaders(),
      },
      body: JSON.stringify(body ?? {}),
      signal,
    })
  } catch (networkErr: unknown) {
    if (signal?.aborted) throw networkErr
    const err = networkErr as Error
    throw new ApiError(
      `Sunucuya bağlanılamadı: ${err.message || "Ağ hatası"}. Arka uç servisinin (Sims.Server) çalıştığından emin olun.`,
      0,
      undefined
    )
  }

  // 409 Conflict: Sunucuda bu kriterlerle zaten çalışan/tamamlanmış bir iş var (Deduplication)
  if (response.status === 409) {
    const existingJob = (await response.json()) as ArrowJobStatus
    console.log(`[ArrowJobClient] Reusing existing job from server (409 Conflict):`, existingJob)
    return existingJob
  }

  if (!response.ok) {
    const errorBody = await safeParseResponseBody(response)
    throw new ApiError(
      response.statusText ? `Job oluşturulamadı: ${response.statusText}` : "Job oluşturulamadı",
      response.status,
      errorBody
    )
  }

  return (await response.json()) as ArrowJobStatus
}

export async function fetchJobRequest(
  jobId: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(`/api/arrow/jobs/${jobId}/request`), {
      headers: { Accept: "application/json", ...getCompanyHeaders() },
      signal,
    })
  } catch (networkErr: unknown) {
    if (signal?.aborted) throw networkErr
    const err = networkErr as Error
    throw new ApiError(
      `Job kriterleri alınamadı: ${err.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const body = await safeParseResponseBody(response)
    throw new ApiError(
      response.statusText || "Job request alınamadı",
      response.status,
      body
    )
  }

  return (await response.json()) as Record<string, unknown>
}

export async function listArrowJobs(
  endpoint: string,
  options: {
    take?: number
    skip?: number
    state?: string
    signal?: AbortSignal
  } = {}
): Promise<{ items: ArrowJobStatus[]; total: number }> {
  const params = new URLSearchParams()
  if (options.take != null) params.set("take", String(options.take))
  if (options.skip != null) params.set("skip", String(options.skip))
  if (options.state) params.set("state", options.state)

  const query = params.toString()
  const resolvedEndpoint = resolveApiUrl(query ? `${endpoint}?${query}` : endpoint)
  let response: Response
  try {
    response = await fetch(resolvedEndpoint, {
      headers: { Accept: "application/json", ...getCompanyHeaders() },
      signal: options.signal,
    })
  } catch (networkErr: unknown) {
    if (options.signal?.aborted) throw networkErr
    const err = networkErr as Error
    throw new ApiError(
      `Job listesi sunucusuna bağlanılamadı: ${err.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }

  if (!response.ok) {
    const body = await safeParseResponseBody(response)
    throw new ApiError(
      response.statusText || "Job listesi alınamadı",
      response.status,
      body
    )
  }

  return (await response.json()) as { items: ArrowJobStatus[]; total: number }
}

export async function fetchJobStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<ArrowJobStatus | null> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(`/api/arrow/jobs/${jobId}`), {
      headers: { Accept: "application/json", ...getCompanyHeaders() },
      signal,
    })
  } catch (networkErr: unknown) {
    if (signal?.aborted) throw networkErr
    const err = networkErr as Error
    throw new ApiError(
      `Job durumu alınamadı: ${err.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const body = await safeParseResponseBody(response)
    throw new ApiError(
      response.statusText || "Job durumu alınamadı",
      response.status,
      body
    )
  }

  return (await response.json()) as ArrowJobStatus
}

/** Persisted SSE event log for a job (info/progress/completed…). */
export async function fetchJobEventLog(
  jobId: string,
  signal?: AbortSignal
): Promise<ArrowJobHubMessage[]> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(`/api/arrow/jobs/${jobId}/event-log`), {
      headers: { Accept: "application/json", ...getCompanyHeaders() },
      signal,
    })
  } catch (networkErr: unknown) {
    if (signal?.aborted) throw networkErr
    const err = networkErr as Error
    throw new ApiError(
      `Event log alınamadı: ${err.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }

  if (response.status === 404) {
    return []
  }

  if (!response.ok) {
    const body = await safeParseResponseBody(response)
    throw new ApiError(
      response.statusText || "Event log alınamadı",
      response.status,
      body
    )
  }

  const raw = (await response.json()) as unknown
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const row = item as Record<string, unknown>
      const eventName =
        typeof row.eventName === "string"
          ? row.eventName
          : typeof row.EventName === "string"
            ? row.EventName
            : null
      const payload = (row.payload ?? row.Payload) as ArrowJobEvent | undefined
      if (!eventName || !payload) return null
      return { eventName, payload }
    })
    .filter((item): item is ArrowJobHubMessage => item != null)
}

export async function cancelArrowJob(jobId: string): Promise<void> {
  try {
    await fetch(resolveApiUrl(`/api/arrow/jobs/${jobId}/cancel`), {
      method: "POST",
      headers: { ...getCompanyHeaders() },
    })
  } catch (networkErr: unknown) {
    const err = networkErr as Error
    throw new ApiError(
      `Job iptal isteği gönderilemedi: ${err.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }
}

export async function deleteArrowJob(jobId: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(`/api/arrow/jobs/${jobId}`), {
      method: "DELETE",
      headers: { ...getCompanyHeaders() },
    })
  } catch (networkErr: unknown) {
    const err = networkErr as Error
    throw new ApiError(
      `Job silme isteği başarısız: ${err.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }

  if (response.status === 204 || response.status === 404) {
    return
  }

  if (!response.ok) {
    const body = await safeParseResponseBody(response)
    throw new ApiError(
      response.status === 409
        ? "Çalışan job silinemez"
        : response.statusText || "Job silinemedi",
      response.status,
      body
    )
  }
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
  const response = await fetch(resolveApiUrl(eventsUrl), {
    headers: { Accept: "text/event-stream", ...getCompanyHeaders() },
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
  const received: Array<{ eventName: string; payload: ArrowJobEvent }> = []

  const isTerminalSse = (name: string, payload: ArrowJobEvent) =>
    name === "completed" ||
    name === "failed" ||
    name === "cancelled" ||
    isTerminalJobStatus(payload.status)

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
      received.push({ eventName: name, payload })
      onEvent(name, payload)
    } catch {
      // ignore malformed keepalive payloads
    }
  }

  try {
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
      if (latest && isTerminalSse(latest.eventName, latest.payload)) {
        break
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  const terminalEntry = [...received]
    .reverse()
    .find((entry) => isTerminalSse(entry.eventName, entry.payload))
  const terminal = terminalEntry?.payload ?? received[received.length - 1]?.payload
  if (!terminal) {
    throw new Error("SSE tamamlanmadan kapandı")
  }
  // Normalize status from event name when payload.status is missing / stale.
  if (!isTerminalJobStatus(terminal.status) && terminalEntry) {
    const fromName =
      terminalEntry.eventName === "completed"
        ? "Completed"
        : terminalEntry.eventName === "failed"
          ? "Failed"
          : terminalEntry.eventName === "cancelled"
            ? "Cancelled"
            : undefined
    if (fromName) return { ...terminal, status: fromName }
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
