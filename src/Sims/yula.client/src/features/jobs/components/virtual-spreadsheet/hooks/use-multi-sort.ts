"use client";

import * as React from "react"
import type { ColumnSortConfigs, SpreadsheetColumn } from "../types"

export interface MultiSortParams {
  orderedColumns: readonly SpreadsheetColumn[]
  sortColumn?: string | null
  sortDirection?: "asc" | "desc" | null
  sortConfigs?: ColumnSortConfigs
  onSortChange?: (columnName: string, nextDirection: "asc" | "desc" | null) => void
  onSortConfigsChange?: (configs: ColumnSortConfigs, orderedColumnNames?: string[]) => void
  disableSorting?: boolean
  /** D&D/resize sonucunda tetiklenen "sahte tıklama"ları yutmak için ref'ler */
  interactionGuards: {
    isDraggingRef: React.MutableRefObject<boolean>
    isResizingRef: React.MutableRefObject<boolean>
    resizeRef: React.MutableRefObject<{ startX: number; startWidth: number; name: string; moved?: boolean } | null>
  }
}

export interface MultiSortReturn {
  activeSortConfigs: ColumnSortConfigs
  activeSortColumn: string | null
  activeSortDirection: "asc" | "desc" | null
  handleHeaderClearSorts: () => void
  handleHeaderClick: (col: SpreadsheetColumn) => void
  /** Kontrollü modda kullanılmadan (uncontrolled) iç state'e erişim */
  getInternalSortConfigs: () => ColumnSortConfigs
}

/**
 * Çoklu kolon sıralama state'ini (controlled ?? internal ?? legacy
 * tekli sort props fallback) ve header tıklama döngüsünü yönetir.
 */
export function useMultiSort({
  orderedColumns,
  sortColumn,
  sortDirection,
  sortConfigs,
  onSortChange,
  onSortConfigsChange,
  disableSorting,
  interactionGuards,
}: MultiSortParams): MultiSortReturn {
  const [internalSort, setInternalSort] = React.useState<{
    column: string | null
    direction: "asc" | "desc" | null
  }>({
    column: null,
    direction: null,
  })
  const [internalSortConfigs, setInternalSortConfigs] = React.useState<ColumnSortConfigs>({})

  const activeSortConfigs = React.useMemo<ColumnSortConfigs>(() => {
    if (sortConfigs !== undefined) return sortConfigs
    if (Object.keys(internalSortConfigs).length > 0) return internalSortConfigs
    // Fallback tekli sort props/state
    if (sortColumn && sortDirection) {
      return { [sortColumn]: sortDirection }
    }
    if (internalSort.column && internalSort.direction) {
      return { [internalSort.column]: internalSort.direction }
    }
    return {}
  }, [sortConfigs, internalSortConfigs, sortColumn, sortDirection, internalSort])

  const activeSortColumn = React.useMemo(() => {
    if (sortColumn !== undefined) return sortColumn
    const sortedCols = orderedColumns.map((c) => c.name).filter((name) => activeSortConfigs[name])
    return sortedCols.length > 0 ? sortedCols[0] : internalSort.column
  }, [sortColumn, orderedColumns, activeSortConfigs, internalSort.column])

  const activeSortDirection = React.useMemo(() => {
    if (sortDirection !== undefined) return sortDirection
    if (activeSortColumn && activeSortConfigs[activeSortColumn]) {
      return activeSortConfigs[activeSortColumn]
    }
    return internalSort.direction
  }, [sortDirection, activeSortColumn, activeSortConfigs, internalSort.direction])

  const handleHeaderClick = React.useCallback(
    (col: SpreadsheetColumn) => {
      // Sürükleme veya boyutlandırma işlemi yeni bittiyse tıklama (sıralama) tetikleme
      if (
        interactionGuards.isDraggingRef.current ||
        interactionGuards.isResizingRef.current ||
        interactionGuards.resizeRef.current !== null
      ) return
      if (disableSorting || col.sortable === false) return

      const currentDir = activeSortConfigs[col.name]
      let nextDir: "asc" | "desc" | null = "asc"
      if (currentDir === "asc") {
        nextDir = "desc"
      } else if (currentDir === "desc") {
        nextDir = null
      } else {
        nextDir = "asc"
      }

      const nextConfigs: ColumnSortConfigs = { ...activeSortConfigs }
      if (nextDir) {
        nextConfigs[col.name] = nextDir
      } else {
        delete nextConfigs[col.name]
      }

      const orderedColNames = orderedColumns.map((c) => c.name)

      if (onSortConfigsChange) {
        onSortConfigsChange(nextConfigs, orderedColNames)
      } else {
        setInternalSortConfigs(nextConfigs)
        if (onSortChange) {
          const firstSorted = orderedColNames.find((c) => nextConfigs[c])
          onSortChange(firstSorted ?? col.name, firstSorted ? nextConfigs[firstSorted] : null)
        } else {
          setInternalSort({
            column: nextDir ? col.name : null,
            direction: nextDir,
          })
        }
      }
    },
    [
      disableSorting,
      activeSortConfigs,
      orderedColumns,
      onSortConfigsChange,
      onSortChange,
      interactionGuards,
    ]
  )

  const internalSortConfigsRef = React.useRef(internalSortConfigs)
  React.useEffect(() => {
    internalSortConfigsRef.current = internalSortConfigs
  }, [internalSortConfigs])

  const getInternalSortConfigs = React.useCallback(
    () => internalSortConfigsRef.current,
    []
  )

  const handleHeaderClearSorts = React.useCallback(() => {
    setInternalSortConfigs({})
    setInternalSort({ column: null, direction: null })
  }, [])

  return {
    activeSortConfigs,
    activeSortColumn,
    activeSortDirection,
    handleHeaderClick,
    handleHeaderClearSorts,
    getInternalSortConfigs,
  }
}
