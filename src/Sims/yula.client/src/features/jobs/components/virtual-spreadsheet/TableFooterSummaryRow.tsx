"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/utils/cn"
import { cellClass } from "./types"
import type {
  AggregationType,
  ColumnAggregationConfig,
  ColumnAggregationValues,
  SpreadsheetColumn,
} from "./types"
import {
  AGGREGATION_LABELS,
  getAvailableAggregations,
} from "./column-aggregations"

export type TableFooterSummaryRowProps = {
  visibleColumns: readonly SpreadsheetColumn[]
  effectivePinnedCount: number
  isScrolledLeft: boolean
  getStickyLeftOffset: (index: number) => number | undefined
  aggregationConfigs: ColumnAggregationConfig
  aggregationValues: ColumnAggregationValues
  onAggregationChange: (columnName: string, nextType: AggregationType) => void
}

export function TableFooterSummaryRow({
  visibleColumns,
  effectivePinnedCount,
  isScrolledLeft,
  getStickyLeftOffset,
  aggregationConfigs,
  aggregationValues,
  onAggregationChange,
}: TableFooterSummaryRowProps) {
  return (
    <tfoot className="sticky bottom-0 z-20 bg-muted/80 backdrop-blur-xs border-t border-border/80 text-xs font-mono select-none">
      <tr>
        {visibleColumns.map((col, index) => {
          const isPinned = index < effectivePinnedCount
          const isLastPinned = index === effectivePinnedCount - 1
          const stickyLeft = getStickyLeftOffset(index)
          const currentType = aggregationConfigs[col.name] || "none"
          const agg = aggregationValues[col.name]
          const isNumeric = col.align === "right"
          const available = getAvailableAggregations(col)

          return (
            <td
              key={col.name}
              className={cn(
                cellClass,
                "h-7 px-2 py-0 border-t border-border/80 bg-muted/60 hover:bg-muted/90 transition-colors",
                isPinned && "sticky z-30 bg-muted/80",
                isScrolledLeft &&
                  isLastPinned &&
                  "border-r border-border/80 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_5px_-2px_rgba(0,0,0,0.4)]"
              )}
              style={isPinned ? { left: `${stickyLeft}px` } : undefined}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "group flex h-full w-full items-center justify-between gap-1 text-[11px] font-medium leading-none outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
                      isNumeric ? "flex-row-reverse text-right" : "text-left"
                    )}
                    title={`Özet Değiştir: ${col.label}`}
                  >
                    {agg && currentType !== "none" ? (
                      <span className="truncate tabular-nums text-foreground/90 font-semibold">
                        <span className="text-muted-foreground font-normal mr-1">{agg.label}:</span>
                        {agg.formatted}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-[10px] group-hover:text-muted-foreground transition-colors">
                        +
                      </span>
                    )}
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isNumeric ? "end" : "start"} className="w-48 text-xs">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {col.label} Özeti
                  </div>
                  <DropdownMenuSeparator />
                  {available.map((type) => {
                    const isSelected = currentType === type
                    return (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => onAggregationChange(col.name, type)}
                        className={cn(
                          "cursor-pointer text-xs flex items-center justify-between",
                          isSelected && "font-semibold text-primary bg-primary/10"
                        )}
                      >
                        <span>{AGGREGATION_LABELS[type]}</span>
                        {isSelected ? <span className="text-[10px]">✓</span> : null}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          )
        })}
        {/* Sağ taraftaki artan boşluk dolgusu */}
        <td className={cn(cellClass, "p-0 border-t border-border/80 bg-muted/60")} aria-hidden />
      </tr>
    </tfoot>
  )
}
