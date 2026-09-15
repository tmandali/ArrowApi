"use client";

import * as React from "react"
import type {
  ColumnAggregationConfig,
  ColumnSortConfigs,
  GridPersistedState,
} from "../types"

export interface ColumnPersistenceParams {
  effectiveStorageKey: string | undefined
  columns: readonly { name: string }[]
  onColumnOrderChange?: (order: string[]) => void
  onHiddenColumnsChange?: (hidden: string[]) => void
  onPinnedColumnsChange?: (pinned: string[]) => void
  onAggregationConfigsChange?: (configs: ColumnAggregationConfig) => void
  onSortSettingChange?: (sortBy: string | null, sortDesc: boolean) => void
  onSortConfigsChange?: (configs: ColumnSortConfigs) => void
  onToggleFooterRow?: (show: boolean) => void
  /** Kontrollü setter'ı tanımlı değilse iç state'e yazılır */
  onColumnOrderChangeInternal: (order: string[]) => void
  onHiddenColumnsChangeInternal: (hidden: string[]) => void
  onPinnedColumnsChangeInternal: (pinned: string[]) => void
  onAggregationConfigsChangeInternal: (configs: ColumnAggregationConfig) => void
  onSortConfigsChangeInternal: (configs: ColumnSortConfigs) => void
  /** LocalStorage'da kayıtlı özel genişlikleri colWidths state'ine yazar */
  onWidthsChangeInternal?: (widths: Record<string, string | number>) => void
}

export interface ColumnPersistenceReturn {
  isStorageLoadedRef: React.MutableRefObject<boolean>
  /** storageKey değişince storage yüklemeyi sıfırlar (ana bileşen çağırmalı). */
  resetStorageLoaded: () => void
}

/**
 * Sayfa açıldığında veya kolonlar yüklendiğinde localStorage'dan grid
 * konfigürasyonunu (sıra, gizli, sabitlenmiş, özet, sıralama, footer) geri
 * yükler. Geri yükleme tek seferlik yapılmış sayılır.
 *
 * Kontrollü (dışarıdan yönetilen) değerler `onXxxChange` callback'lerine,
 * kontrolsüz (iç state'e düşen) değerler `onXxxChangeInternal` setter'larına
 * yazılır — böylece ana bileşendeki "controlled ?? internal" deseni
 * aynen korunur.
 */
export function useColumnPersistence({
  effectiveStorageKey,
  columns,
  onColumnOrderChange,
  onHiddenColumnsChange,
  onPinnedColumnsChange,
  onAggregationConfigsChange,
  onSortSettingChange,
  onSortConfigsChange,
  onToggleFooterRow,
  onColumnOrderChangeInternal,
  onHiddenColumnsChangeInternal,
  onPinnedColumnsChangeInternal,
  onAggregationConfigsChangeInternal,
  onSortConfigsChangeInternal,
  onWidthsChangeInternal,
}: ColumnPersistenceParams): ColumnPersistenceReturn {
  const isStorageLoadedRef = React.useRef(false)

  const resetStorageLoaded = React.useCallback(() => {
    isStorageLoadedRef.current = false
  }, [])

  React.useEffect(() => {
    if (!effectiveStorageKey || typeof window === "undefined" || columns.length === 0) {
      return
    }
    if (isStorageLoadedRef.current) return

    try {
      const raw = localStorage.getItem(effectiveStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as GridPersistedState
        if (parsed) {
          const rawWidths = parsed.widths || (parsed as { colWidths?: Record<string, string | number> }).colWidths
          if (rawWidths && typeof rawWidths === "object") {
            onWidthsChangeInternal?.(rawWidths)
          }

          const rawOrder = parsed.order || (parsed as { columnOrder?: string[] }).columnOrder
          if (Array.isArray(rawOrder) && rawOrder.length > 0) {
            const valid = rawOrder.filter((name) =>
              columns.some((c) => c.name === name)
            )
            if (valid.length > 0) {
              const existingSet = new Set(valid)
              const remaining = columns.filter((c) => !existingSet.has(c.name)).map((c) => c.name)
              const fullOrder = [...valid, ...remaining]
              if (onColumnOrderChange) {
                onColumnOrderChange(fullOrder)
              } else {
                onColumnOrderChangeInternal(fullOrder)
              }
            }
          }
          const rawHidden = parsed.hidden || (parsed as { hiddenColumns?: string[] }).hiddenColumns
          if (Array.isArray(rawHidden)) {
            const valid = rawHidden.filter((name) =>
              columns.some((c) => c.name === name)
            )
            if (valid.length < columns.length) {
              if (onHiddenColumnsChange) {
                onHiddenColumnsChange(valid)
              } else {
                onHiddenColumnsChangeInternal(valid)
              }
            }
          }
          const rawPinned =
            parsed.pinned !== undefined
              ? parsed.pinned
              : (parsed as { pinnedColumns?: string[] }).pinnedColumns
          if (Array.isArray(rawPinned)) {
            const valid = rawPinned.filter((name) =>
              columns.some((c) => c.name === name)
            )
            if (onPinnedColumnsChange) {
              onPinnedColumnsChange(valid)
            } else {
              onPinnedColumnsChangeInternal(valid)
            }
          }
          if (parsed.aggregations && typeof parsed.aggregations === "object") {
            if (onAggregationConfigsChange) {
              onAggregationConfigsChange(parsed.aggregations)
            } else {
              onAggregationConfigsChangeInternal(parsed.aggregations)
            }
          }
          if (parsed.sortConfigs && typeof parsed.sortConfigs === "object") {
            const validConfigs: ColumnSortConfigs = {}
            for (const [col, dir] of Object.entries(parsed.sortConfigs)) {
              if (
                columns.some((c) => c.name === col) &&
                (dir === "asc" || dir === "desc")
              ) {
                validConfigs[col] = dir
              }
            }
            onSortConfigsChangeInternal(validConfigs)
            if (onSortConfigsChange) {
              onSortConfigsChange(validConfigs)
            }
          } else if (parsed.sortBy !== undefined) {
            const colExists = !parsed.sortBy || columns.some((c) => c.name === parsed.sortBy)
            if (colExists && onSortSettingChange) {
              onSortSettingChange(parsed.sortBy, Boolean(parsed.sortDesc))
            } else if (colExists && onSortConfigsChange && parsed.sortBy) {
              onSortConfigsChange({ [parsed.sortBy]: parsed.sortDesc ? "desc" : "asc" })
            }
          }
          if (parsed.showFooter !== undefined && onToggleFooterRow) {
            onToggleFooterRow(Boolean(parsed.showFooter))
          }
        }
      }
    } catch {
      // ignore parse or quota errors
    }
    isStorageLoadedRef.current = true
  }, [
    effectiveStorageKey,
    columns,
    onColumnOrderChange,
    onHiddenColumnsChange,
    onPinnedColumnsChange,
    onAggregationConfigsChange,
    onSortSettingChange,
    onSortConfigsChange,
    onToggleFooterRow,
    onColumnOrderChangeInternal,
    onHiddenColumnsChangeInternal,
    onPinnedColumnsChangeInternal,
    onAggregationConfigsChangeInternal,
    onSortConfigsChangeInternal,
    onWidthsChangeInternal,
  ])

  return { isStorageLoadedRef, resetStorageLoaded }
}
