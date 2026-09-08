import type { CriteriaFieldDef, CriteriaFilterRow } from "../types"
import { createInitialCriteriaRows } from "./create-initial-criteria-rows"

/**
 * Drop draft rows whose names are not in the current schema (e.g. old
 * `basTarih`/`bitTarih` after a rename to `hareketTarihi`), and ensure every
 * required/default field still has a row. Preserves values for matching keys.
 */
export function reconcileCriteriaRowsWithSchema(
  rows: CriteriaFilterRow[],
  fields: CriteriaFieldDef[]
): CriteriaFilterRow[] {
  const allowed = new Set(fields.map((field) => field.key))
  const byName = new Map<string, CriteriaFilterRow>()

  for (const row of rows) {
    const name = row.name.trim()
    if (!name || !allowed.has(name)) continue
    byName.set(name, row)
  }

  const seeds = createInitialCriteriaRows(fields)
  return seeds.map((seed) => {
    const existing = byName.get(seed.name)
    if (!existing) return seed
    return {
      ...seed,
      id: existing.id,
      value: existing.value,
      selected: existing.selected,
    }
  })
}
