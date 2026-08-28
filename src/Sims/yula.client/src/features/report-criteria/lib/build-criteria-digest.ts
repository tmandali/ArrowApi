/**
 * Rapor kriter sindirimi (criteria digest): JSON Schema'daki alan başlıkları,
 * açıklamalar, enum'lar ve x-ai direktiflerini AI bağlamı için kompakt diziye
 * indirger. Grid tarafındaki columnDigest'in kriter-formu karşılığıdır.
 * `intent === "test_only"` alanlar (örn. sampleRows) dışlanır.
 */
import type {
  CriteriaAiMetadata,
  JsonSchemaObject,
  JsonSchemaProperty,
} from "@/features/report-criteria"
import { readCriteriaAiMetadata } from "@/lib/report-ai-metadata"

export interface CriteriaDigestEntry {
  key: string
  title: string
  type: string
  required: boolean
  description?: string
  /** Prop veya items seviyesindeki enum değerleri */
  enumValues?: string[]
  directive?: string
  suggestions?: string[]
}

export interface ReportCriteriaDigest {
  title: string
  description?: string
  fields: CriteriaDigestEntry[]
}

function asEnum(prop: JsonSchemaProperty): string[] | undefined {
  const direct = Array.isArray(prop.enum) ? prop.enum.map(String) : []
  if (direct.length > 0) return direct
  const items = prop.items as Record<string, unknown> | undefined
  const itemEnum =
    items && Array.isArray(items.enum) ? (items.enum as unknown[]).map(String) : []
  return itemEnum.length > 0 ? itemEnum : undefined
}

function entryFrom(
  key: string,
  prop: JsonSchemaProperty,
  requiredKeys: Set<string>
): CriteriaDigestEntry | null {
  const ai: CriteriaAiMetadata = readCriteriaAiMetadata(prop)
  // Test/geliştirici düğmeleri model görüşünden tamamen çıkar
  if (ai.intent === "test_only") return null

  const entry: CriteriaDigestEntry = {
    key,
    title: String(prop.title || key),
    type: Array.isArray(prop.type) ? prop.type.join("|") : String(prop.type ?? "string"),
    required: requiredKeys.has(key),
  }
  const desc = typeof prop.description === "string" ? prop.description.trim() : ""
  if (desc) entry.description = desc.slice(0, 200)
  const enumValues = asEnum(prop)
  if (enumValues) entry.enumValues = enumValues.slice(0, 8)
  if (ai.directive) entry.directive = ai.directive.slice(0, 200)
  if (ai.suggestions?.length) entry.suggestions = ai.suggestions.slice(0, 6)
  return entry
}

export function buildCriteriaDigest(schema: JsonSchemaObject): ReportCriteriaDigest {
  const props = (schema.properties ?? {}) as Record<string, JsonSchemaProperty>
  const requiredKeys = new Set(schema.required ?? [])
  const fields: CriteriaDigestEntry[] = []
  for (const [key, prop] of Object.entries(props)) {
    const entry = entryFrom(key, prop, requiredKeys)
    if (entry) fields.push(entry)
  }
  return {
    title: schema.title?.trim() || "Report Criteria",
    description: schema.description,
    fields,
  }
}
