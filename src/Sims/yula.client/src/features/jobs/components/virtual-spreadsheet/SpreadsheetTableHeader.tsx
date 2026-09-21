"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { cn } from "@/utils/cn"
import { headClass, cellClass, type SpreadsheetColumn } from "./types"

export interface SpreadsheetTableHeaderProps {
  headerScrollRef: React.RefObject<HTMLDivElement | null>
  handleHeaderWheel: (e: React.WheelEvent<HTMLDivElement>) => void
  totalTableWidth: number
  colGroup: React.ReactNode
  visibleColumns: SpreadsheetColumn[]
  orderedColumns: SpreadsheetColumn[]
  effectivePinnedCount: number
  getStickyLeftOffset: (colIndex: number) => number | undefined
  activeSortConfigs: Record<string, "asc" | "desc">
  disableSorting?: boolean
  disableColumnReorder?: boolean
  reorder: {
    draggedColName: string | null
    dropTarget: { name: string; position: "before" | "after" } | null
    hoveredSeparatorCol: string | null
    setHoveredSeparatorCol: (name: string | null) => void
    isHoveringSeparatorRef: React.MutableRefObject<boolean>
    handleDragStart: (e: React.DragEvent<HTMLElement>, col: SpreadsheetColumn) => void
    handleDragOver: (e: React.DragEvent<HTMLElement>, col: SpreadsheetColumn) => void
    handleDragLeave: (e: React.DragEvent<HTMLElement>, col: SpreadsheetColumn) => void
    handleDrop: (e: React.DragEvent<HTMLElement>, col: SpreadsheetColumn) => void
    handleDragEnd: () => void
  }
  handleHeaderClick: (col: SpreadsheetColumn) => void
  resize: {
    handleAutoFit: (e: React.MouseEvent, col: SpreadsheetColumn) => void
    handleResizeStart: (e: React.PointerEvent, col: SpreadsheetColumn) => void
    handleResizeMove: (e: React.PointerEvent) => void
    handleResizeEnd: (e: React.PointerEvent) => void
    getColWidth: (col: SpreadsheetColumn) => number | string
  }
  isScrolledLeft: boolean
  showFilterRow?: boolean
  renderFilterCell?: (col: SpreadsheetColumn, index: number) => React.ReactNode
  filterRowClassName?: string
  scrollbarWidth: number
}

export function SpreadsheetTableHeader({
  headerScrollRef,
  handleHeaderWheel,
  totalTableWidth,
  colGroup,
  visibleColumns,
  orderedColumns,
  effectivePinnedCount,
  getStickyLeftOffset,
  activeSortConfigs,
  disableSorting = false,
  disableColumnReorder = false,
  reorder,
  handleHeaderClick,
  resize,
  isScrolledLeft,
  showFilterRow = false,
  renderFilterCell,
  filterRowClassName,
  scrollbarWidth,
}: SpreadsheetTableHeaderProps) {
  const t = useTranslations("ReportGrid")

  const {
    draggedColName,
    dropTarget,
    hoveredSeparatorCol,
    setHoveredSeparatorCol,
    isHoveringSeparatorRef,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = reorder

  const {
    handleAutoFit,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    getColWidth,
  } = resize

  return (
    <div className="flex shrink-0 bg-muted/40">
      <div
        ref={headerScrollRef as React.RefObject<HTMLDivElement>}
        onWheel={handleHeaderWheel}
        className="min-w-0 flex-1 overflow-x-hidden"
      >
        <div
          style={{
            width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%",
            minWidth: "100%",
          }}
        >
          <table
            className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs"
            style={{
              width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%",
              minWidth: "100%",
            }}
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

                  const sortedColNames = orderedColumns
                    .map((c) => c.name)
                    .filter((name) => activeSortConfigs[name])
                  const hasMultipleSorts = sortedColNames.length > 1
                  const sortPriority = isSorted ? sortedColNames.indexOf(col.name) + 1 : 0

                  const canSort = !disableSorting && col.sortable !== false
                  const canDrag = !disableColumnReorder
                  const isBeingDragged = draggedColName === col.name
                  const isDropBefore =
                    dropTarget?.name === col.name && dropTarget.position === "before"
                  const isDropAfter =
                    dropTarget?.name === col.name && dropTarget.position === "after"

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
                        canDrag &&
                          hoveredSeparatorCol !== col.name &&
                          "cursor-grab active:cursor-grabbing",
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
                          e.stopPropagation()
                        }}
                        onDragStart={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          handleAutoFit(e, col)
                        }}
                        className="absolute inset-y-0 right-0 z-10 w-4 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:opacity-0 hover:after:bg-primary/40 hover:after:opacity-100 active:after:bg-primary/60 active:after:opacity-100"
                        onPointerDown={(event) => handleResizeStart(event, col)}
                        onPointerMove={handleResizeMove}
                        onPointerUp={handleResizeEnd}
                        onPointerCancel={handleResizeEnd}
                      />
                    </th>
                  )
                })}
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
  )
}
