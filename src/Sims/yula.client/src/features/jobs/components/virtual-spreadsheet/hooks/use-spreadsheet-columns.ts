import * as React from "react"
import {
  type SpreadsheetColumn,
  type AggregationType,
  type ColumnAggregationConfig,
} from "../types"
import { getDefaultAggregationForColumn } from "../column-aggregations"

export interface UseSpreadsheetColumnsParams {
  columns: readonly SpreadsheetColumn[]
  pinnedColumnCount?: number
  pinnedColumns?: string[]
  onPinnedColumnsChange?: (pinned: string[]) => void
  columnOrder?: string[]
  onColumnOrderChange?: (order: string[]) => void
  hiddenColumns?: string[]
  onHiddenColumnsChange?: (hidden: string[]) => void
  aggregationConfigs?: ColumnAggregationConfig
  onAggregationConfigsChange?: (configs: ColumnAggregationConfig) => void
  defaultAggregationConfigs?: ColumnAggregationConfig
  sortColumn?: string | null
  activeSortConfigs?: Record<string, "asc" | "desc">
  showFooterRow?: boolean
  onToggleFooterRow?: (show: boolean) => void
  onSortConfigsChange?: (configs: Record<string, "asc" | "desc">) => void
  onSortSettingChange?: (column: string | null, descending: boolean) => void
  resetColWidths: () => void
  colWidths: Record<string, number | string>
  getColWidth: (col: SpreadsheetColumn) => number | string
  effectiveStorageKey?: string
}

