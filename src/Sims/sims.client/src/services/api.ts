/**
 * Shared HTTP client for feature services.
 * Point baseURL at Sims.Server (or Vite proxy) as APIs land.
 */
import { getCompanyHeaders } from "@/lib/company-headers"

const defaultHeaders: HeadersInit = {
  Accept: "application/json",
  "Content-Type": "application/json",
}

export function extractApiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>
    if (typeof b.detail === "string" && b.detail.trim()) return b.detail
    if (typeof b.error === "string" && b.error.trim()) return b.error
    if (b.errors && typeof b.errors === "object") {
      const msgs = Object.values(b.errors)
        .flat()
        .filter((m): m is string => typeof m === "string")
      if (msgs.length > 0) return msgs.join("; ")
    }
    if (typeof b.title === "string" && b.title.trim()) return b.title
  }
  return fallback
}

export class ApiError extends Error {
  readonly status: number
  readonly body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    const effectiveMessage = extractApiErrorMessage(body, message)
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
  const response = await fetch(path, {
    ...init,
    headers: {
      ...defaultHeaders,
      ...getCompanyHeaders(),
      ...init.headers,
    },
  })

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(response.statusText || "Request failed", response.status, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
