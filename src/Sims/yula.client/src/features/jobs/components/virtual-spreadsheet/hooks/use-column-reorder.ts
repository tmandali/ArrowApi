"use client";

import * as React from "react"
import type { ColumnSortConfigs, SpreadsheetColumn } from "../types"

export interface ColumnReorderParams {
  disableColumnReorder?: boolean
  orderedColumns: readonly SpreadsheetColumn[]
  visibleColumns: readonly SpreadsheetColumn[]
  pinnedSet: Set<string>
  effectivePinnedCount: number
  activePinnedColumns: string[]
  onPinnedColumnsChange?: (pinned: string[]) => void
  onColumnOrderChange?: (order: string[]) => void
  /**
   * D&D sonucu kolon sırası değiştiğinde çoklu sıralama "soldan sağa
   * öncelik" kuralını senkron tutmak için `onSortConfigsChange` ve mevcut
   * aktif konfigürasyon birlikte iletilir; bu hook sadece sıralamayı
   * tetikler, aktif config'i ana bileşen hesaplar (hook çağrısından önce).
   */
  onSortConfigsChange?: (configs: ColumnSortConfigs, orderedColumnNames?: string[]) => void
  /** D&D sırasında çoklu sıralama aktifse senkronize edilecek aktif config (ana bileşen) */
  getActiveSortConfigs: () => ColumnSortConfigs
  setInternalPinnedColumns: (pinned: string[] | null) => void
  setInternalColumnOrder: (order: string[] | null) => void
  /** Resize handle aktifken D&D'ı kesinlikle engellemek için */
  resizeGuard: {
    isResizingRef: React.MutableRefObject<boolean>
    resizeRef: React.MutableRefObject<{ startX: number; startWidth: number; name: string; moved?: boolean } | null>
  }
}

export interface ColumnReorderReturn {
  draggedColName: string | null
  dropTarget: { name: string; position: "before" | "after" } | null
  hoveredSeparatorCol: string | null
  isDraggingRef: React.MutableRefObject<boolean>
  isHoveringSeparatorRef: React.MutableRefObject<boolean>
  setHoveredSeparatorCol: (col: string | null) => void
  handleDragStart: (event: React.DragEvent, col: SpreadsheetColumn) => void
  handleDragOver: (event: React.DragEvent, col: SpreadsheetColumn) => void
  handleDragLeave: (event: React.DragEvent, col: SpreadsheetColumn) => void
  handleDrop: (event: React.DragEvent, col: SpreadsheetColumn) => void
  handleDragEnd: () => void
  /** Menü içi ▲/▼ butonları için tek-adımlı taşıma */
  moveColumn: (columnName: string, direction: "up" | "down") => void
  /** Hem tablo başlığı D&D hem menü içi taşıma bu tek fonksiyonu paylaşır */
  executeColumnReorder: (draggedName: string, targetName: string, position?: "before" | "after") => void
}

/**
 * HTML5 Drag & Drop tabanlı kolon yeniden sıralama, otomatik pin/unpin
 * dönüşümleri ve (çoklu sıralama aktifse) "soldan sağa öncelik" kuralının
 * kolon sırasıyla senkron tutulmasını kapsüller.
 */
