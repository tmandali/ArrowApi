import type {
  CriteriaAiMetadata,
  JsonSchemaObject,
  JsonSchemaProperty,
  ReportAiMetadata,
} from "@/features/report-criteria"

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.map(String).map((entry) => entry.trim()).filter(Boolean)
  return entries.length > 0 ? entries : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Reads the structured contract and keeps legacy `x-ai-*` schemas compatible. */
export function readReportAiMetadata(schema: JsonSchemaObject): ReportAiMetadata {
  const ai = asRecord(schema["x-ai"])
  const schemaVersion = typeof ai?.schemaVersion === "number" ? ai.schemaVersion : undefined
  const directive = typeof ai?.directive === "string"
    ? ai.directive
    : typeof schema["x-ai-directive"] === "string" ? schema["x-ai-directive"] : undefined

  return {
    schemaVersion,
    directive,
    aliases: asStringArray(ai?.aliases) ?? asStringArray(schema["x-ai-aliases"]),
    quickPrompts: asStringArray(ai?.quickPrompts) ?? asStringArray(schema["x-ai-quick-prompts"]),
    resultsPrompts: asStringArray(ai?.resultsPrompts) ?? asStringArray(schema["x-ai-results-prompts"]),
  }
}

/** Reads field-level AI behaviour from the structured contract or legacy keys. */
export function readCriteriaAiMetadata(property: JsonSchemaProperty): CriteriaAiMetadata {
  const ai = asRecord(property["x-ai"])
  const dateBehavior = typeof ai?.dateBehavior === "string"
    ? ai.dateBehavior as CriteriaAiMetadata["dateBehavior"]
    : typeof property["x-date-behavior"] === "string"
      ? property["x-date-behavior"] as CriteriaAiMetadata["dateBehavior"]
      : undefined

  return {
    intent: typeof ai?.intent === "string" ? ai.intent : undefined,
    priority: typeof ai?.priority === "number" ? ai.priority : undefined,
    columnHints: asStringArray(ai?.columnHints),
    dateBehavior,
    directive: typeof ai?.directive === "string"
      ? ai.directive
      : typeof property["x-ai-directive"] === "string" ? property["x-ai-directive"] : undefined,
    suggestions: asStringArray(ai?.suggestions) ?? asStringArray(property["x-ai-suggestions"]),
  }
}
