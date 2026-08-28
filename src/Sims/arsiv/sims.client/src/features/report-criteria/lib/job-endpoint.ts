import type { JsonSchemaObject } from "../types"

/**
 * Schema root `x-job-endpoint` — relative API path for criteria submit
 * (e.g. `/api/arrow/jobs/stock-balance`).
 */
export function readJobEndpoint(
  schema: JsonSchemaObject | undefined | null
): string | undefined {
  if (!schema) return undefined
  const raw = schema["x-job-endpoint"]
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Only same-origin `/api/...` paths are allowed (no open redirects). */
export function assertSafeApiJobEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  if (!trimmed.startsWith("/api/")) {
    throw new Error("x-job-endpoint must be a relative /api/... path")
  }
  if (trimmed.includes("://") || trimmed.includes("\\")) {
    throw new Error("x-job-endpoint must not contain a host or backslash")
  }
  return trimmed
}