export function useColumnReorder({
  disableColumnReorder,
  orderedColumns,
  visibleColumns,
  pinnedSet,
  effectivePinnedCount,
  activePinnedColumns,
  onPinnedColumnsChange,
  onColumnOrderChange,
  onSortConfigsChange,
  getActiveSortConfigs,
  setInternalPinnedColumns,
  setInternalColumnOrder,
  resizeGuard,
}: ColumnReorderParams): ColumnReorderReturn {
  // Sürükle - bırak görsel durumları
  const [draggedColName, setDraggedColName] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    name: string
    position: "before" | "after"
  } | null>(null)
  const isDraggingRef = React.useRef(false)
  const isHoveringSeparatorRef = React.useRef(false)
  const [hoveredSeparatorCol, setHoveredSeparatorCol] = React.useState<string | null>(null)

  const handleDragStart = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      // Yeniden boyutlandırma sırasında veya ayırıcı çizgiden sürüklemeyi kesinlikle engelle
      if (
        disableColumnReorder ||
        resizeGuard.resizeRef.current !== null ||
        resizeGuard.isResizingRef.current ||
        isHoveringSeparatorRef.current
      ) {
        event.preventDefault()
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('[role="separator"]')) {
        event.preventDefault()
        return
      }

      isDraggingRef.current = true
      event.dataTransfer.setData("text/plain", col.name)
      event.dataTransfer.effectAllowed = "move"
      setDraggedColName(col.name)
    },
    [disableColumnReorder, resizeGuard]
  )

  const handleDragOver = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      if (resizeGuard.resizeRef.current !== null || resizeGuard.isResizingRef.current) return
      if (!draggedColName || draggedColName === col.name) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"

      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      const position: "before" | "after" = event.clientX < midpoint ? "before" : "after"

      setDropTarget((prev) => {
        if (prev?.name === col.name && prev?.position === position) return prev
        return { name: col.name, position }
      })
    },
    [draggedColName, resizeGuard]
  )

  const handleDragLeave = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      const related = event.relatedTarget as HTMLElement | null
      if (!event.currentTarget.contains(related)) {
        setDropTarget((prev) => (prev?.name === col.name ? null : prev))
      }
    },
    []
  )

  const executeColumnReorder = React.useCallback(
    (draggedName: string, targetName: string, position: "before" | "after" = "before") => {
      const currentOrder = orderedColumns.map((c) => c.name)
      const fromIndex = currentOrder.indexOf(draggedName)
      if (fromIndex === -1) return

      const nextOrder = [...currentOrder]
      nextOrder.splice(fromIndex, 1)

      let targetIndex = nextOrder.indexOf(targetName)
      if (targetIndex === -1) return
      if (position === "after") {
        targetIndex += 1
      }
      nextOrder.splice(targetIndex, 0, draggedName)

      const wasPinned = pinnedSet.has(draggedName)
      const isDroppingInPinnedArea = targetIndex < effectivePinnedCount

      let nextPinned = activePinnedColumns
      if (!wasPinned && isDroppingInPinnedArea) {
        // Unpinned kolon pinned alanına sürüklendi/taşındı -> otomatik sabitle
        if (visibleColumns.filter((c) => pinnedSet.has(c.name)).length < visibleColumns.length - 1) {
          nextPinned = [...activePinnedColumns, draggedName]
        }
      } else if (wasPinned && !isDroppingInPinnedArea) {
        // Pinned kolon unpinned alana sürüklendi/taşındı -> sabitlemeyi kaldır
        nextPinned = activePinnedColumns.filter((name) => name !== draggedName)
      }

      const nextPinnedSet = new Set(nextPinned)
      const finalOrder = [
        ...nextOrder.filter((name) => nextPinnedSet.has(name)),
        ...nextOrder.filter((name) => !nextPinnedSet.has(name)),
      ]

      if (nextPinned !== activePinnedColumns) {
        if (onPinnedColumnsChange) {
          onPinnedColumnsChange(nextPinned)
        } else {
          setInternalPinnedColumns(nextPinned)
        }
      }

      if (onColumnOrderChange) {
        onColumnOrderChange(finalOrder)
      } else {
        setInternalColumnOrder(finalOrder)
      }

      // Çoklu sıralama aktifse ve kolon sırası değiştiyse, "soldan sağa doğru çalışır"
      // kuralı gereğince sıralama önceliğini yeni kolon sırasına göre anında güncelle
      const activeSortConfigs = getActiveSortConfigs()
      if (Object.keys(activeSortConfigs).length > 1 && onSortConfigsChange) {
        onSortConfigsChange(activeSortConfigs, finalOrder)
      }
    },
    [
      orderedColumns,
      pinnedSet,
      effectivePinnedCount,
      activePinnedColumns,
      visibleColumns,
      onPinnedColumnsChange,
      onColumnOrderChange,
      onSortConfigsChange,
      getActiveSortConfigs,
      setInternalPinnedColumns,
      setInternalColumnOrder,
    ]
  )

  const moveColumn = React.useCallback(
    (columnName: string, direction: "up" | "down") => {
      const currentOrder = orderedColumns.map((c) => c.name)
      const currentIndex = currentOrder.indexOf(columnName)
      if (currentIndex === -1) return

      if (direction === "up" && currentIndex > 0) {
        const targetName = currentOrder[currentIndex - 1]
        executeColumnReorder(columnName, targetName, "before")
      } else if (direction === "down" && currentIndex < currentOrder.length - 1) {
        const targetName = currentOrder[currentIndex + 1]
        executeColumnReorder(columnName, targetName, "after")
      }
    },
    [orderedColumns, executeColumnReorder]
  )

  const handleDrop = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      event.preventDefault()
      if (resizeGuard.resizeRef.current !== null || resizeGuard.isResizingRef.current) {
        setDraggedColName(null)
        setDropTarget(null)
        return
      }
      if (!draggedColName || draggedColName === col.name) {
        setDraggedColName(null)
        setDropTarget(null)
        setTimeout(() => {
          isDraggingRef.current = false
        }, 50)
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      const position: "before" | "after" = event.clientX < midpoint ? "before" : "after"

      executeColumnReorder(draggedColName, col.name, position)

      setDraggedColName(null)
      setDropTarget(null)
      setTimeout(() => {
        isDraggingRef.current = false
      }, 50)
    },
    [draggedColName, executeColumnReorder, resizeGuard]
  )

  const handleDragEnd = React.useCallback(() => {
    setDraggedColName(null)
    setDropTarget(null)
    setTimeout(() => {
      isDraggingRef.current = false
    }, 50)
  }, [])

  return {
    draggedColName,
    dropTarget,
    hoveredSeparatorCol,
    isDraggingRef,
    isHoveringSeparatorRef,
    setHoveredSeparatorCol,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    moveColumn,
    executeColumnReorder,
  }
}