export function useSpreadsheetColumns({
  columns,
  pinnedColumnCount = 1,
  pinnedColumns,
  onPinnedColumnsChange,
  columnOrder,
  onColumnOrderChange,
  hiddenColumns,
  onHiddenColumnsChange,
  aggregationConfigs,
  onAggregationConfigsChange,
  defaultAggregationConfigs,
  sortColumn,
  activeSortConfigs,
  showFooterRow,
  onToggleFooterRow,
  onSortConfigsChange,
  onSortSettingChange,
  resetColWidths,
  colWidths,
  getColWidth,
  effectiveStorageKey,
}: UseSpreadsheetColumnsParams) {
  // ── Pinned Columns ───────────────────────────────────────────────────
  const [internalPinnedColumns, setInternalPinnedColumnsRaw] =
    React.useState<string[] | null>(null)

  const setInternalPinnedColumns = React.useCallback(
    (pinned: string[] | null) => {
      if (onPinnedColumnsChange && pinned !== null) {
        onPinnedColumnsChange(pinned)
      } else {
        setInternalPinnedColumnsRaw(pinned)
      }
    },
    [onPinnedColumnsChange]
  )

  const defaultPinnedColumns = React.useMemo(() => {
    const count = Math.max(0, pinnedColumnCount)
    return columns.slice(0, count).map((c) => c.name)
  }, [columns, pinnedColumnCount])

  const activePinnedColumns = React.useMemo(() => {
    if (pinnedColumns !== undefined) return pinnedColumns
    if (internalPinnedColumns !== null) return internalPinnedColumns
    return defaultPinnedColumns
  }, [pinnedColumns, internalPinnedColumns, defaultPinnedColumns])

  const pinnedSet = React.useMemo(
    () => new Set(activePinnedColumns),
    [activePinnedColumns]
  )

  // ── Column Order ─────────────────────────────────────────────────────
  const [internalColumnOrder, setInternalColumnOrder] =
    React.useState<string[] | null>(null)

  const activeColumnOrder = columnOrder ?? internalColumnOrder

  // ── Aggregations ─────────────────────────────────────────────────────
  const initialAggregations = React.useMemo(() => {
    const map: ColumnAggregationConfig = { ...(defaultAggregationConfigs || {}) }
    for (const col of columns) {
      if (!map[col.name]) {
        map[col.name] = getDefaultAggregationForColumn(col)
      }
    }
    return map
  }, [columns, defaultAggregationConfigs])

  const [internalAggregationConfigs, setInternalAggregationConfigs] =
    React.useState<ColumnAggregationConfig>(initialAggregations)

  const activeAggregationConfigs = React.useMemo(() => {
    if (aggregationConfigs !== undefined) return aggregationConfigs
    return internalAggregationConfigs
  }, [aggregationConfigs, internalAggregationConfigs])

  const handleAggregationChange = React.useCallback(
    (columnName: string, nextType: AggregationType) => {
      const next = { ...activeAggregationConfigs, [columnName]: nextType }
      if (onAggregationConfigsChange) {
        onAggregationConfigsChange(next)
      } else {
        setInternalAggregationConfigs(next)
      }
    },
    [activeAggregationConfigs, onAggregationConfigsChange]
  )

  // ── Ordered Columns (pinned on left) ─────────────────────────────────
  const orderedColumns = React.useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.name, c]))
    const baseCols: SpreadsheetColumn[] = []

    if (activeColumnOrder && activeColumnOrder.length > 0) {
      for (const name of activeColumnOrder) {
        const col = colMap.get(name)
        if (col) {
          baseCols.push(col)
          colMap.delete(name)
        }
      }
      for (const col of colMap.values()) {
        baseCols.push(col)
      }
    } else {
      baseCols.push(...columns)
    }

    if (pinnedSet.size === 0) return baseCols

    const pinned = baseCols.filter((c) => pinnedSet.has(c.name))
    const unpinned = baseCols.filter((c) => !pinnedSet.has(c.name))
    return [...pinned, ...unpinned]
  }, [columns, activeColumnOrder, pinnedSet])

  // ── Hidden Columns ───────────────────────────────────────────────────
  const [internalHiddenColumns, setInternalHiddenColumns] = React.useState<string[]>([])

  const activeHiddenColumns = hiddenColumns ?? internalHiddenColumns
  const hiddenSet = React.useMemo(
    () => new Set(activeHiddenColumns),
    [activeHiddenColumns]
  )

  const visibleColumns = React.useMemo(() => {
    if (hiddenSet.size === 0) return orderedColumns
    const filtered = orderedColumns.filter((col) => !hiddenSet.has(col.name))
    return filtered.length > 0 ? filtered : orderedColumns
  }, [orderedColumns, hiddenSet])

  const visiblePinnedCount = React.useMemo(() => {
    return visibleColumns.filter((c) => pinnedSet.has(c.name)).length
  }, [visibleColumns, pinnedSet])

  const effectivePinnedCount = Math.min(
    visiblePinnedCount,
    visibleColumns.length > 1 ? visibleColumns.length - 1 : 0
  )

  const hiddenColumnsCount = hiddenSet.size

  const toggleColumnVisibility = React.useCallback(
    (columnName: string) => {
      let nextHidden: string[]
      if (hiddenSet.has(columnName)) {
        nextHidden = activeHiddenColumns.filter((name) => name !== columnName)
      } else {
        if (visibleColumns.length <= 1) return
        nextHidden = [...activeHiddenColumns, columnName]
      }

      if (onHiddenColumnsChange) {
        onHiddenColumnsChange(nextHidden)
      } else {
        setInternalHiddenColumns(nextHidden)
      }
    },
    [hiddenSet, activeHiddenColumns, visibleColumns.length, onHiddenColumnsChange]
  )

  const toggleColumnPin = React.useCallback(
    (columnName: string) => {
      const isCurrentlyPinned = pinnedSet.has(columnName)
      let nextPinned: string[]
      let nextOrder: string[]

      const currentOrder = orderedColumns.map((c) => c.name)

      if (isCurrentlyPinned) {
        nextPinned = activePinnedColumns.filter((name) => name !== columnName)
        const pinnedSetNext = new Set(nextPinned)
        const pinnedCols = currentOrder.filter((name) => pinnedSetNext.has(name))
        const unpinnedCols = currentOrder.filter((name) => !pinnedSetNext.has(name))
        nextOrder = [...pinnedCols, ...unpinnedCols]
      } else {
        const visiblePinned = visibleColumns.filter((c) => pinnedSet.has(c.name))
        if (visiblePinned.length >= visibleColumns.length - 1) {
          return
        }

        nextPinned = [...activePinnedColumns, columnName]
        const pinnedSetNext = new Set(nextPinned)
        const pinnedCols = currentOrder.filter((name) => pinnedSetNext.has(name))
        const unpinnedCols = currentOrder.filter((name) => !pinnedSetNext.has(name))
        nextOrder = [...pinnedCols, ...unpinnedCols]
      }

      if (onPinnedColumnsChange) {
        onPinnedColumnsChange(nextPinned)
      } else {
        setInternalPinnedColumnsRaw(nextPinned)
      }

      if (onColumnOrderChange) {
        onColumnOrderChange(nextOrder)
      } else {
        setInternalColumnOrder(nextOrder)
      }
    },
    [
      pinnedSet,
      activePinnedColumns,
      orderedColumns,
      visibleColumns,
      onPinnedColumnsChange,
      onColumnOrderChange,
      setInternalPinnedColumnsRaw,
    ]
  )

  const handleResetColumns = React.useCallback(
    (onClearSorts?: () => void) => {
      if (onHiddenColumnsChange) {
        onHiddenColumnsChange([])
      } else {
        setInternalHiddenColumns([])
      }
      if (onColumnOrderChange) {
        onColumnOrderChange([])
      } else {
        setInternalColumnOrder(null)
      }
      if (onPinnedColumnsChange) {
        onPinnedColumnsChange(defaultPinnedColumns)
      } else {
        setInternalPinnedColumnsRaw(null)
      }
      if (onSortConfigsChange) {
        onSortConfigsChange({})
      }
      onClearSorts?.()
      setInternalColumnOrder(null)
    if (onSortSettingChange) {
      onSortSettingChange(null, false)
    }
    resetColWidths()
    if (onToggleFooterRow) {
      onToggleFooterRow(false)
    }
    if (effectiveStorageKey && typeof window !== "undefined") {
      try {
        localStorage.removeItem(effectiveStorageKey)
      } catch {}
    }
  }, [
    onHiddenColumnsChange,
    onColumnOrderChange,
    onPinnedColumnsChange,
    onSortConfigsChange,
    onSortSettingChange,
    onToggleFooterRow,
    defaultPinnedColumns,
    resetColWidths,
    effectiveStorageKey,
  ])

  const canResetColumns = React.useMemo(() => {
    const isPinnedModified =
      (pinnedColumns !== undefined &&
        (pinnedColumns.length !== defaultPinnedColumns.length ||
          pinnedColumns.some((c, i) => c !== defaultPinnedColumns[i]))) ||
      (internalPinnedColumns !== null &&
        (internalPinnedColumns.length !== defaultPinnedColumns.length ||
          internalPinnedColumns.some((c, i) => c !== defaultPinnedColumns[i]))) ||
      activePinnedColumns.length !== defaultPinnedColumns.length ||
      activePinnedColumns.some((c, i) => c !== defaultPinnedColumns[i])
    const hasSort =
      Boolean(sortColumn) ||
      (activeSortConfigs ? Object.keys(activeSortConfigs).length > 0 : false)
    const hasFooter = Boolean(showFooterRow)

    return (
      hiddenColumnsCount > 0 ||
      Boolean(activeColumnOrder && activeColumnOrder.length > 0) ||
      Object.keys(colWidths).length > 0 ||
      isPinnedModified ||
      hasSort ||
      hasFooter
    )
  }, [
    hiddenColumnsCount,
    activeColumnOrder,
    colWidths,
    pinnedColumns,
    internalPinnedColumns,
    activePinnedColumns,
    defaultPinnedColumns,
    sortColumn,
    activeSortConfigs,
    showFooterRow,
  ])

  const totalTableWidth = React.useMemo(() => {
    return visibleColumns.reduce((sum, col) => {
      const w = getColWidth(col)
      if (typeof w === "number") return sum + w
      if (typeof w === "string" && w.endsWith("px")) return sum + parseFloat(w)
      if (typeof w === "string" && w.endsWith("%")) return sum + 110
      return sum + 100
    }, 0)
  }, [visibleColumns, getColWidth])

  const getStickyLeftOffset = React.useCallback(
    (colIndex: number) => {
      if (colIndex >= effectivePinnedCount) return undefined
      let left = 0
      for (let i = 0; i < colIndex; i++) {
        const w = getColWidth(visibleColumns[i])
        left += typeof w === "number" ? w : parseFloat(String(w)) || 100
      }
      return left
    },
    [effectivePinnedCount, visibleColumns, getColWidth]
  )

  return {
    orderedColumns,
    visibleColumns,
    pinnedSet,
    hiddenSet,
    activePinnedColumns,
    defaultPinnedColumns,
    internalPinnedColumns,
    setInternalPinnedColumns,
    setInternalPinnedColumnsRaw,
    activeColumnOrder,
    internalColumnOrder,
    setInternalColumnOrder,
    activeHiddenColumns,
    internalHiddenColumns,
    setInternalHiddenColumns,
    activeAggregationConfigs,
    internalAggregationConfigs,
    setInternalAggregationConfigs,
    effectivePinnedCount,
    hiddenColumnsCount,
    handleAggregationChange,
    toggleColumnVisibility,
    toggleColumnPin,
    handleResetColumns,
    canResetColumns,
    totalTableWidth,
    getStickyLeftOffset,
  }
}
