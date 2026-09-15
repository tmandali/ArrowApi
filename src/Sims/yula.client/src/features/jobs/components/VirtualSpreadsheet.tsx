"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ListFilter,
  Maximize2,
  Minimize2,
  Sigma,
  Table2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"
import { AIChatAssistant } from "@/components/layout/ai-chat/ai-chat-assistant"

export type { SpreadsheetColumn, VirtualSpreadsheetProps, ColumnSortConfigs } from "./virtual-spreadsheet"

import {
  ROW_HEIGHT,
  SKELETON_ROWS,
  cellClass,
  headClass,
  type SpreadsheetColumn,
  type VirtualSpreadsheetProps,
  type AggregationType,
  type ColumnAggregationConfig,
  ColumnManagementMenu,
  TableSkeletonRows,
  TableFooterSummaryRow,
  AiViewDropdown,
  computeInMemoryAggregations,
  getDefaultAggregationForColumn,
  useMaximizedState,
  useColumnResize,
  useColumnReorder,
  useMultiSort,
  useCellSelection,
  useClientSideSort,
  useGridScrollSync,
  useColumnPersistence,
  usePersistGridState,
} from "./virtual-spreadsheet"

/**
 * Sanal pencereli spreadsheet iskeleti: sabit header + filtre satırı + spacer'lı
 * sanal body. Stock Balance (flat) ve Stock Analytics (ağaç) grid'leri bu ortak
 * chrome/virtualizasyonu paylaşır; satır renderer'ı grid'e özeldir.
 *
 * State mantığı `./virtual-spreadsheet/hooks/` altındaki temaya özel
 * custom hook'lara bölünmüştür; bu dosya yalnızca render orkestrasyonu ve
 * hook'ların birbirine bağlanmasıyla ilgilenir.
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
  showFooterRow = false,
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
  isViewLoading,
  onSortSettingChange,
  sortConfigs,
  onSortConfigsChange,
  isMaximized: controlledMaximized,
  onToggleMaximize,
  cellLocator = true,
}: VirtualSpreadsheetProps<T>) {
  const t = useTranslations("ReportGrid")

  // ── Maximize / minimize (global store + Esc tuşu) ─────────────────────
  const { isMaximized, handleToggleMaximize } = useMaximizedState({
    controlledMaximized,
    onToggleMaximize,
  })

  // ── Kalıcı yerel depolama anahtarı (localStorage) ──────────────────────
  const effectiveStorageKey = React.useMemo(() => {
    if (disablePersistence) return undefined
    if (storageKey) return storageKey
    if (title && title !== "Report Result" && title !== "Data") {
      return `arrow_grid_${title.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`
    }
    return undefined
  }, [disablePersistence, storageKey, title])

  // ── İç (uncontrolled) state'ler ───────────────────────────────────────
  const [internalPinnedColumns, setInternalPinnedColumnsRaw] = React.useState<string[] | null>(null)
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

  // Sabitlenmiş kolonlar (Varsayılan olarak ilk pinnedColumnCount kadar kolon)
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

  // ── Kolon genişliği & resize / auto-fit ───────────────────────────────
  const {
    colWidths,
    getColWidth,
    resetColWidths,
    applyStoredWidths,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleAutoFit,
    refs: { isResizingRef, resizeRef },
  } = useColumnResize({
    initialColWidths,
    displayItems: items,
  })

  // ── HTML5 DnD ile kolon taşıma & otomatik pin/unpin ───────────────────
  const reorder = useColumnReorder({
    disableColumnReorder,
    orderedColumns,
    visibleColumns,
    pinnedSet,
    effectivePinnedCount,
    activePinnedColumns,
    onPinnedColumnsChange,
    onColumnOrderChange,
    onSortConfigsChange,
    getActiveSortConfigs: () => (sortConfigs !== undefined ? sortConfigs : getInternalSortConfigs()),
    setInternalPinnedColumns,
    setInternalColumnOrder,
    resizeGuard: { isResizingRef, resizeRef },
  })
  const {
    draggedColName,
    dropTarget,
    hoveredSeparatorCol,
    setHoveredSeparatorCol,
    isDraggingRef,
    isHoveringSeparatorRef,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    moveColumn,
    executeColumnReorder,
  } = reorder

  // ── Çoklu sıralama ────────────────────────────────────────────────────
  const {
    activeSortConfigs,
    activeSortColumn,
    activeSortDirection,
    handleHeaderClick,
    handleHeaderClearSorts,
    getInternalSortConfigs,
  } = useMultiSort({
    orderedColumns,
    sortColumn,
    sortDirection,
    sortConfigs,
    onSortChange,
    onSortConfigsChange,
    disableSorting,
    interactionGuards: { isDraggingRef, isResizingRef, resizeRef },
  })

  // ── Kontrollü değilse client-side sıralama ────────────────────────────
  const { displayItems } = useClientSideSort({
    items,
    orderedColumns,
    activeSortConfigs,
    disableSorting,
    onSortChange,
    onSortConfigsChange,
  })
  const displayItemsRef = React.useRef(displayItems)
  React.useEffect(() => {
    displayItemsRef.current = displayItems
  }, [displayItems])

  // ── Hücre seçimi / klavye navigasyonu / data-vsp-cell attribute'ları ─
  const bodyTableRef = React.useRef<HTMLTableElement>(null)
  const {
    handleBodyCellClick,
    handleBodyMouseDown,
    handleBodyKeyDown,
    applyCellLocatorAttributes,
  } = useCellSelection({
    cellLocator,
    visibleColumns,
    displayItemsRef,
    bodyTableRef,
  })

  // ── LocalStorage: yükleme & 250ms debounce ile kaydetme ──────────────
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
      setInternalPinnedColumnsRaw(null)
    }
    if (onSortConfigsChange) {
      onSortConfigsChange({})
    }
    handleHeaderClearSorts()
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
    handleHeaderClearSorts,
  ])

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
    const hasSort = Boolean(sortColumn) || Object.keys(activeSortConfigs).length > 0
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

  // ── Sanal pencere + header/body scroll senkronizasyonu ────────────────
  const headerScrollRef = React.useRef<HTMLDivElement>(null)
  const {
    scrollRef,
    handleHeaderWheel,
    handleScroll,
    scrollbarWidth,
    isScrolledLeft,
    startIndex,
    endIndex,
    windowRows,
    viewportRows,
  } = useGridScrollSync({
    displayItems: displayItems as readonly unknown[],
    rowHeight,
    resetKey,
    headerScrollRef,
    activeSortColumn,
    activeSortDirection,
    hasMore,
    loadingMore,
    onNeedMore,
  })

  const initialSkeletonCount = Math.min(10, Math.max(6, viewportRows ? viewportRows - 4 : 8))

  // Özet değerlerini hesapla (Dışarıdan aggregationValues verilmediyse bellek içi hesapla)
  const computedAggregationValues = React.useMemo(() => {
    if (aggregationValues) return aggregationValues
    return computeInMemoryAggregations(
      displayItems as readonly Record<string, unknown>[],
      visibleColumns,
      activeAggregationConfigs
    )
  }, [aggregationValues, displayItems, visibleColumns, activeAggregationConfigs])

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
            ref: (el: HTMLTableRowElement | null) => {
              if (el) applyCellLocatorAttributes(el, rowIndex)
            },
            className: cn(rendered.props.className, "group/tr"),
          } as React.HTMLAttributes<HTMLTableRowElement>,
          ...processedChildren,
          <td key="__col_spacer" className={cn(cellClass, "p-0")} aria-hidden />
        )
      }
      return rendered
    },
    [renderRow, visibleColumns, effectivePinnedCount, getStickyLeftOffset, isScrolledLeft, applyCellLocatorAttributes]
  )

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
    <div
      className={cn(panelCardClass, "flex-1", isMaximized && "rounded-none border-none", className)}
      onCopy={handleCopy}
      data-cell-locator={cellLocator ? "true" : undefined}
    >
      <div className={cn(panelHeaderClass, isMaximized && "px-1")}>
        <div className={cn("flex min-w-0 flex-1 items-center gap-2 overflow-hidden mr-2", isMaximized && "mr-0")}>
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
              isViewLoading={isViewLoading}
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
              title={showFooterRow ? t("footer_toggle_hide") : t("footer_toggle_show")}
              aria-label={showFooterRow ? t("footer_toggle_hide") : t("footer_toggle_show")}
            >
              <Sigma className="size-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isMaximized ? "secondary" : "outline"}
            size="icon"
            className="size-7 shrink-0"
            onClick={handleToggleMaximize}
            title={isMaximized ? t("unmaximize_title") : t("maximize_title")}
            aria-label={isMaximized ? t("unmaximize_title") : t("maximize_title")}
          >
            {isMaximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
          {isMaximized ? (
            <AIChatAssistant separator={false} />
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
                        const colSortDir = activeSortConfigs[col.name]
                        const isSorted = colSortDir !== undefined && colSortDir !== null
                        const isAsc = colSortDir === "asc"
                        const isDesc = colSortDir === "desc"

                        // Çoklu sıralama önceliği: sıralı kolonlar soldan sağa sırayla numaralandırılır
                        const sortedColNames = orderedColumns
                          .map((c) => c.name)
                          .filter((name) => activeSortConfigs[name])
                        const hasMultipleSorts = sortedColNames.length > 1
                        const sortPriority = isSorted ? sortedColNames.indexOf(col.name) + 1 : 0

                        const canSort = !disableSorting && col.sortable !== false
                        const canDrag = !disableColumnReorder
                        const isBeingDragged = draggedColName === col.name
                        const isDropBefore = dropTarget?.name === col.name && dropTarget.position === "before"
                        const isDropAfter = dropTarget?.name === col.name && dropTarget.position === "after"

                        let sortTooltip = col.label
                        if (canSort) {
                          if (!isSorted) {
                            sortTooltip = t("sort_click_asc", { label: col.label })
                          } else if (isAsc) {
                            sortTooltip = hasMultipleSorts
                              ? t("sort_priority_asc", { label: col.label, priority: sortPriority })
                              : t("sort_click_desc", { label: col.label })
                          } else {
                            sortTooltip = hasMultipleSorts
                              ? t("sort_priority_desc", { label: col.label, priority: sortPriority })
                              : t("sort_click_clear", { label: col.label })
                          }
                        }
                        if (canDrag) {
                          sortTooltip += t("sort_drag_hint")
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
                                <span className="ml-1 inline-flex shrink-0 items-center justify-center gap-0.5">
                                  {isAsc ? (
                                    <>
                                      <ArrowUp
                                        className="size-3 text-primary stroke-[2.5]"
                                        aria-label={t("aria_sorted_asc")}
                                      />
                                      {hasMultipleSorts ? (
                                        <span className="text-[9px] font-bold text-primary leading-none select-none">
                                          {sortPriority}
                                        </span>
                                      ) : null}
                                    </>
                                  ) : isDesc ? (
                                    <>
                                      <ArrowDown
                                        className="size-3 text-primary stroke-[2.5]"
                                        aria-label={t("aria_sorted_desc")}
                                      />
                                      {hasMultipleSorts ? (
                                        <span className="text-[9px] font-bold text-primary leading-none select-none">
                                          {sortPriority}
                                        </span>
                                      ) : null}
                                    </>
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
                              title={t("col_resize_title")}
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
            ref={scrollRef as React.RefObject<HTMLDivElement>}
            onScroll={handleScroll}
          >
            <div style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}>
              <table
                ref={bodyTableRef}
                className={cn(
                  "w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs focus:outline-none",
                  // Hücre seçimi aktifken sürüklemenin native text selection üretmesini engelle
                  cellLocator && "select-none"
                )}
                style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}
                onClick={cellLocator ? handleBodyCellClick : undefined}
                onMouseDown={cellLocator ? handleBodyMouseDown : undefined}
                onKeyDown={cellLocator ? handleBodyKeyDown : undefined}
                tabIndex={cellLocator ? 0 : -1}
              >
                {colGroup}
                <tbody>
                {(displayItems as readonly T[]).length === 0 && loading ? (
                  <TableSkeletonRows
                    count={initialSkeletonCount}
                    prefix="initial-skeleton"
                    visibleColumns={visibleColumns}
                    effectivePinnedCount={effectivePinnedCount}
                    isScrolledLeft={isScrolledLeft}
                    getStickyLeftOffset={getStickyLeftOffset}
                  />
                ) : (displayItems as readonly T[]).length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      {t("no_records")}
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
                    {(windowRows as readonly T[]).map((row, index) =>
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
                    {endIndex < (displayItems as readonly T[]).length ? (
                      <tr
                        aria-hidden
                        className="p-0"
                        style={{ height: ((displayItems as readonly T[]).length - endIndex) * rowHeight }}
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
