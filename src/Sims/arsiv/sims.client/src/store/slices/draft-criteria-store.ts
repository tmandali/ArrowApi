import { create } from "zustand"
import type { CriteriaFilterRow } from "@/features/report-criteria/types"

/**
 * Shared criteria draft scope. Any report can use its job/slug name as a
 * scope so every surface (Yula chat card, report page) binds to the same rows.
 */
export type DraftCriteriaScope = string

type DraftCriteriaState = {
  rowsByScope: Partial<Record<DraftCriteriaScope, CriteriaFilterRow[]>>
  setRows: (scope: DraftCriteriaScope, rows: CriteriaFilterRow[]) => void
  clearScope: (scope: DraftCriteriaScope) => void
}

export const useDraftCriteriaStore = create<DraftCriteriaState>()((set, get) => ({
  rowsByScope: {},
  setRows: (scope, rows) => {
    if (get().rowsByScope[scope] === rows) return
    set({ rowsByScope: { ...get().rowsByScope, [scope]: rows } })
  },
  clearScope: (scope) => {
    const rowsByScope = { ...get().rowsByScope }
    delete rowsByScope[scope]
    set({ rowsByScope })
  },
}))

/** Subscribes a surface to the shared criteria rows of one scope. */
export function useDraftCriteriaRows(
  scope: DraftCriteriaScope
): {
  rows: CriteriaFilterRow[] | undefined
  setRows: (rows: CriteriaFilterRow[]) => void
} {
  const rows = useDraftCriteriaStore((s) => s.rowsByScope[scope])
  const setRows = useDraftCriteriaStore((s) => s.setRows)
  return {
    rows,
    setRows: (next) => setRows(scope, next),
  }
}

