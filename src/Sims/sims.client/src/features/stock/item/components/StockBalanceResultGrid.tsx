import * as React from "react"
import { ListFilter, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"
import type {
  StockBalanceColumn,
  StockBalanceGridRow,
} from "../services/stock-balance-arrow"

/** Match Stock Analytics / Criteria spreadsheet chrome. */
const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

const cellClass =
  "p-0 border-r border-b border-border/60 last:border-r-0 align-middle"
const headClass =
  "h-7 px-2 py-0 border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-none text-muted-foreground bg-muted/40 align-middle"

type StockBalanceResultGridProps = {
  columns: StockBalanceColumn[]
  rows: StockBalanceGridRow[]
  /** Show per-column filter inputs under the header. */
  showFilterRow?: boolean
  onShowFilterRowChange?: (open: boolean) => void
  title?: string
  className?: string
}

/** Flat Arrow result spreadsheet for Stock Balance. */
export function StockBalanceResultGrid({
  columns,
  rows,
  showFilterRow = false,
  onShowFilterRowChange,
  title = "Stock Balance",
  className,
}: StockBalanceResultGridProps) {
  const [filters, setFilters] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    setFilters({})
  }, [columns, rows])

  const visibleRows = React.useMemo(() => {
    if (!showFilterRow) return rows
    const active = Object.entries(filters).filter(([, q]) => q.trim())
    if (active.length === 0) return rows
    return rows.filter((row) =>
      active.every(([colName, q]) => {
        const cell = String(row.values[colName] ?? "").toLowerCase()
        return cell.includes(q.trim().toLowerCase())
      })
    )
  }, [rows, filters, showFilterRow])

  const subtitle =
    columns.length === 0
      ? "No columns"
      : `${visibleRows.length} row${visibleRows.length === 1 ? "" : "s"}`

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
              variant={showFilterRow ? "secondary" : "outline"}
              size="icon"
              className="size-7 shrink-0"
              disabled={columns.length === 0}
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

      {columns.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
          No columns
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[42rem]">
            <div className="sticky top-0 z-10 bg-card">
              <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
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
                    <tr>
                      {columns.map((col, index) => (
                        <th key={col.name} className={cellClass}>
                          <Input
                            className={cn(
                              cellInputClass,
                              "shadow-none",
                              col.align === "right" && "text-right"
                            )}
                            placeholder={index === 0 ? "Filter…" : undefined}
                            value={filters[col.name] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value
                              setFilters((prev) => ({
                                ...prev,
                                [col.name]: value,
                              }))
                            }}
                          />
                        </th>
                      ))}
                    </tr>
                  ) : null}
                </thead>
              </table>
            </div>

            <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    {columns.map((col) => (
                      <td
                        key={col.name}
                        className={cn(
                          cellClass,
                          col.align === "left" ? "text-left" : "text-right"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-7 min-w-0 items-center px-2 tabular-nums text-foreground",
                            col.align === "right" && "justify-end"
                          )}
                        >
                          {row.values[col.name] ?? ""}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
