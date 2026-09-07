"use client";

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ListFilter,
  Sigma,
  Table2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { useVirtualWindow } from "@/hooks/use-virtual-window"
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"

export type { SpreadsheetColumn, VirtualSpreadsheetProps } from "./virtual-spreadsheet"

import {
  ROW_HEIGHT,
  SKELETON_ROWS,
  MIN_COL_WIDTH,
  cellClass,
  headClass,
  type SpreadsheetColumn,
  type VirtualSpreadsheetProps,
  type AggregationType,
  type ColumnAggregationConfig,
  type GridPersistedState,
  calculateColumnAutoFitWidth,
  getDefaultColumnWidth,
  ColumnManagementMenu,
  TableSkeletonRows,
  TableFooterSummaryRow,
  AiViewDropdown,
  computeInMemoryAggregations,
  getDefaultAggregationForColumn,
} from "./virtual-spreadsheet"

/**
 * Sanal pencereli spreadsheet iskeleti: sabit header + filtre satırı + spacer'lı
 * sanal body. Stock Balance (flat) ve Stock Analytics (ağaç) grid'leri bu ortak
 * chrome/virtualizasyonu paylaşır; satır renderer'ı grid'e özeldir.
 */
export function VirtualSpreadsheet<T>({
  columns,
  items,
  renderRow,
  rowHeight = ROW_HEIGHT,
  initialColWidths,
  sortColumn,
  sortDirection,
  onSortChange,
  disableSorting = false,
  columnOrder,
  onColumnOrderChange,
  disableColumnReorder = false,
  hiddenColumns,
  onHiddenColumnsChange,
  disableColumnVisibility = false,
  filterRowClassName,
  title,
  subtitle,
  headerActions,
  showFilterRow = false,
  onToggleFilterRow,
  renderFilterCell,
  emptyMessage = "No data found",
  className,
  loading = false,
  progressValue,
  resetKey,
  onNeedMore,
  hasMore = false,
  loadingMore = false,
  storageKey,
  disablePersistence = false,
  pinnedColumnCount = 1,
  pinnedColumns,
  onPinnedColumnsChange,
  showFooterRow = true,
  onToggleFooterRow,
  aggregationConfigs,
  onAggregationConfigsChange,
  aggregationValues,
  defaultAggregationConfigs,
  aiViews,
  activeAiViewId,
  currentQuerySql,
  currentQueryTitle,
  onSelectAiView,
  onSaveCurrentAiView,
  onRenameAiView,
  onDeleteAiView,
}: VirtualSpreadsheetProps<T>) {
  // Kalıcı yerel depolama anahtarı (localStorage)
  const effectiveStorageKey = React.useMemo(() => {
    if (disablePersistence) return undefined
    if (storageKey) return storageKey
    if (title && title !== "Report Result" && title !== "Data") {
      return `arrow_grid_${title.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`
    }
    return undefined
  }, [disablePersistence, storageKey, title])

  const isStorageLoadedRef = React.useRef(false)
  const prevStorageKeyRef = React.useRef(effectiveStorageKey)

  if (prevStorageKeyRef.current !== effectiveStorageKey) {
    prevStorageKeyRef.current = effectiveStorageKey
    isStorageLoadedRef.current = false
  }

  // Sabitlenmiş kolonlar (Varsayılan olarak ilk pinnedColumnCount kadar kolon)
  const defaultPinnedColumns = React.useMemo(() => {
    const count = Math.max(0, pinnedColumnCount)
    return columns.slice(0, count).map((c) => c.name)
  }, [columns, pinnedColumnCount])

  const [internalPinnedColumns, setInternalPinnedColumns] = React.useState<string[] | null>(null)

  const activePinnedColumns = React.useMemo(() => {
    if (pinnedColumns !== undefined) return pinnedColumns
    if (internalPinnedColumns !== null) return internalPinnedColumns
    return defaultPinnedColumns
  }, [pinnedColumns, internalPinnedColumns, defaultPinnedColumns])

  const pinnedSet = React.useMemo(
    () => new Set(activePinnedColumns),
    [activePinnedColumns]
  )

  // Kolon sıralama düzeni (Sürükle - Bırak)
  const [internalColumnOrder, setInternalColumnOrder] = React.useState<string[] | null>(null)

  const activeColumnOrder = columnOrder ?? internalColumnOrder

  // Alt toplam (Footer Aggregation) konfigürasyonu
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

    // Sabitlenmiş kolonları daima tablonun soluna grupla
    const pinned = baseCols.filter((c) => pinnedSet.has(c.name))
    const unpinned = baseCols.filter((c) => !pinnedSet.has(c.name))
    return [...pinned, ...unpinned]
  }, [columns, activeColumnOrder, pinnedSet])

  // Kolon gizleme / gösterme durumu
  const [internalHiddenColumns, setInternalHiddenColumns] = React.useState<string[]>([])

  const activeHiddenColumns = hiddenColumns ?? internalHiddenColumns
  const hiddenSet = React.useMemo(
    () => new Set(activeHiddenColumns),
    [activeHiddenColumns]
  )

  const visibleColumns = React.useMemo(() => {
    if (hiddenSet.size === 0) return orderedColumns
    const filtered = orderedColumns.filter((col) => !hiddenSet.has(col.name))
    // En az 1 kolonun görünür kalmasını garanti et
    return filtered.length > 0 ? filtered : orderedColumns
  }, [orderedColumns, hiddenSet])

  // Solda sabitlenecek (sticky) kolon sayısı — tablonun tamamının sabitlenmesi engellenir (en az 1 kolon scroll edilebilir kalır)
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
        // Sabitlemeyi kaldır (Unpin)
        nextPinned = activePinnedColumns.filter((name) => name !== columnName)
        const pinnedSetNext = new Set(nextPinned)
        const pinnedCols = currentOrder.filter((name) => pinnedSetNext.has(name))
        const unpinnedCols = currentOrder.filter((name) => !pinnedSetNext.has(name))
        nextOrder = [...pinnedCols, ...unpinnedCols]
      } else {
        // Sola sabitle (Pin) — En az 1 kolonun kaydırılabilir (unpinned) kalmasını garanti et
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
        setInternalPinnedColumns(nextPinned)
      }

      if (onColumnOrderChange) {
        onColumnOrderChange(nextOrder)
      } else {
        setInternalColumnOrder(nextOrder)
      }
    },
    [pinnedSet, activePinnedColumns, orderedColumns, visibleColumns, onPinnedColumnsChange, onColumnOrderChange]
  )

  // Sürükle - bırak görsel durumları
  const [draggedColName, setDraggedColName] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    name: string
    position: "before" | "after"
  } | null>(null)
  const isDraggingRef = React.useRef(false)
  const isResizingRef = React.useRef(false)
  const isHoveringSeparatorRef = React.useRef(false)
  const [hoveredSeparatorCol, setHoveredSeparatorCol] = React.useState<string | null>(null)
  const lastSeparatorClickRef = React.useRef<{ time: number; colName: string }>({
    time: 0,
    colName: "",
  })

  const [internalSort, setInternalSort] = React.useState<{
    column: string | null
    direction: "asc" | "desc" | null
  }>({
    column: null,
    direction: null,
  })

  const activeSortColumn = sortColumn !== undefined ? sortColumn : internalSort.column
  const activeSortDirection = sortDirection !== undefined ? sortDirection : internalSort.direction

  const handleHeaderClick = React.useCallback(
    (col: SpreadsheetColumn) => {
      // Sürükleme veya boyutlandırma işlemi yeni bittiyse tıklama (sıralama) tetikleme
      if (isDraggingRef.current || isResizingRef.current || resizeRef.current !== null) return
      if (disableSorting || col.sortable === false) return

      let nextDir: "asc" | "desc" | null = "asc"
      if (activeSortColumn === col.name) {
        if (activeSortDirection === "asc") {
          nextDir = "desc"
        } else if (activeSortDirection === "desc") {
          nextDir = null
        } else {
          nextDir = "asc"
        }
      }

      if (onSortChange) {
        onSortChange(col.name, nextDir)
      } else {
        setInternalSort({
          column: nextDir ? col.name : null,
          direction: nextDir,
        })
      }
    },
    [disableSorting, activeSortColumn, activeSortDirection, onSortChange]
  )

  const handleDragStart = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      // Yeniden boyutlandırma sırasında veya ayırıcı çizgiden sürüklemeyi kesinlikle engelle
      if (
        disableColumnReorder ||
        resizeRef.current !== null ||
        isResizingRef.current ||
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
    [disableColumnReorder]
  )

  const handleDragOver = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      if (resizeRef.current !== null || isResizingRef.current) return
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
    [draggedColName]
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
    },
    [
      orderedColumns,
      pinnedSet,
      effectivePinnedCount,
      activePinnedColumns,
      visibleColumns,
      onPinnedColumnsChange,
      onColumnOrderChange,
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
      if (resizeRef.current !== null || isResizingRef.current) {
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
    [draggedColName, executeColumnReorder]
  )

  const handleDragEnd = React.useCallback(() => {
    setDraggedColName(null)
    setDropTarget(null)
    setTimeout(() => {
      isDraggingRef.current = false
    }, 50)
  }, [])

  const [colWidths, setColWidths] = React.useState<
    Record<string, string | number>
  >({})
  const resizeRef = React.useRef<{
    startX: number
    startWidth: number
    name: string
    moved?: boolean
  } | null>(null)

  // Başlangıç genişlikleri değişince sütun genişliklerini senkronize et
  const initialWidthsKey = React.useMemo(
    () => JSON.stringify(initialColWidths ?? null),
    [initialColWidths]
  )
  const [syncedInitialWidthsKey, setSyncedInitialWidthsKey] = React.useState(initialWidthsKey)
  if (syncedInitialWidthsKey !== initialWidthsKey) {
    setSyncedInitialWidthsKey(initialWidthsKey)
    if (!isStorageLoadedRef.current) {
      setColWidths(initialColWidths ?? {})
    }
  }

  // Sayfa açıldığında veya kolonlar yüklendiğinde localStorage'dan ayarları geri yükle
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
            setColWidths(rawWidths)
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
                setInternalColumnOrder(fullOrder)
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
                setInternalHiddenColumns(valid)
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
              setInternalPinnedColumns(valid)
            }
          }
          if (parsed.aggregations && typeof parsed.aggregations === "object") {
            if (onAggregationConfigsChange) {
              onAggregationConfigsChange(parsed.aggregations)
            } else {
              setInternalAggregationConfigs(parsed.aggregations)
            }
          }
        }
      }
    } catch {
      // ignore parse or quota errors
    } finally {
      isStorageLoadedRef.current = true
    }
  }, [effectiveStorageKey, columns, onColumnOrderChange, onHiddenColumnsChange, onPinnedColumnsChange, onAggregationConfigsChange])

  // Kolon sırası, genişliği, gizlilik veya sabitleme değiştiğinde 250ms debounce ile localStorage'a kaydet
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

      if (!hasWidths && !hasOrder && !hasHidden && !hasPinned && !hasAggregations) {
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
        }
        localStorage.setItem(effectiveStorageKey, JSON.stringify(data))
      } catch {
        // ignore quota errors
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [
    effectiveStorageKey,
    colWidths,
    activeColumnOrder,
    activeHiddenColumns,
    activePinnedColumns,
    pinnedColumns,
    internalPinnedColumns,
    defaultPinnedColumns,
    activeAggregationConfigs,
  ])

  const getColWidth = React.useCallback(
    (col: SpreadsheetColumn): number | string => {
      if (colWidths[col.name] !== undefined) return colWidths[col.name]!
      if (initialColWidths?.[col.name] !== undefined) return initialColWidths[col.name]!
      return getDefaultColumnWidth(col)
    },
    [colWidths, initialColWidths]
  )

  const handleResetColumns = React.useCallback(() => {
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
      setInternalPinnedColumns(null)
    }
    setColWidths(initialColWidths ?? {})
    if (effectiveStorageKey && typeof window !== "undefined") {
      try {
        localStorage.removeItem(effectiveStorageKey)
      } catch {}
    }
  }, [onHiddenColumnsChange, onColumnOrderChange, onPinnedColumnsChange, defaultPinnedColumns, initialColWidths, effectiveStorageKey])

  const canResetColumns = React.useMemo(() => {
    const isPinnedModified =
      (pinnedColumns !== undefined && (
        pinnedColumns.length !== defaultPinnedColumns.length ||
        pinnedColumns.some((c, i) => c !== defaultPinnedColumns[i])
      )) ||
      (internalPinnedColumns !== null && (
        internalPinnedColumns.length !== defaultPinnedColumns.length ||
        internalPinnedColumns.some((c, i) => c !== defaultPinnedColumns[i])
      )) ||
      (activePinnedColumns.length !== defaultPinnedColumns.length ||
        activePinnedColumns.some((c, i) => c !== defaultPinnedColumns[i]))

    return (
      hiddenColumnsCount > 0 ||
      Boolean(activeColumnOrder && activeColumnOrder.length > 0) ||
      Object.keys(colWidths).length > 0 ||
      isPinnedModified
    )
  }, [
    hiddenColumnsCount,
    activeColumnOrder,
    colWidths,
    pinnedColumns,
    internalPinnedColumns,
    activePinnedColumns,
    defaultPinnedColumns,
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



  // Her sabit kolonun soldan piksel mesafesini dinamik hesaplar
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

  /**
   * Çift tıklamayla kolonu içeriğe ve başlığa göre en uygun genişliğe otomatik sığdırır.
   */
  const handleAutoFit = React.useCallback(
    (event: React.MouseEvent | React.PointerEvent, col: SpreadsheetColumn) => {
      event.preventDefault()
      event.stopPropagation()
      const autoWidth = calculateColumnAutoFitWidth(col, items)
      setColWidths((prev) => ({ ...prev, [col.name]: autoWidth }))
    },
    [items]
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
      isDraggingRef.current = false
      setDraggedColName(null)
      setDropTarget(null)
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

  const colGroup = (
    <colgroup>
      {visibleColumns.map((col) => {
        const w = getColWidth(col)
        return (
          <col
            key={col.name}
            style={{ width: typeof w === "number" ? `${w}px` : w }}
          />
        )
      })}
      {/* Sağ taraftaki artan boşluğu emen dolgu kolonu */}
      <col />
    </colgroup>
  )

  const [isScrolledLeft, setIsScrolledLeft] = React.useState(false)
  const isScrolledLeftRef = React.useRef(false)

  const renderVirtualRow = React.useCallback(
    (item: T, rowIndex: number) => {
      const rendered = renderRow(item, rowIndex, visibleColumns)
      if (
        React.isValidElement<{ children?: React.ReactNode; className?: string }>(rendered) &&
        rendered.type === "tr"
      ) {
        const childrenArray = React.Children.toArray(rendered.props.children)
        // Eğer kolon sırası veya görünürlüğü değiştiyse, <td> çocuklarını key'e göre visibleColumns sırasına diz!
        // Böylece renderRow içinde varsayılan sırayla dönen <td> elemanları da anında yeni sıraya dizilir ve gizlenenler elenir.
        const tdMap = new Map<string, React.ReactNode>()
        for (const child of childrenArray) {
          if (React.isValidElement(child) && child.key != null) {
            // React key formatı '.$colName' veya 'colName' olabilir
            const rawKey = String(child.key).replace(/^\.\$/, "")
            tdMap.set(rawKey, child)
          }
        }

        let sortedChildren: React.ReactNode[]
        if (tdMap.size >= visibleColumns.length && visibleColumns.every((c) => tdMap.has(c.name))) {
          sortedChildren = visibleColumns.map((c) => tdMap.get(c.name) ?? null)
        } else {
          sortedChildren = childrenArray
        }

        const processedChildren = sortedChildren.map((child, colIndex) => {
          if (!React.isValidElement<{ className?: string; style?: React.CSSProperties }>(child)) {
            return child
          }
          const isPinned = colIndex < effectivePinnedCount
          const isLastPinned = colIndex === effectivePinnedCount - 1
          const stickyLeft = getStickyLeftOffset(colIndex)

          if (!isPinned) return child

          return React.cloneElement(child, {
            className: cn(
              child.props.className,
              "sticky z-10 bg-background group-hover/tr:bg-muted/30",
              isScrolledLeft &&
                isLastPinned &&
                "border-r border-border/80 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_5px_-2px_rgba(0,0,0,0.4)]"
            ),
            style: {
              ...child.props.style,
              left: `${stickyLeft}px`,
            },
          })
        })

        return React.cloneElement(
          rendered,
          {
            className: cn(rendered.props.className, "group/tr"),
          } as React.HTMLAttributes<HTMLTableRowElement>,
          ...processedChildren,
          <td key="__col_spacer" className={cn(cellClass, "p-0")} aria-hidden />
        )
      }
      return rendered
    },
    [renderRow, visibleColumns, effectivePinnedCount, getStickyLeftOffset, isScrolledLeft]
  )

  // Kontrolsüz (uncontrolled) modda client-side sıralama uygula
  const displayItems = React.useMemo(() => {
    if (onSortChange || disableSorting || !activeSortColumn || !activeSortDirection) {
      return items
    }
    const col = orderedColumns.find((c) => c.name === activeSortColumn)
    const isNum = col?.align === "right"
    const dir = activeSortDirection === "asc" ? 1 : -1

    return [...items].sort((a, b) => {
      const aObj = a as Record<string, unknown>
      const bObj = b as Record<string, unknown>
      const aVal =
        aObj?.values && typeof aObj.values === "object"
          ? (aObj.values as Record<string, unknown>)[activeSortColumn]
          : aObj?.[activeSortColumn]
      const bVal =
        bObj?.values && typeof bObj.values === "object"
          ? (bObj.values as Record<string, unknown>)[activeSortColumn]
          : bObj?.[activeSortColumn]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (isNum || typeof aVal === "number" || typeof bVal === "number") {
        const numA = Number(aVal)
        const numB = Number(bVal)
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          return (numA - numB) * dir
        }
      }

      return String(aVal).localeCompare(String(bVal), "tr", { numeric: true }) * dir
    })
  }, [items, onSortChange, disableSorting, activeSortColumn, activeSortDirection, orderedColumns])

  // Özet değerlerini hesapla (Dışarıdan aggregationValues verilmediyse bellek içi hesapla)
  const computedAggregationValues = React.useMemo(() => {
    if (aggregationValues) return aggregationValues
    return computeInMemoryAggregations(
      displayItems as readonly Record<string, unknown>[],
      visibleColumns,
      activeAggregationConfigs
    )
  }, [aggregationValues, displayItems, visibleColumns, activeAggregationConfigs])

  const headerScrollRef = React.useRef<HTMLDivElement>(null)
  const [scrollbarWidth, setScrollbarWidth] = React.useState(0)

  const {
    scrollRef,
    onScroll,
    reset,
    viewportRows,
    startIndex,
    endIndex,
    visible: windowRows,
  } = useVirtualWindow(displayItems, rowHeight)

  const initialSkeletonCount = Math.min(10, Math.max(6, viewportRows ? viewportRows - 4 : 8))

  React.useEffect(() => {
    reset()
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = 0
    }
    isScrolledLeftRef.current = false
    setIsScrolledLeft(false)
  }, [resetKey, reset, activeSortColumn, activeSortDirection])

  // Dikey scrollbar genişliğini ölç — başlığın sağ ucunu body scrollbar'ı ile tam hizalar
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const updateScrollbarWidth = () => {
      const sw = el.offsetWidth - el.clientWidth
      setScrollbarWidth((prev) => (prev !== sw ? sw : prev))
    }
    updateScrollbarWidth()
    const observer = new ResizeObserver(updateScrollbarWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRef, displayItems.length, loading])

  const onNeedMoreRef = React.useRef(onNeedMore)
  React.useEffect(() => {
    onNeedMoreRef.current = onNeedMore
  })

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget
      // Yatay kaydırmayı kolon başlıklarına senkronize et
      if (headerScrollRef.current && headerScrollRef.current.scrollLeft !== el.scrollLeft) {
        headerScrollRef.current.scrollLeft = el.scrollLeft
      }
      const scrolled = el.scrollLeft > 2
      if (scrolled !== isScrolledLeftRef.current) {
        isScrolledLeftRef.current = scrolled
        setIsScrolledLeft(scrolled)
      }
      const sw = el.offsetWidth - el.clientWidth
      if (sw !== scrollbarWidth) {
        setScrollbarWidth(sw)
      }
      onScroll(event)
      if (hasMore && !loadingMore) {
        const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight)
        if (remaining < 300) {
          onNeedMoreRef.current?.()
        }
      }
    },
    [onScroll, hasMore, loadingMore, scrollbarWidth]
  )

  const handleHeaderWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaX !== 0 && scrollRef.current) {
        scrollRef.current.scrollLeft += event.deltaX
      }
    },
    [scrollRef]
  )

  const handleCopy = React.useCallback((event: React.ClipboardEvent) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const rawText = selection.toString()
    if (!rawText) return
    // Tek hücre / tek satır seçiminde tarayıcının eklediği \t ve \n karakterlerini temizle
    const lines = rawText.split(/\r?\n/)
    if (lines.length <= 1) {
      const clean = rawText.trim()
      if (clean) {
        event.clipboardData.setData("text/plain", clean)
        event.preventDefault()
      }
      return
    }
    // Çok satırlı kopyalamalarda da satır başı ve sonundaki gereksiz ayrıcıları temizle
    const cleanLines = lines.map((l) => l.trim()).join("\n").trim()
    if (cleanLines) {
      event.clipboardData.setData("text/plain", cleanLines)
      event.preventDefault()
    }
  }, [])

  return (
    <div className={cn(panelCardClass, "flex-1", className)} onCopy={handleCopy}>
      <div className={panelHeaderClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden mr-2">
          {aiViews !== undefined || activeAiViewId != null || Boolean(currentQuerySql) ? (
            <AiViewDropdown
              reportTitle={title}
              aiViews={aiViews}
              activeAiViewId={activeAiViewId}
              currentQuerySql={currentQuerySql}
              currentQueryTitle={currentQueryTitle}
              onSelectAiView={onSelectAiView}
              onSaveCurrentAiView={onSaveCurrentAiView}
              onRenameAiView={onRenameAiView}
              onDeleteAiView={onDeleteAiView}
            />
          ) : (
            <div className="flex min-w-0 max-w-[200px] sm:max-w-[320px] items-center gap-1.5 shrink">
              <Table2 className={panelHeaderIconClass} aria-hidden />
              <span className={panelHeaderTitleClass}>{title}</span>
            </div>
          )}
          {subtitle != null ? (
            <span className={cn(panelHeaderSubtitleClass, "min-w-0 shrink truncate")}>{subtitle}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center ml-auto">
          {headerActions}
          {!disableColumnVisibility ? (
            <ColumnManagementMenu
              columns={columns}
              orderedColumns={orderedColumns}
              visibleColumns={visibleColumns}
              hiddenSet={hiddenSet}
              pinnedSet={pinnedSet}
              toggleColumnVisibility={toggleColumnVisibility}
              toggleColumnPin={toggleColumnPin}
              onMoveColumn={moveColumn}
              onReorderColumn={executeColumnReorder}
              onResetColumns={handleResetColumns}
              canReset={canResetColumns}
              hiddenColumnsCount={hiddenColumnsCount}
              disabled={columns.length === 0}
              disableReorder={disableColumnReorder}
            />
          ) : null}
          {onToggleFilterRow ? (
            <Button
              type="button"
              variant={showFilterRow ? "secondary" : "outline"}
              size="icon"
              className="size-7 shrink-0"
              disabled={columns.length === 0}
              onClick={() => onToggleFilterRow(!showFilterRow)}
              title={showFilterRow ? "Hide filter row" : "Show filter row"}
              aria-label={
                showFilterRow ? "Hide filter row" : "Show filter row"
              }
            >
              <ListFilter className="size-3.5" />
            </Button>
          ) : null}
          {onToggleFooterRow ? (
            <Button
              type="button"
              variant={showFooterRow ? "secondary" : "outline"}
              size="icon"
              className="size-7 shrink-0"
              disabled={columns.length === 0}
              onClick={() => onToggleFooterRow(!showFooterRow)}
              title={showFooterRow ? "Hide summary row (Σ)" : "Show summary row (Σ)"}
              aria-label={showFooterRow ? "Hide summary row (Σ)" : "Show summary row (Σ)"}
            >
              <Sigma className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {loading && progressValue != null && progressValue < 100 ? (
        <Progress value={progressValue} className="h-0.5 w-full shrink-0 rounded-none bg-primary/10" />
      ) : null}

      {columns.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
          {loading ? (
            <>
              <Spinner className="size-5 text-primary" />
              <span>Preparing report...</span>
            </>
          ) : (
            <span>{emptyMessage}</span>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Sabit Kolon Başlıkları Alanı (Dikey scrollbar dışındadır; dikey scroll tam buradan başlar) */}
          <div className="flex shrink-0 bg-muted/40">
            <div
              ref={headerScrollRef}
              onWheel={handleHeaderWheel}
              className="min-w-0 flex-1 overflow-x-hidden"
            >
              <div style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}>
                <table
                  className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs"
                  style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}
                >
                  {colGroup}
                  <thead>
                    <tr>
                      {visibleColumns.map((col, colIndex) => {
                        const w = getColWidth(col)
                        const isPinned = colIndex < effectivePinnedCount
                        const isLastPinned = colIndex === effectivePinnedCount - 1
                        const stickyLeft = getStickyLeftOffset(colIndex)
                        const isSorted =
                          activeSortColumn === col.name && activeSortDirection !== null
                        const isAsc = isSorted && activeSortDirection === "asc"
                        const isDesc = isSorted && activeSortDirection === "desc"
                        const canSort = !disableSorting && col.sortable !== false
                        const canDrag = !disableColumnReorder
                        const isBeingDragged = draggedColName === col.name
                        const isDropBefore = dropTarget?.name === col.name && dropTarget.position === "before"
                        const isDropAfter = dropTarget?.name === col.name && dropTarget.position === "after"

                        let sortTooltip = col.label
                        if (canSort) {
                          if (!isSorted) {
                            sortTooltip = `${col.label} — Sıralamak için tıkla (Artan)`
                          } else if (isAsc) {
                            sortTooltip = `${col.label} — Ters sıralamak için tıkla (Azalan)`
                          } else {
                            sortTooltip = `${col.label} — Doğal sıraya dönmek için tıkla`
                          }
                        }
                        if (canDrag) {
                          sortTooltip += " (Sırasını değiştirmek için sürükleyin)"
                        }

                        return (
                          <th
                            key={col.name}
                            draggable={canDrag && hoveredSeparatorCol !== col.name}
                            onDragStart={(e) => handleDragStart(e, col)}
                            onDragOver={(e) => handleDragOver(e, col)}
                            onDragLeave={(e) => handleDragLeave(e, col)}
                            onDrop={(e) => handleDrop(e, col)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              headClass,
                              "relative overflow-hidden group/th select-none",
                              isPinned && "sticky z-30 bg-muted/95 backdrop-blur-xs",
                              isScrolledLeft &&
                                isLastPinned &&
                                "border-r border-border/80 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_5px_-2px_rgba(0,0,0,0.4)]",
                              canDrag && hoveredSeparatorCol !== col.name && "cursor-grab active:cursor-grabbing",
                              canSort && "hover:bg-muted/70 transition-colors",
                              col.align === "left" ? "text-left" : "text-right",
                              isBeingDragged && "opacity-40 bg-muted/90",
                              isDropBefore &&
                                "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary before:z-20",
                              isDropAfter &&
                                "after:absolute after:inset-y-0 after:right-0 after:w-1 after:bg-primary after:z-20"
                            )}
                            style={{
                              width: typeof w === "number" ? `${w}px` : w,
                              ...(isPinned ? { left: `${stickyLeft}px` } : {}),
                            }}
                            title={sortTooltip}
                            onClick={() => handleHeaderClick(col)}
                          >
                            <div
                              className={cn(
                                "flex h-full w-full items-center min-w-0 pr-2",
                                col.align === "right" && "justify-end"
                              )}
                            >
                              <span className="truncate">{col.label}</span>
                              {canSort ? (
                                <span className="ml-1 inline-flex shrink-0 items-center justify-center">
                                  {isAsc ? (
                                    <ArrowUp
                                      className="size-3 text-primary stroke-[2.5]"
                                      aria-label="Artan sırada"
                                    />
                                  ) : isDesc ? (
                                    <ArrowDown
                                      className="size-3 text-primary stroke-[2.5]"
                                      aria-label="Azalan sırada"
                                    />
                                  ) : (
                                    <ArrowUpDown className="size-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover/th:opacity-100" />
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={`Resize ${col.label} column (double-click to auto fit)`}
                              title="Genişletmek için sürükleyin, içeriğe tam sığdırmak için çift tıklayın"
                              draggable={false}
                              onMouseEnter={() => {
                                isHoveringSeparatorRef.current = true
                                setHoveredSeparatorCol(col.name)
                              }}
                              onMouseLeave={() => {
                                isHoveringSeparatorRef.current = false
                                setHoveredSeparatorCol(null)
                              }}
                              onMouseDown={(e) => {
                                // HTML5 dragstart'ın th seviyesinde başlamasını kesinlikle engelle
                                e.stopPropagation()
                              }}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={(e) => {
                                // Sıralama tıklamasının th seviyesine sıçramasını engelle
                                e.stopPropagation()
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                handleAutoFit(e, col)
                              }}
                              className="absolute inset-y-0 right-0 z-10 w-4 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:opacity-0 hover:after:bg-primary/40 hover:after:opacity-100 active:after:bg-primary/60 active:after:opacity-100"
                              onPointerDown={(event) =>
                                handleResizeStart(event, col)
                              }
                              onPointerMove={handleResizeMove}
                              onPointerUp={handleResizeEnd}
                              onPointerCancel={handleResizeEnd}
                            />
                          </th>
                        )
                      })}
                      {/* Sağ taraftaki artan boşluğu emen dolgu başlık hücresi */}
                      <th className={cn(headClass, "p-0")} aria-hidden />
                    </tr>
                    {showFilterRow && renderFilterCell ? (
                      <tr className={filterRowClassName}>
                        {visibleColumns.map((col, index) => {
                          const isPinned = index < effectivePinnedCount
                          const isLastPinned = index === effectivePinnedCount - 1
                          const stickyLeft = getStickyLeftOffset(index)
                          return (
                            <th
                              key={col.name}
                              className={cn(
                                cellClass,
                                isPinned && "sticky z-30 bg-background",
                                isScrolledLeft &&
                                  isLastPinned &&
                                  "border-r border-border/80 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_5px_-2px_rgba(0,0,0,0.4)]"
                              )}
                              style={isPinned ? { left: `${stickyLeft}px` } : undefined}
                            >
                              {renderFilterCell(col, index)}
                            </th>
                          )
                        })}
                        <th className={cn(cellClass, "p-0")} aria-hidden />
                      </tr>
                    ) : null}
                  </thead>
                </table>
              </div>
            </div>
            {scrollbarWidth > 0 ? (
              <div
                style={{ width: `${scrollbarWidth}px` }}
                className="shrink-0 bg-muted/40 border-b border-border/60"
                aria-hidden
              />
            ) : null}
          </div>

          {/* Gövde Veri Satırları Alanı (Dikey scrollbar tam buradan başlar) */}
          <div
            className="min-h-0 flex-1 overflow-auto"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            <div style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}>
              <table
                className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs"
                style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}
              >
                {colGroup}
                <tbody>
                {displayItems.length === 0 && loading ? (
                  <TableSkeletonRows
                    count={initialSkeletonCount}
                    prefix="initial-skeleton"
                    visibleColumns={visibleColumns}
                    effectivePinnedCount={effectivePinnedCount}
                    isScrolledLeft={isScrolledLeft}
                    getStickyLeftOffset={getStickyLeftOffset}
                  />
                ) : displayItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      Kayıt bulunamadı
                    </td>
                  </tr>
                ) : (
                  <>
                    {startIndex > 0 ? (
                      <tr
                        aria-hidden
                        className="p-0"
                        style={{ height: startIndex * rowHeight }}
                      >
                        <td colSpan={visibleColumns.length + 1} className="p-0 border-0" />
                      </tr>
                    ) : null}
                    {windowRows.map((row, index) =>
                      renderVirtualRow(row, startIndex + index)
                    )}
                    {loadingMore && hasMore ? (
                      <TableSkeletonRows
                        count={SKELETON_ROWS}
                        prefix="skeleton"
                        visibleColumns={visibleColumns}
                        effectivePinnedCount={effectivePinnedCount}
                        isScrolledLeft={isScrolledLeft}
                        getStickyLeftOffset={getStickyLeftOffset}
                      />
                    ) : null}
                    {endIndex < displayItems.length ? (
                      <tr
                        aria-hidden
                        className="p-0"
                        style={{ height: (displayItems.length - endIndex) * rowHeight }}
                      >
                        <td colSpan={visibleColumns.length + 1} className="p-0 border-0" />
                      </tr>
                    ) : null}
                  </>
                )}
                </tbody>
                {showFooterRow && visibleColumns.length > 0 ? (
                  <TableFooterSummaryRow
                    visibleColumns={visibleColumns}
                    effectivePinnedCount={effectivePinnedCount}
                    isScrolledLeft={isScrolledLeft}
                    getStickyLeftOffset={getStickyLeftOffset}
                    aggregationConfigs={activeAggregationConfigs}
                    aggregationValues={computedAggregationValues}
                    onAggregationChange={handleAggregationChange}
                  />
                ) : null}
            </table>
          </div>
        </div>
      </div>
    )}
  </div>
)
}
