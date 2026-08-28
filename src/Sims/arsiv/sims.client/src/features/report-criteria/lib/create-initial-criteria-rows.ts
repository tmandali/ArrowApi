import type { CriteriaFieldDef, CriteriaFilterRow } from "../types"

function newRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function stringifyDefault(value: string | number): string {
  return String(value)
}

/**
 * Build initial grid rows:
 * - required fields (empty value unless default exists)
 * - fields with schema default
 * - if none, a single empty row
 */
export function createInitialCriteriaRows(
  fields: CriteriaFieldDef[]
): CriteriaFilterRow[] {
  const rows: CriteriaFilterRow[] = []
  const seen = new Set<string>()

  for (const field of fields) {
    const hasDefault = field.defaultValue !== undefined
    if (!field.required && !hasDefault) continue
    if (seen.has(field.key)) continue
    seen.add(field.key)

    rows.push({
      id: newRowId(),
      selected: false,
      name: field.key,
      value: hasDefault ? stringifyDefault(field.defaultValue!) : "",
    })
  }

  if (rows.length === 0) {
    return [
      {
        id: newRowId(),
        selected: false,
        name: "",
        value: "",
      },
    ]
  }

  return rows
}
