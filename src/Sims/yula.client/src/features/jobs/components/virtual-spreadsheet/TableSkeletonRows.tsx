import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/utils/cn"
import { cellClass, type SpreadsheetColumn } from "./types"

export interface TableSkeletonRowsProps {
  count: number
  visibleColumns: readonly SpreadsheetColumn[]
  effectivePinnedCount: number
  isScrolledLeft: boolean
  getStickyLeftOffset: (colIndex: number) => number | undefined
  prefix?: string
}

export function TableSkeletonRows({
  count,
  visibleColumns,
  effectivePinnedCount,
  isScrolledLeft,
  getStickyLeftOffset,
  prefix = "skeleton",
}: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: count }, (_, skeletonIndex) => (
        <tr key={`${prefix}-${skeletonIndex}`} aria-hidden>
          {visibleColumns.map((col, colIdx) => {
            const isPinned = colIdx < effectivePinnedCount
            const isLastPinned = colIdx === effectivePinnedCount - 1
            const stickyLeft = getStickyLeftOffset(colIdx)
            return (
              <td
                key={col.name}
                className={cn(
                  cellClass,
                  col.align === "left" ? "text-left" : "text-right",
                  isPinned && "sticky z-10 bg-background",
                  isScrolledLeft &&
                    isLastPinned &&
                    "border-r border-border/80 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_5px_-2px_rgba(0,0,0,0.4)]"
                )}
                style={isPinned ? { left: `${stickyLeft}px` } : undefined}
              >
                <div
                  className={cn(
                    "flex h-7 min-w-0 items-center px-2",
                    col.align === "right" && "justify-end"
                  )}
                >
                  <Skeleton
                    className={cn(
                      "h-3.5",
                      col.align === "right" ? "w-16" : "w-24 max-w-[80%]"
                    )}
                  />
                </div>
              </td>
            )
          })}
          <td className={cn(cellClass, "p-0")} aria-hidden />
        </tr>
      ))}
    </>
  )
}
