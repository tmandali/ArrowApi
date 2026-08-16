import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { panelHeaderActionClass } from "@/components/layout/panel-chrome"
import { WORKSPACE_SIDE_PANEL_PERCENT } from "@/components/layout/workspace-side-panel"
import { cn } from "@/utils/cn"
import { formatCount } from "@/utils/format"
import { matchCellFilter } from "@/utils/filter-matcher"
import {
  VirtualSpreadsheet,
  cellInputClass,
  cellClass,
} from "./VirtualSpreadsheet"
import type { ReportColumn, ReportGridRow } from "../types/stock-analytics"

/** Match the header action buttons (h-7, text-xs, no shadow) in the grid header. */
const levelToggleItemClass =
  "!h-7 !min-w-7 !px-2 !text-xs !shadow-none !border-border"

export type StockAnalyticsResultGridHandle = {
  expandAll: () => void
  collapseAll: () => void
  setLevel: (level: number) => void
}

type StockAnalyticsResultGridProps = {
  columns: ReportColumn[]
  rows: ReportGridRow[]
  showFilterRow?: boolean
  onShowFilterRowChange?: (open: boolean) => void
  filters?: Record<string, string>
  onFilterChange?: (columnName: string, value: string) => void
  title?: string
  /** Report/job GUID shown in the header subtitle instead of the row count. */
  reportId?: string
  className?: string
}

function collectExpandableIds(
  rows: ReportGridRow[],
  maxLevel?: number
): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  const walk = (nodes: ReportGridRow[]) => {
    for (const row of nodes) {
      if (row.children?.length) {
        if (maxLevel == null || row.level < maxLevel) {
          next[row.id] = true
        }
        walk(row.children)
      }
    }
  }
  walk(rows)
  return next
}

function rowMatchesFilters(
  row: ReportGridRow,
  active: [string, string][]
): boolean {
  const selfMatch = active.every(([colName, q]) => {
    if (colName === "Name" || colName === "Account") {
      return matchCellFilter(row.name, q)
    }
    const cell = row.values[colName]
    return matchCellFilter(cell, q)
  })
  if (selfMatch) return true
  return (row.children ?? []).some((child) => rowMatchesFilters(child, active))
}

function filterTree(
  rows: ReportGridRow[],
  active: [string, string][]
): ReportGridRow[] {
  if (active.length === 0) return rows
  return rows
    .filter((row) => rowMatchesFilters(row, active))
    .map((row) => ({
      ...row,
      children: row.children ? filterTree(row.children, active) : undefined,
    }))
}

type FlatRow = { row: ReportGridRow; depth: number }

/** Genişletilmiş düğümlerin çocukları dahil pre-order düz liste. */
function flattenVisible(
  rows: ReportGridRow[],
  expanded: Record<string, boolean>,
  depth = 0,
  out: FlatRow[] = []
): FlatRow[] {
  for (const row of rows) {
    out.push({ row, depth })
    if (row.children?.length && expanded[row.id]) {
      flattenVisible(row.children, expanded, depth + 1, out)
    }
  }
  return out
}

/** Hierarchical Arrow result spreadsheet for Stock Analytics. */
export const StockAnalyticsResultGrid = React.forwardRef<
  StockAnalyticsResultGridHandle,
  StockAnalyticsResultGridProps
