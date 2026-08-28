import * as React from "react"
import { useDraftCriteriaRows } from "@/store/slices/draft-criteria-store"
import type { CriteriaFilterRow, JsonSchemaObject } from "../types"
import { createInitialCriteriaRows } from "./create-initial-criteria-rows"
import { parseCriteriaSchema } from "./parse-criteria-schema"

/**
 * Binds a report's criteria grid to the shared draft store so any surface
 * (report page, Yula chat card) editing the same `scope` stays in sync.
 * Rows fall back to schema defaults until the user edits.
 */
export function useSharedCriteriaDraft(
  scope: string,
  schema: JsonSchemaObject
): {
  rows: CriteriaFilterRow[]
  setRows: (rows: CriteriaFilterRow[]) => void
} {
  const { rows, setRows } = useDraftCriteriaRows(scope)
  const fallbackRows = React.useMemo<CriteriaFilterRow[]>(
    () => createInitialCriteriaRows(parseCriteriaSchema(schema).fields),
    [schema]
  )
  return { rows: rows ?? fallbackRows, setRows }
}
