/**
 * Shared HTTP client for feature services.
 * Point baseURL at Sims.Server (or Vite proxy) as APIs land.
 */
import { getCompanyHeaders } from "@/lib/company-headers"
import { resolveApiUrl } from "@/lib/api-url"

const defaultHeaders: HeadersInit = {
  Accept: "application/json",
  "Content-Type": "application/json",
}

export function extractApiErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim()
  }

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>

    const detail = b.detail ?? b.Detail
    if (typeof detail === "string" && detail.trim()) return detail.trim()

    const message = b.message ?? b.Message
    if (typeof message === "string" && message.trim()) return message.trim()

    const error = b.error ?? b.Error
    if (typeof error === "string" && error.trim()) return error.trim()

    const errors = b.errors ?? b.Errors
    if (Array.isArray(errors)) {
      const msgs = errors.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      if (msgs.length > 0) return msgs.join("; ")
    } else if (errors && typeof errors === "object") {
      const msgs = Object.values(errors as Record<string, unknown>)
        .flat()
        .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      if (msgs.length > 0) return msgs.join("; ")
    }

    const title = b.title ?? b.Title
    if (typeof title === "string" && title.trim()) return title.trim()
  }

  return fallback
}

export async function safeParseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json") || contentType.includes("problem+json")) {
    try {
      return await response.json()
    } catch {
      return undefined
    }
  }

  try {
    const text = await response.text()
    if (text) {
      // Strip HTML if error is an HTML page (like 502/504 Bad Gateway from proxy)
      const clean = text.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim()
      return clean.length > 300 ? clean.slice(0, 300) + "..." : clean
    }
  } catch {
    return undefined
  }

  return undefined
}

export class ApiError extends Error {
  readonly status: number
  readonly body?: unknown

  constructor(fallbackMessage: string, status: number, body?: unknown) {
    let effectiveMessage = extractApiErrorMessage(body, fallbackMessage)

    // Detay yoksa veya sadece fallback geldiyse, HTTP durum koduna göre yönlendirici açıklama ekle
    if (!effectiveMessage || effectiveMessage === fallbackMessage) {
      if (status === 504 || status === 502 || status === 503) {
        effectiveMessage = `Sunucuya bağlanılamadı (HTTP ${status} - Ağ / Gateway Hatası). Arka uç servisinin (Sims.Server) çalıştığından emin olun.`
      } else if (status === 404) {
        effectiveMessage = `İstenen servis veya kaynak bulunamadı (HTTP 404 Not Found).`
      } else if (status === 401) {
        effectiveMessage = `Yetkilendirme hatası (HTTP 401 Unauthorized).`
      } else if (status === 403) {
        effectiveMessage = `Erişim engellendi (HTTP 403 Forbidden).`
      } else if (status >= 500) {
        effectiveMessage = `Sunucu hatası oluştu (HTTP ${status} Internal Server Error).`
      } else if (status > 0) {
        effectiveMessage = `${fallbackMessage} (HTTP ${status})`
      } else if (status === 0) {
        effectiveMessage = `Ağ bağlantı hatası: Sunucuya ulaşılamıyor.`
      }
    }

    super(effectiveMessage)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const resolvedPath = resolveApiUrl(path)
  let response: Response
  try {
    response = await fetch(resolvedPath, {
      ...init,
      headers: {
        ...defaultHeaders,
        ...getCompanyHeaders(),
        ...init.headers,
      },
    })
  } catch (err) {
    if (init.signal?.aborted) throw err
    const error = err as Error
    throw new ApiError(
      `Sunucuya bağlanılamadı: ${error.message || "Ağ hatası"}`,
      0,
      undefined
    )
  }

  if (!response.ok) {
    const body = await safeParseResponseBody(response)
    throw new ApiError(response.statusText || "İstek başarısız oldu", response.status, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
