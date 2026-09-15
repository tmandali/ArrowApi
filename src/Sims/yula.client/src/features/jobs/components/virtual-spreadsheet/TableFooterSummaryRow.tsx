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
  /** Kolon bazında otomatik görsel katman (bar/çip) anahtarları (varsayılan: kapalı) */
  columnVisuals?: Record<string, boolean>
  /** Otomatik görsel katmanı bir kolon için aç/kapat */
  onColumnVisualToggle?: (column: string, next: boolean) => void
}

export function TableFooterSummaryRow({
  visibleColumns,
  effectivePinnedCount,
  isScrolledLeft,
  getStickyLeftOffset,
  aggregationConfigs,
  aggregationValues,
  onAggregationChange,
  columnVisuals,
  onColumnVisualToggle,
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
                      "group flex h-full w-full items-center gap-1 text-[11px] font-medium leading-none outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
                      isNumeric ? "flex-row-reverse text-right justify-between" : "text-left justify-between",
                      currentType === "none" && (isNumeric ? "justify-start" : "justify-end")
                    )}
                    title={
                      currentType !== "none"
                        ? `${col.label} (${AGGREGATION_LABELS[currentType]})`
                        : `${col.label} (özet seç)`
                    }
                  >
                    {currentType !== "none" ? (
                      <>
                        <span className="truncate tabular-nums text-foreground/90 font-semibold">
                          {agg?.label ? (
                            <span className="text-muted-foreground/80 font-normal mr-1 text-[11px] select-none">
                              {agg.label}
                            </span>
                          ) : null}
                          {agg ? agg.formatted : "..."}
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground" />
                      </>
                    ) : (
                      <span
                        className={cn(
                          "pointer-events-none relative inline-flex items-center px-1 select-none",
                          "text-[11px] font-medium leading-none"
                        )}
                      >
                        {/* Boş durumda hafif Σ işareti; hover'da chevron'a (combo işareti) dönüşür. İki glif üst üste çakışır, yer kaplamaz. */}
                        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold text-muted-foreground/45 transition-opacity duration-150 group-hover:opacity-0">
                          Σ
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isNumeric ? "end" : "start"} className="w-48 text-xs">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {col.label}
                  </div>
                  <DropdownMenuSeparator />
                  {/* Otomatik görsel katman (bar/çip): varsayılan kapalı, kolon bazında açılır */}
                  {onColumnVisualToggle ? (
                    <DropdownMenuItem
                      onClick={() => onColumnVisualToggle(col.name, !columnVisuals?.[col.name])}
                      className={cn(
                        "cursor-pointer text-xs flex items-center justify-between",
                        columnVisuals?.[col.name] && "font-semibold text-primary bg-primary/10"
                      )}
                    >
                      <span>Görsel katman (bar/çip)</span>
                      {columnVisuals?.[col.name] ? <span className="text-[10px]">✓</span> : null}
                    </DropdownMenuItem>
                  ) : null}
                  {onColumnVisualToggle ? <DropdownMenuSeparator /> : null}
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
