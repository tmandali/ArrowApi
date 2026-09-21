"use client";

import * as React from "react"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { panelCardClass } from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"

export type { SpreadsheetColumn, VirtualSpreadsheetProps, ColumnSortConfigs } from "./virtual-spreadsheet"

import {
  ROW_HEIGHT,
  type VirtualSpreadsheetProps,
  computeInMemoryAggregations,
  useMaximizedState,
  useColumnResize,
  useColumnReorder,
  useMultiSort,
  useCellSelection,
  useClientSideSort,
  useGridScrollSync,
  useSpreadsheetColumns,
  useSpreadsheetPersistence,
  useNameBoxNavigation,
  useVirtualRowRenderer,
  SpreadsheetHeaderBar,
  SpreadsheetTableHeader,
  SpreadsheetTableBody,
} from "./virtual-spreadsheet"

/**
 * Sanal pencereli spreadsheet iskeleti: sabit header + filtre satırı + spacer'lı
 * sanal body. Stock Balance (flat) ve Stock Analytics (ağaç) grid'leri bu ortak
 * chrome/virtualizasyonu paylaşır; satır renderer'ı grid'e özeldir.
 */
export function VirtualSpreadsheet<T>(props: VirtualSpreadsheetProps<T>) {
  const {
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
    filterRowClassName,
    title,
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
    onSortSettingChange,
    sortConfigs,
    onSortConfigsChange,
    isMaximized: controlledMaximized,
    onToggleMaximize,
    cellLocator = true,
    onRowSelect,
  } = props

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

  // ── Kolon genişliği & resize / auto-fit ───────────────────────────────
  const resize = useColumnResize({
    initialColWidths,
    displayItems: items,
  })
  const { colWidths, getColWidth, resetColWidths, applyStoredWidths } = resize

  // ── Kolon sabitleme, sıralama, görünürlük ve özet state'i ───────────
  const columnsState = useSpreadsheetColumns({
    columns,
    pinnedColumnCount,
    pinnedColumns,
    onPinnedColumnsChange,
    columnOrder,
    onColumnOrderChange,
    hiddenColumns,
    onHiddenColumnsChange,
    aggregationConfigs,
    onAggregationConfigsChange,
    defaultAggregationConfigs,
    showFooterRow,
    onToggleFooterRow,
    onSortConfigsChange,
    onSortSettingChange,
    resetColWidths,
    colWidths,
    getColWidth,
    effectiveStorageKey,
  })
  const {
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
    setInternalColumnOrder,
    activeHiddenColumns,
    setInternalHiddenColumns,
    activeAggregationConfigs,
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
  } = columnsState

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
    getActiveSortConfigs: () =>
      sortConfigs !== undefined ? sortConfigs : getInternalSortConfigs(),
    setInternalPinnedColumns,
    setInternalColumnOrder,
    resizeGuard: resize.refs,
  })

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
    interactionGuards: {
      isDraggingRef: reorder.isDraggingRef,
      isResizingRef: resize.refs.isResizingRef,
      resizeRef: resize.refs.resizeRef,
    },
  })

  const onResetAll = React.useCallback(() => {
    handleResetColumns(handleHeaderClearSorts)
  }, [handleResetColumns, handleHeaderClearSorts])

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
    applyRowSelectionAttributes,
    selection,
    activeCell,
    startSelection,
    extendSelection,
    clearSelection,
  } = useCellSelection({
    cellLocator,
    visibleColumns,
    displayItemsRef,
    bodyTableRef,
    dataIdentity: resetKey,
    onRowSelect,
  })

  // ── Name Box & TSV Kopyalama ─────────────────────────────────────────
  const {
    selectionRefLabel,
    selectionSize,
    nameBoxDraft,
    setNameBoxDraft,
    commitNameBox,
    handleCopyTsv,
    handleCopy,
  } = useNameBoxNavigation({
    selection,
    activeCell,
    cellLocator,
    displayItemsRef,
    visibleColumns,
    startSelection,
    extendSelection,
    clearSelection,
    displayItems,
  })

  // ── LocalStorage State Persistence ──────────────────────────────────
  useSpreadsheetPersistence({
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
  })

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

  const computedAggregationValues = React.useMemo(() => {
    if (aggregationValues) return aggregationValues
    return computeInMemoryAggregations(
      displayItems as readonly Record<string, unknown>[],
      visibleColumns,
      activeAggregationConfigs
    )
  }, [aggregationValues, displayItems, visibleColumns, activeAggregationConfigs])

  const renderVirtualRow = useVirtualRowRenderer({
    renderRow,
    visibleColumns,
    effectivePinnedCount,
    getStickyLeftOffset,
    isScrolledLeft,
    applyCellLocatorAttributes,
    applyRowSelectionAttributes,
  })

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
      <col />
    </colgroup>
  )

  return (
    <div
      className={cn(panelCardClass, "flex-1", className)}
      onCopy={handleCopy}
      data-cell-locator={cellLocator ? "true" : undefined}
    >
      <SpreadsheetHeaderBar
        isMaximized={isMaximized}
        title={title}
        subtitle={props.subtitle}
        aiViews={props.aiViews}
        activeAiViewId={props.activeAiViewId}
        currentQuerySql={props.currentQuerySql}
        currentQueryTitle={props.currentQueryTitle}
        onSelectAiView={props.onSelectAiView}
        onSaveCurrentAiView={props.onSaveCurrentAiView}
        onRenameAiView={props.onRenameAiView}
        onDeleteAiView={props.onDeleteAiView}
        isViewLoading={props.isViewLoading}
        headerActions={props.headerActions}
        disableColumnVisibility={props.disableColumnVisibility}
        columnRules={props.columnRules}
        onColumnRulesChange={props.onColumnRulesChange}
        columns={columns}
        orderedColumns={orderedColumns}
        visibleColumns={visibleColumns}
        hiddenSet={hiddenSet}
        pinnedSet={pinnedSet}
        toggleColumnVisibility={toggleColumnVisibility}
        toggleColumnPin={toggleColumnPin}
        moveColumn={reorder.moveColumn}
        executeColumnReorder={reorder.executeColumnReorder}
        handleResetColumns={onResetAll}
        canResetColumns={canResetColumns}
        hiddenColumnsCount={hiddenColumnsCount}
        disableColumnReorder={disableColumnReorder}
        showFilterRow={showFilterRow}
        onToggleFilterRow={onToggleFilterRow}
        showFooterRow={showFooterRow}
        onToggleFooterRow={onToggleFooterRow}
        cellLocator={cellLocator}
        nameBoxDraft={nameBoxDraft}
        selectionRefLabel={selectionRefLabel}
        setNameBoxDraft={setNameBoxDraft}
        commitNameBox={commitNameBox}
        clearSelection={clearSelection}
        selectionSize={selectionSize}
        selection={selection}
        handleCopyTsv={handleCopyTsv}
        handleToggleMaximize={handleToggleMaximize}
      />

      {loading && progressValue != null && progressValue < 100 ? (
        <Progress
          value={progressValue}
          className="h-0.5 w-full shrink-0 rounded-none bg-primary/10"
        />
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
          <SpreadsheetTableHeader
            headerScrollRef={headerScrollRef}
            handleHeaderWheel={handleHeaderWheel}
            totalTableWidth={totalTableWidth}
            colGroup={colGroup}
            visibleColumns={visibleColumns}
            orderedColumns={orderedColumns}
            effectivePinnedCount={effectivePinnedCount}
            getStickyLeftOffset={getStickyLeftOffset}
            activeSortConfigs={activeSortConfigs}
            disableSorting={disableSorting}
            disableColumnReorder={disableColumnReorder}
            reorder={reorder}
            handleHeaderClick={handleHeaderClick}
            resize={resize}
            isScrolledLeft={isScrolledLeft}
            showFilterRow={showFilterRow}
            renderFilterCell={renderFilterCell}
            filterRowClassName={filterRowClassName}
            scrollbarWidth={scrollbarWidth}
          />

          <SpreadsheetTableBody
            scrollRef={scrollRef}
            bodyTableRef={bodyTableRef}
            handleScroll={handleScroll}
            totalTableWidth={totalTableWidth}
            cellLocator={cellLocator}
            handleBodyCellClick={handleBodyCellClick}
            handleBodyMouseDown={handleBodyMouseDown}
            handleBodyKeyDown={handleBodyKeyDown}
            colGroup={colGroup}
            displayItems={displayItems as readonly T[]}
            loading={loading}
            initialSkeletonCount={initialSkeletonCount}
            visibleColumns={visibleColumns}
            effectivePinnedCount={effectivePinnedCount}
            isScrolledLeft={isScrolledLeft}
            getStickyLeftOffset={getStickyLeftOffset}
            startIndex={startIndex}
            endIndex={endIndex}
            rowHeight={rowHeight}
            windowRows={windowRows as readonly T[]}
            renderVirtualRow={renderVirtualRow}
            loadingMore={loadingMore}
            hasMore={hasMore}
            showFooterRow={showFooterRow}
            activeAggregationConfigs={activeAggregationConfigs}
            computedAggregationValues={computedAggregationValues}
            handleAggregationChange={handleAggregationChange}
            columnVisuals={props.columnVisuals}
            onColumnVisualToggle={props.onColumnVisualToggle}
          />
        </div>
      )}
    </div>
  )
}
