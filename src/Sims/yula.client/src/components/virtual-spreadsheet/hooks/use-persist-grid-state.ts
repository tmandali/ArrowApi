"use client";

import * as React from "react"
import type {
  ColumnAggregationConfig,
  ColumnSortConfigs,
  GridPersistedState,
} from "../types"

export interface PersistGridStateParams {
  effectiveStorageKey: string | undefined
  isStorageLoadedRef: React.MutableRefObject<boolean>
  colWidths: Record<string, string | number>
  activeColumnOrder: string[] | null | undefined
  activeHiddenColumns: string[]
  activePinnedColumns: string[]
  /** Varsayılan (ilk N kolon) pinned dizisi — "modified mı?" kontrolü için */
  defaultPinnedColumns: string[]
  pinnedColumns: string[] | undefined
  internalPinnedColumns: string[] | null
  activeAggregationConfigs: ColumnAggregationConfig
  showFooterRow?: boolean
  sortColumn?: string | null
  sortDirection?: "asc" | "desc" | null
  activeSortConfigs: ColumnSortConfigs
  activeSortColumn: string | null | undefined
}

/**
 * Kolon sırası, genişliği, gizlilik, sabitleme, özet, sıralama veya footer
 * durumları değiştiğinde 250ms debounce ile localStorage'a yazar. Hiçbir
 * özel değişiklik yoksa girdiyi tamamen temizler (varsayılan durum).
 */
export function usePersistGridState({
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
}: PersistGridStateParams): void {
  React.useEffect(() => {
    if (!isStorageLoadedRef.current || !effectiveStorageKey || typeof window === "undefined") {
      return
    }

    const timer = setTimeout(() => {
      const hasWidths = Object.keys(colWidths).length > 0
      const hasOrder = Boolean(activeColumnOrder && activeColumnOrder.length > 0)
      const hasHidden = activeHiddenColumns.length > 0
      const isPinnedModified =
        pinnedColumns !== undefined ||
        internalPinnedColumns !== null ||
        activePinnedColumns.length !== defaultPinnedColumns.length ||
        activePinnedColumns.some((col, idx) => col !== defaultPinnedColumns[idx])
      const hasPinned = isPinnedModified
      const hasAggregations = Object.keys(activeAggregationConfigs).length > 0
      const hasSortConfigs = Object.keys(activeSortConfigs).length > 0
      const hasSort = Boolean(sortColumn) || hasSortConfigs
      const hasFooter = Boolean(showFooterRow)

      if (!hasWidths && !hasOrder && !hasHidden && !hasPinned && !hasAggregations && !hasSort && !hasFooter) {
        try {
          localStorage.removeItem(effectiveStorageKey)
        } catch {}
        return
      }

      try {
        const data: GridPersistedState = {
          widths: hasWidths ? colWidths : undefined,
          order: hasOrder ? (activeColumnOrder ?? undefined) : undefined,
          hidden: hasHidden ? activeHiddenColumns : undefined,
          pinned: hasPinned ? activePinnedColumns : undefined,
          aggregations: hasAggregations ? activeAggregationConfigs : undefined,
          showFooter: hasFooter ? true : undefined,
          sortBy: hasSort ? (activeSortColumn ?? sortColumn ?? undefined) : undefined,
          sortDesc: hasSort ? (sortDirection === "desc") : undefined,
          sortConfigs: hasSortConfigs ? activeSortConfigs : undefined,
        }
        localStorage.setItem(effectiveStorageKey, JSON.stringify(data))
      } catch {
        // ignore quota errors
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [
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
  ])
}
