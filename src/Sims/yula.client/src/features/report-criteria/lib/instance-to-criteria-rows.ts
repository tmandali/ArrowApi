import type { CriteriaFieldDef, CriteriaFilterRow, JsonSchemaObject } from "../types"
import { rangeBoundKeys } from "./compact-date"
import { joinMultiValue } from "./multi-value"
import { parseCriteriaSchema } from "./parse-criteria-schema"

function newRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function cleanKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function matchField(
  key: string,
  fields: CriteriaFieldDef[]
): CriteriaFieldDef | undefined {
  const clean = cleanKey(key)
  return fields.find(
    (field) =>
      field.key === key ||
      cleanKey(field.key) === clean ||
      field.title.toLowerCase() === key.toLowerCase() ||
      cleanKey(field.title) === clean
  )
}

function valueToCellValue(rawValue: unknown): string {
  if (Array.isArray(rawValue)) {
    return joinMultiValue(rawValue.map((part) => String(part)))
  }
  if (rawValue != null && typeof rawValue === "object") {
    return JSON.stringify(rawValue)
  }
  return String(rawValue)
}

/**
 * Reverse of `rowsToCriteriaInstance`: map a submitted criteria instance back
 * to name/value grid rows so a running job's criteria can be shown read-only.
 * Pure — no store writes, no AI highlight, no compose events.
 */
export function criteriaInstanceToRows(
  instance: unknown,
  schema: JsonSchemaObject
): CriteriaFilterRow[] {
  if (!instance || typeof instance !== "object" || Array.isArray(instance)) {
    return []
  }

  const fields = parseCriteriaSchema(schema).fields
  const fieldByKey = new Map(fields.map((field) => [field.key, field]))
  const entries = Object.entries(instance as Record<string, unknown>)

  const rangeRows = new Map<string, { from?: string; to?: string }>()
  const consumed = new Set<string>()
  const rangeOrder: string[] = []

  for (const [key, value] of entries) {
    if (value == null) continue
    const fromMatch = /^from_(.+)$/.exec(key)
    const toMatch = /^to_(.+)$/.exec(key)
    const baseKey = fromMatch?.[1] ?? toMatch?.[1]
    if (!baseKey) continue
    const field = fieldByKey.get(baseKey)
    if (!field?.rangeSplit) continue

    const { fromKey, toKey } = rangeBoundKeys(field.key)
    if (key !== fromKey && key !== toKey) continue
    if (!rangeRows.has(field.key)) rangeOrder.push(field.key)
    const pair = rangeRows.get(field.key) ?? {}
    if (key === fromKey) pair.from = String(value)
    else pair.to = String(value)
    rangeRows.set(field.key, pair)
    consumed.add(key)
  }

  const rows: CriteriaFilterRow[] = []

  for (const fieldKey of rangeOrder) {
    const field = fieldByKey.get(fieldKey)
    if (!field?.rangeSplit) continue
    const pair = rangeRows.get(fieldKey)
    if (!pair || (pair.from == null && pair.to == null)) continue
    rows.push({
      id: newRowId(),
      selected: false,
      name: field.key,
      value: `${pair.from ?? ""}${field.rangeSplit}${pair.to ?? pair.from ?? ""}`,
    })
  }

  for (const [key, value] of entries) {
    if (consumed.has(key) || value == null) continue
    const stringValue = valueToCellValue(value)
    if (!stringValue.trim()) continue
    const field = matchField(key, fields)
    rows.push({
      id: newRowId(),
      selected: false,
      name: field ? field.key : key,
      value: stringValue,
    })
  }

  return rows
}
