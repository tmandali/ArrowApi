import { ApiError } from "@/services"
import { getCompanyHeaders } from "@/lib/company-headers"
import { resolveApiUrl } from "@/lib/api-url"
import type { ArrowJobEvent } from "./types"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"

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
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      ...getCompanyHeaders(),
    },
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

      for (let i = 0; i < parts.length; i++) {
        const line = parts[i]
        if (line === "") {
          const flushedName = eventName
          flush()
          // Aynı ağ paketinde birden fazla hazırlık adımı (info/status) birikmişse,
          // kullanıcının adımları "tek seferde" donuk görmek yerine canlı birer adımla
          // izleyebilmesi için progress harici adımlar arasında kısa bir görsel tempo (70ms) bırak.
          if (
            flushedName !== "progress" &&
            parts.slice(i + 1).some((p) => p.startsWith("event:"))
          ) {
            await new Promise((r) => setTimeout(r, 70))
            if (signal.aborted) break
          }
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
