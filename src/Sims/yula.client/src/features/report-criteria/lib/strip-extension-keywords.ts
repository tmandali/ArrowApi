import type { JsonSchemaObject } from "../types"

/** Deep-clone schema and remove UI-only keywords for AJV. */
export function stripExtensionKeywords(
  schema: JsonSchemaObject
): JsonSchemaObject {
  return stripValue(schema) as JsonSchemaObject
}

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripValue)
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("x-")) continue
      result[key] = stripValue(child)
    }
    return result
  }
  return value
}
