import type {
  CriteriaAiMetadata,
  JsonSchemaObject,
  JsonSchemaProperty,
  ReportAiMetadata,
  ReportAnalysisTopic,
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

function asDescriptionMap(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const out: Record<string, string> = {}
  for (const [key, desc] of Object.entries(record)) {
    if (typeof desc === "string" && desc.trim()) out[key] = desc.trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function asAnalysisTopics(value: unknown): ReportAnalysisTopic[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: ReportAnalysisTopic[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const r = entry as Record<string, unknown>
    if (typeof r.id !== "string" || typeof r.title !== "string" || typeof r.goal !== "string") continue
    if (r.tool !== "analyze" && r.tool !== "sql" && r.tool !== "visualize" && r.tool !== "filter") continue
    out.push({
      id: r.id,
      title: r.title,
      goal: r.goal,
      tool: r.tool,
      columns: Array.isArray(r.columns)
        ? r.columns.filter((c): c is string => typeof c === "string")
        : undefined,
      followUp: typeof r.followUp === "string" ? r.followUp : undefined,
    })
  }
  return out.length > 0 ? out : undefined
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
    columnDescriptions: asDescriptionMap(ai?.columnDescriptions),
    analysisTopics: asAnalysisTopics(ai?.analysisTopics),
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
