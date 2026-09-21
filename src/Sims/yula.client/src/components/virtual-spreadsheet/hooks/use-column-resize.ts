"use client";

import * as React from "react"
import {
  MIN_COL_WIDTH,
  type SpreadsheetColumn,
} from "../types"
import { calculateColumnAutoFitWidth, getDefaultColumnWidth } from "../column-sizing"

export interface ColumnResizeParams {
  initialColWidths?: Record<string, string | number>
  /** Auto-fit sırasında örneklenmek üzere aktif satırlar */
  displayItems: readonly unknown[]
}

export interface ColumnResizeReturn {
  colWidths: Record<string, string | number>
  getColWidth: (col: SpreadsheetColumn) => number | string
  resetColWidths: () => void
  /** localStorage'dan okunan özel genişlikleri state'e yazar (persistence hook'u çağırmalı) */
  applyStoredWidths: (widths: Record<string, string | number>) => void
  /** Render edilmiş header `<th>` üzerinde çalışacak resize handle handler'ları */
  handleResizeStart: (event: React.PointerEvent, col: SpreadsheetColumn) => void
  handleResizeMove: (event: React.PointerEvent) => void
  handleResizeEnd: (event: React.PointerEvent) => void
  /** Çift tıklama / auto-fit: içeriğe ve başlığa göre en uygun genişliğe otomatik sığdırır */
  handleAutoFit: (event: React.MouseEvent | React.PointerEvent, col: SpreadsheetColumn) => void
  /** Dış katmanlardan ref'lere erişim (resize/drag çakışma kilidi) */
  refs: {
    isResizingRef: React.MutableRefObject<boolean>
    resizeRef: React.MutableRefObject<{
      startX: number
      startWidth: number
      name: string
      moved?: boolean
    } | null>
  }
}

/**
 * Kolon genişlik state'i, pointer tabanlı resize handle mantığı ve çift
 * tıklamada Canvas 2D ile reflow-free auto-fit hesaplamasını kapsüller.
 */
export function useColumnResize({
  initialColWidths,
  displayItems,
}: ColumnResizeParams): ColumnResizeReturn {
  const [colWidths, setColWidths] = React.useState<Record<string, string | number>>({})
  const resizeRef = React.useRef<{
    startX: number
    startWidth: number
    name: string
    moved?: boolean
  } | null>(null)
  const isResizingRef = React.useRef(false)
  const lastSeparatorClickRef = React.useRef<{ time: number; colName: string }>({
    time: 0,
    colName: "",
  })

  // Başlangıç genişlikleri değişince sütun genişliklerini senkronize et
  const initialWidthsKey = React.useMemo(
    () => JSON.stringify(initialColWidths ?? null),
    [initialColWidths]
  )
  const [syncedInitialWidthsKey, setSyncedInitialWidthsKey] = React.useState(initialWidthsKey)
  if (syncedInitialWidthsKey !== initialWidthsKey) {
    setSyncedInitialWidthsKey(initialWidthsKey)
    setColWidths(initialColWidths ?? {})
  }

  const getColWidth = React.useCallback(
    (col: SpreadsheetColumn): number | string => {
      if (colWidths[col.name] !== undefined) return colWidths[col.name]!
      if (initialColWidths?.[col.name] !== undefined) return initialColWidths[col.name]!
      return getDefaultColumnWidth(col)
    },
    [colWidths, initialColWidths]
  )

  const resetColWidths = React.useCallback(() => {
    setColWidths(initialColWidths ?? {})
  }, [initialColWidths])

  const applyStoredWidths = React.useCallback((widths: Record<string, string | number>) => {
    setColWidths(widths)
  }, [])

  /**
   * Çift tıklamayla kolonu içeriğe ve başlığa göre en uygun genişliğe otomatik sığdırır.
   */
  const handleAutoFit = React.useCallback(
    (event: React.MouseEvent | React.PointerEvent, col: SpreadsheetColumn) => {
      event.preventDefault()
      event.stopPropagation()
      const autoWidth = calculateColumnAutoFitWidth(col, displayItems as readonly Record<string, unknown>[])
      setColWidths((prev) => ({ ...prev, [col.name]: autoWidth }))
    },
    [displayItems]
  )

  const handleResizeStart = React.useCallback(
    (event: React.PointerEvent, col: SpreadsheetColumn) => {
      if (event.button !== 0) return
      event.stopPropagation()

      // Çift tıklama algılama (350ms penceresi) — çift tıklamada resize ve sürükleme başlatılmaz
      const now = Date.now()
      if (
        lastSeparatorClickRef.current.colName === col.name &&
        now - lastSeparatorClickRef.current.time < 350
      ) {
        lastSeparatorClickRef.current = { time: 0, colName: "" }
        resizeRef.current = null
        isResizingRef.current = false
        handleAutoFit(event, col)
        return
      }
      lastSeparatorClickRef.current = { time: now, colName: col.name }

      isResizingRef.current = true
      const th = (event.currentTarget as HTMLElement).closest("th")
      const fallbackW = typeof getColWidth(col) === "number" ? (getColWidth(col) as number) : 100
      const startWidth = th?.getBoundingClientRect().width || fallbackW
      resizeRef.current = {
        startX: event.clientX,
        startWidth,
        name: col.name,
        moved: false,
      }
      const target = event.currentTarget as HTMLElement
      if (target.hasPointerCapture(event.pointerId)) return
      target.setPointerCapture(event.pointerId)
    },
    [getColWidth, handleAutoFit]
  )

  const handleResizeMove = React.useCallback((event: React.PointerEvent) => {
    const ref = resizeRef.current
    if (!ref) return
    const delta = event.clientX - ref.startX
    // 3px altındaki mikro titreşimleri yok say — böylece çift tıkla otomatik sığdırma temiz çalışsın
    if (!ref.moved && Math.abs(delta) < 3) return
    ref.moved = true
    const width = Math.max(MIN_COL_WIDTH, ref.startWidth + delta)
    setColWidths((prev) => ({ ...prev, [ref.name]: Math.round(width) }))
  }, [])

  const handleResizeEnd = React.useCallback((event: React.PointerEvent) => {
    const ref = resizeRef.current
    if (!ref) return
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    resizeRef.current = null
    setTimeout(() => {
      isResizingRef.current = false
    }, 150)
  }, [])

  return {
    colWidths,
    getColWidth,
    resetColWidths,
    applyStoredWidths,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleAutoFit,
    refs: { isResizingRef, resizeRef },
  }
}