>(function StockAnalyticsResultGrid(
  {
    columns,
    rows,
    showFilterRow = false,
    onShowFilterRowChange,
    filters: externalFilters,
    onFilterChange: externalOnFilterChange,
    title = "Stock Analytics",
    reportId,
    className,
  },
  ref
) {
  const [internalFilters, setInternalFilters] = React.useState<
    Record<string, string>
  >({})
  const [expandedNodes, setExpandedNodes] = React.useState<
    Record<string, boolean>
  >({})
  const [treeLevel, setTreeLevel] = React.useState("2")

  React.useEffect(() => {
    setInternalFilters({})
    setTreeLevel("2")
    setExpandedNodes(collectExpandableIds(rows, 2))
  }, [columns, rows])

  const activeFilters = externalFilters ?? internalFilters

  const handleFilterChange = (colName: string, value: string) => {
    if (externalOnFilterChange) {
      externalOnFilterChange(colName, value)
    } else {
      setInternalFilters((prev) => ({
        ...prev,
        [colName]: value,
      }))
    }
  }

  const handleExpandAll = React.useCallback(() => {
    setExpandedNodes(collectExpandableIds(rows))
  }, [rows])
  const handleCollapseAll = React.useCallback(() => {
    setExpandedNodes({})
  }, [])
  const handleSetLevel = React.useCallback(
    (level: number) => {
      setExpandedNodes(collectExpandableIds(rows, Math.max(0, level)))
    },
    [rows]
  )

  React.useImperativeHandle(
    ref,
    () => ({
      expandAll: handleExpandAll,
      collapseAll: handleCollapseAll,
      setLevel: handleSetLevel,
    }),
    [handleExpandAll, handleCollapseAll, handleSetLevel]
  )

  const visibleRows = React.useMemo(() => {
    if (!showFilterRow) return rows
    const active = Object.entries(activeFilters)
      .filter(([, q]) => q.trim())
      .map(([k, q]) => [k, q.trim().toLowerCase()] as [string, string])
    return filterTree(rows, active)
  }, [rows, activeFilters, showFilterRow])

  const flatVisible = React.useMemo(
    () => flattenVisible(visibleRows, expandedNodes),
    [visibleRows, expandedNodes]
  )

  const toggleNode = React.useCallback((id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const subtitle =
    reportId ??
    (columns.length === 0
      ? "Waiting for data..."
      : `${formatCount(visibleRows.length)} root row${
          visibleRows.length === 1 ? "" : "s"
        }`)

  const accountColumnName = columns.find((col) => col.kind === "account")?.name
  const initialColWidths = accountColumnName
    ? { [accountColumnName]: `${WORKSPACE_SIDE_PANEL_PERCENT}%` }
    : undefined

  const headerActions = onShowFilterRowChange ? (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={panelHeaderActionClass}
        disabled={rows.length === 0}
        onClick={handleExpandAll}
      >
        Expand All
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={panelHeaderActionClass}
        disabled={rows.length === 0}
        onClick={handleCollapseAll}
      >
        Collapse All
      </Button>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={treeLevel}
        onValueChange={(value) => {
          if (!value) return
          setTreeLevel(value)
          if (value === "all") {
            handleExpandAll()
          } else {
            handleSetLevel(Number.parseInt(value, 10))
          }
        }}
        disabled={rows.length === 0}
        aria-label="Tree level"
        className="!shadow-none"
      >
        <ToggleGroupItem value="1" className={levelToggleItemClass}>
          1
        </ToggleGroupItem>
        <ToggleGroupItem value="2" className={levelToggleItemClass}>
          2
        </ToggleGroupItem>
        <ToggleGroupItem value="3" className={levelToggleItemClass}>
          3
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className={levelToggleItemClass}>
          All
        </ToggleGroupItem>
      </ToggleGroup>
    </>
  ) : null

  return (
    <VirtualSpreadsheet
      columns={columns}
      items={flatVisible}
      title={title}
      subtitle={subtitle}
      className={className}
      resetKey={columns}
      initialColWidths={initialColWidths}
      filterRowClassName="bg-muted/10"
      showFilterRow={showFilterRow}
      onToggleFilterRow={onShowFilterRowChange}
      headerActions={headerActions}
      renderFilterCell={(col, index) => (
        <Input
          className={cn(cellInputClass, index > 0 && "text-right")}
          placeholder={index === 0 ? "Filter…" : undefined}
          value={activeFilters[col.name] ?? ""}
          onChange={(event) =>
            handleFilterChange(col.name, event.target.value)
          }
        />
      )}
      renderRow={({ row, depth }) => {
        const hasChildren = !!row.children?.length
        const isExpanded = !!expandedNodes[row.id]

        return (
          <tr key={row.id} className="hover:bg-muted/30 text-xs">
            {columns.map((col) => {
              if (col.kind === "account") {
                return (
                  <td key={col.name} className={cellClass}>
                    <div
                      className="flex h-7 items-center gap-1.5 px-2 whitespace-nowrap"
                      style={{ paddingLeft: `${8 + depth * 16}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggleNode(row.id)}
                          className="size-4 inline-flex shrink-0 items-center justify-center rounded hover:bg-muted text-muted-foreground"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              !isExpanded && "-rotate-90"
                            )}
                          />
                        </button>
                      ) : (
                        <span className="size-4 inline-block shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate font-medium",
                          hasChildren
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {row.name}
                      </span>
                    </div>
                  </td>
                )
              }

              return (
                <td key={col.name} className={cellClass}>
                  <div
                    className={cn(
                      "flex h-7 items-center justify-end px-2 whitespace-nowrap",
                      col.name === "Debit" || col.name === "ClosingDr"
                        ? "font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {row.values[col.name] ?? "—"}
                  </div>
                </td>
              )
            })}
          </tr>
        )
      }}
    />
  )
})
