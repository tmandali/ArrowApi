import type { CriteriaFieldDef, CriteriaFilterRow } from "../types"
import {
  addDaysToCompactDate,
  rangeBoundKeys,
  splitRangeCellValue,
} from "./compact-date"
import { splitMultiValue } from "./multi-value"

function resolveLookupItem(
  field: CriteriaFieldDef,
  value: string
): string {
  const valueKey = field.lookupValueKey ?? field.lookupFields?.[0]?.key ?? "id"
  const items = field.lookupItems ?? []
  const match = items.find((item) => String(item[valueKey] ?? "") === value)
  if (match) return String(match[valueKey] ?? value)
  return value
}

function coerceFieldValue(
  field: CriteriaFieldDef,
  raw: string
): unknown {
  switch (field.kind) {
    case "number": {
      const num = Number(raw)
      return Number.isFinite(num) ? num : raw
    }
    case "objectLookup":
      // Complex types: emit identity key only (e.g. kod), not the full object.
      return resolveLookupItem(field, raw)
    case "enum":
    case "string":
      return raw
    default: {
      const _exhaustive: never = field.kind
      void _exhaustive
      return raw
    }
  }
}

/** Convert name/value grid rows into a JSON Schema instance object. */
export function rowsToCriteriaInstance(
  rows: CriteriaFilterRow[],
  fields: CriteriaFieldDef[]
): Record<string, unknown> {
  const fieldMap = new Map(fields.map((field) => [field.key, field]))
  const instance: Record<string, unknown> = {}

  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue

    const value = row.value
    const field = fieldMap.get(name)

    if (!field) {
      if (value !== "") instance[name] = value
      continue
    }

    if (value === "" || value === undefined) {
      continue
    }

    if (field.rangeSplit) {
      const { from, to } = splitRangeCellValue(value, field.rangeSplit)
      const { fromKey, toKey } = rangeBoundKeys(name)
      instance[fromKey] = from
      // Date ranges: exclusive end (+1 day) so the selected day is fully covered.
      instance[toKey] =
        field.format === "date"
          ? (addDaysToCompactDate(to, 1) ?? to)
          : to
      continue
    }

    if (field.selectionMode === "multiple") {
      const parts = splitMultiValue(value)
      if (parts.length === 0) continue
      instance[name] = parts.map((part) => coerceFieldValue(field, part))
      continue
    }

    instance[name] = coerceFieldValue(field, value)
  }

  return instance
}
