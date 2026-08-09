import * as React from "react"
import { ChevronDown, ListFilter, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  panelCardClass,
  panelHeaderActionClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome"
import { WORKSPACE_SIDE_PANEL_PERCENT } from "@/components/layout/workspace-side-panel"
import { cn } from "@/utils/cn"
import type { ReportColumn, ReportGridRow } from "../types/stock-analytics"

const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

const cellClass =
  "p-0 border-r border-b border-border/60 last:border-r-0 align-middle"
const headClass =
  "h-7 px-2 py-0 border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-none text-muted-foreground bg-muted/40 align-middle"

const ACCOUNT_COL_STYLE = { width: `${WORKSPACE_SIDE_PANEL_PERCENT}%` } as const

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
      return row.name.toLowerCase().includes(q)
    }
    const cell = String(row.values[colName] ?? "").toLowerCase()
    return cell.includes(q)
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
    title = "Stock Analytics",
    reportId,
    className,
  },
  ref
) {
  const [filters, setFilters] = React.useState<Record<string, string>>({})
  const [expandedNodes, setExpandedNodes] = React.useState<
    Record<string, boolean>
  >({})
  const [treeLevel, setTreeLevel] = React.useState("2")

  React.useEffect(() => {
    setFilters({})
    setTreeLevel("2")
    setExpandedNodes(collectExpandableIds(rows, 2))
  }, [columns, rows])

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
    const active = Object.entries(filters)
      .filter(([, q]) => q.trim())
      .map(([k, q]) => [k, q.trim().toLowerCase()] as [string, string])
    return filterTree(rows, active)
  }, [rows, filters, showFilterRow])

  const toggleNode = React.useCallback((id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const renderRows = (nodes: ReportGridRow[], depth = 0): React.ReactNode =>
    nodes.map((row) => {
      const hasChildren = !!row.children?.length
      const isExpanded = !!expandedNodes[row.id]

      return (
        <React.Fragment key={row.id}>
          <tr className="hover:bg-muted/30 text-xs">
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
          {hasChildren && isExpanded
            ? renderRows(row.children!, depth + 1)
            : null}
        </React.Fragment>
      )
    })

  const subtitle =
    reportId ??
    (columns.length === 0
      ? "No columns"
      : `${visibleRows.length} root row${visibleRows.length === 1 ? "" : "s"}`)

  return (
    <div className={cn(panelCardClass, "flex-1", className)}>
      <div className={panelHeaderClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Table2 className={panelHeaderIconClass} aria-hidden />
            <span className={panelHeaderTitleClass}>{title}</span>
          </div>
          <span className={panelHeaderSubtitleClass}>{subtitle}</span>
        </div>
        {onShowFilterRowChange ? (
          <div className="flex shrink-0 items-center gap-1.5 self-center">
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
            <Button
              type="button"
              variant={showFilterRow ? "secondary" : "outline"}
              size="icon"
              className="size-7"
              onClick={() => onShowFilterRowChange(!showFilterRow)}
              title={showFilterRow ? "Hide filter row" : "Show filter row"}
              aria-label={
                showFilterRow ? "Hide filter row" : "Show filter row"
              }
            >
              <ListFilter className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[42rem]">
          <div className="sticky top-0 z-10 bg-card">
            <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
              <colgroup>
                {columns.map((col) => (
                  <col
                    key={col.name}
                    style={col.kind === "account" ? ACCOUNT_COL_STYLE : undefined}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.name}
                      className={cn(
                        headClass,
                        col.align === "left" ? "text-left" : "text-right"
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
                {showFilterRow ? (
                  <tr className="bg-muted/10">
                    {columns.map((col, index) => (
                      <th key={col.name} className={cellClass}>
                        <Input
                          className={cn(
                            cellInputClass,
                            index > 0 && "text-right"
                          )}
                          placeholder={index === 0 ? "Filter…" : undefined}
                          value={filters[col.name] ?? ""}
                          onChange={(event) =>
                            setFilters((prev) => ({
                              ...prev,
                              [col.name]: event.target.value,
                            }))
                          }
                        />
                      </th>
                    ))}
                  </tr>
                ) : null}
              </thead>
            </table>
          </div>

          <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
            <colgroup>
              {columns.map((col) => (
                <col
                  key={col.name}
                  style={col.kind === "account" ? ACCOUNT_COL_STYLE : undefined}
                />
              ))}
            </colgroup>
            <tbody>{renderRows(visibleRows)}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
})
