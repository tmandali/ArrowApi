import * as React from "react"
import { useDraftCriteriaRows } from "@/store/slices/draft-criteria-store"
import type { CriteriaFilterRow, JsonSchemaObject } from "../types"
import { createInitialCriteriaRows } from "./create-initial-criteria-rows"
import { parseCriteriaSchema } from "./parse-criteria-schema"
import { reconcileCriteriaRowsWithSchema } from "./reconcile-criteria-rows"

/**
 * Binds a report's criteria grid to the shared draft store so any surface
 * (report page, Yula chat card) editing the same `scope` stays in sync.
 * Rows fall back to schema defaults until the user edits.
 * Stale keys from a previous schema version are ignored on read (submit uses
 * the reconciled view), so old `basTarih`/`bitTarih` drafts cannot leak into
 * `from_hareketTarihi` / `to_hareketTarihi` payloads.
 */
export function useSharedCriteriaDraft(
  scope: string,
  schema: JsonSchemaObject
): {
  rows: CriteriaFilterRow[]
  setRows: (rows: CriteriaFilterRow[]) => void
} {
  const { rows: storedRows, setRows } = useDraftCriteriaRows(scope)
  const fields = React.useMemo(
    () => parseCriteriaSchema(schema).fields,
    [schema]
  )
  const fallbackRows = React.useMemo(
    () => createInitialCriteriaRows(fields),
    [fields]
  )

  const rows = React.useMemo(() => {
    if (!storedRows || storedRows.length === 0) return fallbackRows
    return reconcileCriteriaRowsWithSchema(storedRows, fields)
  }, [storedRows, fields, fallbackRows])

  const setRowsReconciled = React.useCallback(
    (next: CriteriaFilterRow[]) => {
      setRows(reconcileCriteriaRowsWithSchema(next, fields))
    },
    [fields, setRows]
  )

  return { rows, setRows: setRowsReconciled }
}
