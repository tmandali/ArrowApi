import * as React from "react"
import { RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useDuckReport, type ReportColumnMeta } from "../hooks/use-duck-report"
import {
  VirtualSpreadsheet,
  cellInputClass,
  cellClass,
  type SpreadsheetColumn,
} from "@/features/stock/item/components/VirtualSpreadsheet"
import { cn } from "@/utils/cn"
import { formatCount } from "@/utils/format"

export type ArrowReportGridProps = {
  title?: string
  jobId: string | null | undefined
  jobUrl: string | null | undefined
  columns?: SpreadsheetColumn[]
  expectedTotalRows?: number | null
  initialRows?: Record<string, unknown>[]
  showFilterRow?: boolean
  onShowFilterRowChange?: (open: boolean) => void
  className?: string
  headerActions?: React.ReactNode
  onError?: (err: string | null) => void
}

/**
 * Uygulama genelinde tüm Arrow raporları için ortak, DuckDB Wasm + OPFS destekli
 * yüksek performanslı sanal spreadsheet bileşeni.
 *
 * Herhangi bir workspace'teki (Stok, Satış, Muhasebe, Üretim vb.) rapor için
 * tek satırla bağlanır; 100k-1M+ satırlık verilerde anında SQL filtreleme sağlar.
 */
export function ArrowReportGrid({
  title = "Rapor Sonucu",
  jobId,
  jobUrl,
  columns = [],
  expectedTotalRows,
  initialRows = [],
  showFilterRow = false,
  onShowFilterRowChange,
  className,
  headerActions,
  onError,
}: ArrowReportGridProps) {
  const metaColumns = React.useMemo<ReportColumnMeta[]>(
    () =>
      columns.map((col) => ({
        name: col.name,
        label: col.label,
        align: col.align,
        isNumeric: col.align === "right",
      })),
    [columns]
  )

  const {
    columns: discoveredCols,
    rows,
    totalRows,
    totalFiltered,
    streamedRows,
    progressPercent,
    filters,
    setFilter,
    loadMore,
    hasMore,
    isStreaming,
    isSavingDisk,
    isLoadingQuery,
    refresh,
  } = useDuckReport({
    jobId,
    jobUrl,
    columns: metaColumns,
    expectedTotalRows,
    onError,
  })

  const effectiveColumns = React.useMemo<SpreadsheetColumn[]>(() => {
    if (columns.length > 0) return columns
    return discoveredCols.map((c) => ({
      name: c.name,
      label: c.label ?? c.name,
      align: c.align ?? (c.isNumeric ? "right" : "left"),
    }))
  }, [columns, discoveredCols])

  const displayRows = rows.length > 0 ? rows : initialRows

  const hasActiveFilters = Object.values(filters).some((q) => q.trim().length > 0)

  const countDisplay =
    hasActiveFilters && totalRows > 0
      ? `${formatCount(totalFiltered)} / ${formatCount(totalRows)} (filtered)`
      : totalRows > 0
        ? `${formatCount(totalRows)} row${totalRows === 1 ? "" : "s"}`
        : `${formatCount(displayRows.length)} row${displayRows.length === 1 ? "" : "s"}`

  const streamingSubtitle = isSavingDisk ? (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
      <Spinner className="size-3" />
      <span>Writing Parquet file…</span>
    </span>
  ) : isStreaming && displayRows.length > 0 ? (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      Streaming {formatCount(streamedRows)}
      {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows…
      {progressPercent != null ? ` (%${progressPercent})` : ""}
    </span>
  ) : null

  const subtitle =
    streamingSubtitle ??
    (isStreaming || isSavingDisk || effectiveColumns.length === 0 ? null : countDisplay)

  return (
    <VirtualSpreadsheet
      columns={effectiveColumns}
      items={displayRows}
      title={title}
      subtitle={subtitle}
      className={className}
      loading={isStreaming || (isLoadingQuery && displayRows.length === 0)}
      progressValue={progressPercent}
      resetKey={jobId}
      showFilterRow={showFilterRow}
      onToggleFilterRow={onShowFilterRowChange}
      headerActions={
        <>
          {headerActions}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => void refresh()}
            disabled={isStreaming || isSavingDisk}
            title="Verileri sunucudan yeniden çek"
            aria-label="Refresh report"
          >
            <RotateCw className={cn("size-3.5", (isStreaming || isSavingDisk) && "animate-spin")} />
          </Button>
        </>
      }
      onNeedMore={loadMore}
      hasMore={hasMore}
      loadingMore={isLoadingQuery}
      renderFilterCell={(col, index) => {
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
              placeholder={index === 0 ? "Filter…" : undefined}
              value={val}
              onChange={(event) => setFilter(col.name, event.target.value)}
            />
            {val ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setFilter(col.name, "")
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
      renderRow={(row, index) => {
        const values = (row.values ?? row) as Record<string, unknown>

        return (
          <tr key={index} className="hover:bg-muted/30">
            {effectiveColumns.map((col) => (
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
                  {values[col.name] == null ? "" : String(values[col.name])}
                </div>
              </td>
            ))}
          </tr>
        )
      }}
    />
  )
}
