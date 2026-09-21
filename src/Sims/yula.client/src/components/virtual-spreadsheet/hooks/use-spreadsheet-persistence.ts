import { useColumnPersistence } from "./use-column-persistence"
import { usePersistGridState } from "./use-persist-grid-state"
import type { SpreadsheetColumn, ColumnAggregationConfig } from "../types"

export interface UseSpreadsheetPersistenceParams {
  effectiveStorageKey?: string
  columns: readonly SpreadsheetColumn[]
  onColumnOrderChange?: (order: string[]) => void
  onHiddenColumnsChange?: (hidden: string[]) => void
  onPinnedColumnsChange?: (pinned: string[]) => void
  onAggregationConfigsChange?: (configs: ColumnAggregationConfig) => void
  onSortSettingChange?: (column: string | null, descending: boolean) => void
  onSortConfigsChange?: (configs: Record<string, "asc" | "desc">) => void
  onToggleFooterRow?: (show: boolean) => void
  setInternalColumnOrder: (order: string[] | null) => void
  setInternalHiddenColumns: (hidden: string[]) => void
  setInternalPinnedColumnsRaw: (pinned: string[] | null) => void
  setInternalAggregationConfigs: (configs: ColumnAggregationConfig) => void
  applyStoredWidths: (widths: Record<string, string | number>) => void
  colWidths: Record<string, number | string>
  activeColumnOrder: string[] | null
  activeHiddenColumns: string[]
  activePinnedColumns: string[]
  defaultPinnedColumns: string[]
  pinnedColumns?: string[]
  internalPinnedColumns: string[] | null
  activeAggregationConfigs: ColumnAggregationConfig
  showFooterRow?: boolean
  sortColumn?: string | null
  sortDirection?: "asc" | "desc" | null
  activeSortConfigs: Record<string, "asc" | "desc">
  activeSortColumn: string | null
}

export function useSpreadsheetPersistence({
  effectiveStorageKey,
  columns,
  onColumnOrderChange,
  onHiddenColumnsChange,
  onPinnedColumnsChange,
  onAggregationConfigsChange,
  onSortSettingChange,
  onSortConfigsChange,
  onToggleFooterRow,
  setInternalColumnOrder,
  setInternalHiddenColumns,
  setInternalPinnedColumnsRaw,
  setInternalAggregationConfigs,
  applyStoredWidths,
  colWidths,
  activeColumnOrder,
  activeHiddenColumns,
  activePinnedColumns,
  defaultPinnedColumns,
  pinnedColumns,
  internalPinnedColumns,
  activeAggregationConfigs,
  showFooterRow,
  sortColumn,
  sortDirection,
  activeSortConfigs,
  activeSortColumn,
}: UseSpreadsheetPersistenceParams) {
  const { isStorageLoadedRef } = useColumnPersistence({
    effectiveStorageKey,
    columns,
    onColumnOrderChange,
    onHiddenColumnsChange,
    onPinnedColumnsChange,
    onAggregationConfigsChange,
    onSortSettingChange,
    onSortConfigsChange,
    onToggleFooterRow,
    onColumnOrderChangeInternal: setInternalColumnOrder,
    onHiddenColumnsChangeInternal: setInternalHiddenColumns,
    onPinnedColumnsChangeInternal: setInternalPinnedColumnsRaw,
    onAggregationConfigsChangeInternal: setInternalAggregationConfigs,
    onSortConfigsChangeInternal: () => {},
    onWidthsChangeInternal: applyStoredWidths,
  })

  usePersistGridState({
    effectiveStorageKey,
    isStorageLoadedRef,
    colWidths,
    activeColumnOrder,
    activeHiddenColumns,
    activePinnedColumns,
    defaultPinnedColumns,
    pinnedColumns,
    internalPinnedColumns,
    activeAggregationConfigs,
    showFooterRow,
    sortColumn,
    sortDirection,
    activeSortConfigs,
    activeSortColumn,
  })

  return { isStorageLoadedRef }
}
