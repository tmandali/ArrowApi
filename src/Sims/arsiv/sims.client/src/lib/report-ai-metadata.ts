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

/** Reads the structured `x-ai` contract from the schema. */
export function readReportAiMetadata(schema: JsonSchemaObject): ReportAiMetadata {
  const ai = asRecord(schema["x-ai"])

  return {
    schemaVersion: typeof ai?.schemaVersion === "number" ? ai.schemaVersion : undefined,
    directive: typeof ai?.directive === "string" ? ai.directive : undefined,
    aliases: asStringArray(ai?.aliases),
    quickPrompts: asStringArray(ai?.quickPrompts),
    resultsPrompts: asStringArray(ai?.resultsPrompts),
  }
}

/** Reads field-level AI behaviour from the structured `x-ai` contract. */
export function readCriteriaAiMetadata(property: JsonSchemaProperty): CriteriaAiMetadata {
  const ai = asRecord(property["x-ai"])

  return {
    intent: typeof ai?.intent === "string" ? ai.intent : undefined,
    priority: typeof ai?.priority === "number" ? ai.priority : undefined,
    columnHints: asStringArray(ai?.columnHints),
    dateBehavior:
      typeof ai?.dateBehavior === "string"
        ? (ai.dateBehavior as CriteriaAiMetadata["dateBehavior"])
        : undefined,
    directive: typeof ai?.directive === "string" ? ai.directive : undefined,
    suggestions: asStringArray(ai?.suggestions),
  }
}
