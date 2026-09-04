"use client";

import * as React from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/utils/cn"
import { formatCount } from "@/utils/format"
import { formatGridCellValue } from "@/utils/format-cell"
import { matchCellFilter } from "@/utils/filter-matcher"
import {
  VirtualSpreadsheet,
  cellInputClass,
  cellClass,
} from "@/features/jobs/components/VirtualSpreadsheet"
import type {
  StockBalanceColumn,
  StockBalanceGridRow,
} from "../services/stock-balance-arrow"

type StockBalanceResultGridProps = {
  columns: StockBalanceColumn[]
  rows: StockBalanceGridRow[]
  /** Job'dan gelen toplam satır sayısı (alt başlıkta "N / M rows" için). */
  totalRows?: number | null
  /** Show per-column filter inputs under the header. */
  showFilterRow?: boolean
  onShowFilterRowChange?: (open: boolean) => void
  /** Listenin sonuna yaklaşılınca bir sonraki batch'i ister (lazy). */
  onNeedMore?: () => void
  hasMore?: boolean
  loadingMore?: boolean
  title?: string
  className?: string
}

/** Flat Arrow result spreadsheet for Stock Balance. */
export function StockBalanceResultGrid({
  columns,
  rows,
  totalRows,
  showFilterRow = false,
  onShowFilterRowChange,
  onNeedMore,
  hasMore = false,
  loadingMore = false,
  title = "Stock Balance",
  className,
}: StockBalanceResultGridProps) {
  const [filters, setFilters] = React.useState<Record<string, string>>({})
  const [syncedColumns, setSyncedColumns] = React.useState(columns)

  // Sütunlar değişince filtreleri başa al — render sırasında state ayarlama.
  if (syncedColumns !== columns) {
    setSyncedColumns(columns)
    setFilters({})
  }

  const handleFilterChange = (colName: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [colName]: value,
    }))
  }

  const visibleRows = React.useMemo(() => {
    if (!showFilterRow) return rows
    const active = Object.entries(filters).filter(([, q]) => q.trim())
    if (active.length === 0) return rows
    return rows.filter((row) =>
      active.every(([colName, q]) => {
        const rawValue = row.values ? row.values[colName] : (row as unknown as Record<string, unknown>)[colName]
        return matchCellFilter(rawValue, q)
      })
    )
  }, [rows, filters, showFilterRow])

  const hasActiveFilters = React.useMemo(
    () => Object.values(filters).some((q) => q.trim().length > 0),
    [filters]
  )

  const onNeedMoreRef = React.useRef(onNeedMore)
  React.useEffect(() => {
    onNeedMoreRef.current = onNeedMore
  })

  // Filtre aktifken tüm verideki eşleşmeleri bulabilmek için kalan akışı arka planda güvenle tamamla
  React.useEffect(() => {
    if (!hasActiveFilters || !hasMore || loadingMore) return

    const timer = setTimeout(() => {
      onNeedMoreRef.current?.()
    }, 40)

    return () => clearTimeout(timer)
  }, [hasActiveFilters, hasMore, loadingMore, rows.length])

  const isStreaming = hasMore || loadingMore

  let subtitleNode: React.ReactNode

  if (columns.length === 0) {
    subtitleNode = "Waiting for data..."
  } else if (isStreaming) {
    if (hasActiveFilters) {
      subtitleNode = (
        <div className="flex items-center gap-1.5">
          <span>{formatCount(visibleRows.length)} match{visibleRows.length === 1 ? "" : "es"}</span>
          <Badge
            variant="outline"
            className="h-4.5 gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-400"
          >
            <Spinner className="size-2.5" />
            <span>{formatCount(rows.length)}{totalRows != null ? ` / ${formatCount(totalRows)}` : ""} streamed</span>
          </Badge>
        </div>
      )
    } else {
      subtitleNode = (
        <Badge
          variant="outline"
          className="h-4.5 gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-400"
        >
          <Spinner className="size-2.5" />
          <span>{formatCount(rows.length)}{totalRows != null ? ` / ${formatCount(totalRows)}` : ""} streamed</span>
        </Badge>
      )
    }
  } else {
    const displayCount = hasActiveFilters && totalRows != null
      ? `${formatCount(visibleRows.length)} / ${formatCount(totalRows)} (filtered)`
      : totalRows != null
        ? `${formatCount(totalRows)} rows`
        : `${formatCount(visibleRows.length)} rows`

    subtitleNode = <span>{displayCount}</span>
  }

  return (
    <VirtualSpreadsheet
      columns={columns}
      items={visibleRows}
      title={title}
      subtitle={subtitleNode}
      className={className}
      resetKey={columns}
      showFilterRow={showFilterRow}
      onToggleFilterRow={onShowFilterRowChange}
      onNeedMore={onNeedMore}
      hasMore={hasMore}
      loadingMore={loadingMore}
      renderFilterCell={(col) => {
        const val = filters[col.name] ?? ""
        return (
          <div className="group relative flex w-full items-center">
            <Input
              className={cn(
                cellInputClass,
                "shadow-none",
                val && "pr-5",
                col.align === "right" && "text-right"
              )}
              placeholder={`Filter ${col.label.toLowerCase()}…`}
              value={val}
              onChange={(event) => {
                const value = event.target.value
                handleFilterChange(col.name, value)
              }}
            />
            {val ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleFilterChange(col.name, "")
                }}
                className="absolute right-1 hidden size-4 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground group-hover:flex group-focus-within:flex"
                title="Filtreyi temizle"
                aria-label="Filtreyi temizle"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        )
      }}
      renderRow={(row) => (
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
                {formatGridCellValue(
                  row.values ? row.values[col.name] : (row as unknown as Record<string, unknown>)[col.name],
                  col.align,
                  col.name.toLowerCase().includes("date") || col.name.toLowerCase().includes("tarih") ? "date" : undefined
                )}
              </div>
            </td>
          ))}
        </tr>
      )}
    />
  )
}
