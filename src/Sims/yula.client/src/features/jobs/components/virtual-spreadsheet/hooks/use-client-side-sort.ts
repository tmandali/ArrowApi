"use client";

import * as React from "react"
import type { ColumnSortConfigs, SpreadsheetColumn } from "../types"

export interface ClientSideSortParams {
  items: readonly unknown[]
  orderedColumns: readonly SpreadsheetColumn[]
  activeSortConfigs: ColumnSortConfigs
  disableSorting?: boolean
  /** Kontrollü sıralama (dış katman uyguluyorsa) iç sıralama pasif kalır */
  onSortChange?: (columnName: string, nextDirection: "asc" | "desc" | null) => void
  onSortConfigsChange?: (configs: ColumnSortConfigs, orderedColumnNames?: string[]) => void
}

export interface ClientSideSortReturn {
  displayItems: readonly unknown[]
}

/**
 * Kontrollü sıralama (dış katman/DuckDB SQL ORDER BY) uygulanmıyorsa
 * client-side bellek içi çoklu sıralamayı yürütür; `align === "right"`
 * kolonlar sayısal, geri kalanlar `tr` locale ile metin olarak sıralanır.
 */
export function useClientSideSort({
  items,
  orderedColumns,
  activeSortConfigs,
  disableSorting,
  onSortChange,
  onSortConfigsChange,
}: ClientSideSortParams): ClientSideSortReturn {
  const displayItems = React.useMemo(() => {
    if (onSortChange || onSortConfigsChange || disableSorting) {
      return items
    }
    const sortList = orderedColumns
      .filter((c) => activeSortConfigs[c.name])
      .map((c) => ({
        colName: c.name,
        dir: activeSortConfigs[c.name] === "asc" ? 1 : -1,
        isNum: c.align === "right",
      }))

    if (sortList.length === 0) return items

    return [...items].sort((a, b) => {
      const aObj = a as Record<string, unknown>
      const bObj = b as Record<string, unknown>

      for (const sortItem of sortList) {
        const aVal =
          aObj?.values && typeof aObj.values === "object"
            ? (aObj.values as Record<string, unknown>)[sortItem.colName]
            : aObj?.[sortItem.colName]
        const bVal =
          bObj?.values && typeof bObj.values === "object"
            ? (bObj.values as Record<string, unknown>)[sortItem.colName]
            : bObj?.[sortItem.colName]

        if (aVal == null && bVal == null) continue
        if (aVal == null) return 1
        if (bVal == null) return -1

        if (sortItem.isNum || typeof aVal === "number" || typeof bVal === "number") {
          const numA = Number(aVal)
          const numB = Number(bVal)
          if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
            return (numA - numB) * sortItem.dir
          }
        }

        const cmp = String(aVal).localeCompare(String(bVal), "tr", { numeric: true })
        if (cmp !== 0) {
          return cmp * sortItem.dir
        }
      }
      return 0
    })
  }, [items, onSortChange, onSortConfigsChange, disableSorting, activeSortConfigs, orderedColumns])

  return { displayItems }
}
