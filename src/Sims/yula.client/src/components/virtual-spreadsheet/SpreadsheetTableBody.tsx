"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/utils/cn"
import {
  SKELETON_ROWS,
  type SpreadsheetColumn,
  type AggregationType,
  type ColumnAggregationConfig,
  type ColumnAggregationValues,
} from "./types"
import { TableSkeletonRows } from "./TableSkeletonRows"
import { TableFooterSummaryRow } from "./TableFooterSummaryRow"

export interface SpreadsheetTableBodyProps<T> {
  scrollRef: React.RefObject<HTMLDivElement | null>
  bodyTableRef: React.RefObject<HTMLTableElement | null>
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void
  totalTableWidth: number
  cellLocator?: boolean
  handleBodyCellClick: (e: React.MouseEvent<HTMLTableElement>) => void
  handleBodyMouseDown: (e: React.MouseEvent<HTMLTableElement>) => void
  handleBodyKeyDown: (e: React.KeyboardEvent<HTMLTableElement>) => void
  colGroup: React.ReactNode
  displayItems: readonly T[]
  loading?: boolean
  initialSkeletonCount: number
  visibleColumns: SpreadsheetColumn[]
  effectivePinnedCount: number
  isScrolledLeft: boolean
  getStickyLeftOffset: (colIndex: number) => number | undefined
  startIndex: number
  endIndex: number
  rowHeight: number
  windowRows: readonly T[]
  renderVirtualRow: (item: T, rowIndex: number) => React.ReactNode
  loadingMore?: boolean
  hasMore?: boolean
  showFooterRow?: boolean
  activeAggregationConfigs: ColumnAggregationConfig
  computedAggregationValues: ColumnAggregationValues
  handleAggregationChange: (columnName: string, nextType: AggregationType) => void
  columnVisuals?: Record<string, boolean>
  onColumnVisualToggle?: (column: string, next: boolean) => void
}

export function SpreadsheetTableBody<T>({
  scrollRef,
  bodyTableRef,
  handleScroll,
  totalTableWidth,
  cellLocator = true,
  handleBodyCellClick,
  handleBodyMouseDown,
  handleBodyKeyDown,
  colGroup,
  displayItems,
  loading = false,
  initialSkeletonCount,
  visibleColumns,
  effectivePinnedCount,
  isScrolledLeft,
  getStickyLeftOffset,
  startIndex,
  endIndex,
  rowHeight,
  windowRows,
  renderVirtualRow,
  loadingMore = false,
  hasMore = false,
  showFooterRow = false,
  activeAggregationConfigs,
  computedAggregationValues,
  handleAggregationChange,
  columnVisuals,
  onColumnVisualToggle,
}: SpreadsheetTableBodyProps<T>) {
  const t = useTranslations("ReportGrid")

  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      onScroll={handleScroll}
    >
      <div
        style={{
          width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%",
          minWidth: "100%",
        }}
      >
        <table
          ref={bodyTableRef as React.RefObject<HTMLTableElement>}
          className={cn(
            "w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs focus:outline-none",
            cellLocator && "select-none"
          )}
          style={{
            width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%",
            minWidth: "100%",
          }}
          onClick={cellLocator ? handleBodyCellClick : undefined}
          onMouseDown={cellLocator ? handleBodyMouseDown : undefined}
          onKeyDown={cellLocator ? handleBodyKeyDown : undefined}
          tabIndex={cellLocator ? 0 : -1}
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
              columnVisuals={columnVisuals}
              onColumnVisualToggle={onColumnVisualToggle}
            />
          ) : null}
        </table>
      </div>
    </div>
  )
}
