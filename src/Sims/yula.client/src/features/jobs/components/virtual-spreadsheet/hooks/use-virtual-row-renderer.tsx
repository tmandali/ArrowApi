import * as React from "react"
import { cn } from "@/utils/cn"
import { cellClass, type SpreadsheetColumn } from "../types"

export interface UseVirtualRowRendererParams<T> {
  renderRow: (item: T, rowIndex: number, visibleColumns: SpreadsheetColumn[]) => React.ReactNode
  visibleColumns: SpreadsheetColumn[]
  effectivePinnedCount: number
  getStickyLeftOffset: (colIndex: number) => number | undefined
  isScrolledLeft: boolean
  applyCellLocatorAttributes: (element: HTMLTableRowElement, rowIndex: number) => void
  applyRowSelectionAttributes: (element: HTMLTableRowElement, rowIndex: number) => void
}

export function useVirtualRowRenderer<T>({
  renderRow,
  visibleColumns,
  effectivePinnedCount,
  getStickyLeftOffset,
  isScrolledLeft,
  applyCellLocatorAttributes,
  applyRowSelectionAttributes,
}: UseVirtualRowRendererParams<T>) {
  return React.useCallback(
    (item: T, rowIndex: number) => {
      const rendered = renderRow(item, rowIndex, visibleColumns)
      if (
        React.isValidElement<{ children?: React.ReactNode; className?: string }>(rendered) &&
        rendered.type === "tr"
      ) {
        const childrenArray = React.Children.toArray(rendered.props.children)
        const tdMap = new Map<string, React.ReactNode>()
        for (const child of childrenArray) {
          if (React.isValidElement(child) && child.key != null) {
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
              if (el) {
                applyCellLocatorAttributes(el, rowIndex)
                applyRowSelectionAttributes(el, rowIndex)
              }
            },
            className: cn(rendered.props.className, "group/tr"),
          } as React.HTMLAttributes<HTMLTableRowElement>,
          ...processedChildren,
          <td key="__col_spacer" className={cn(cellClass, "p-0")} aria-hidden />
        )
      }
      return rendered
    },
    [
      renderRow,
      visibleColumns,
      effectivePinnedCount,
      getStickyLeftOffset,
      isScrolledLeft,
      applyCellLocatorAttributes,
      applyRowSelectionAttributes,
    ]
  )
}
