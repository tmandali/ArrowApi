"use client";

import { useYulaGridStore } from "@/lib/stores/grid";
import * as React from "react"
import { RotateCw, X, DatabaseIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useDuckReport, type ReportColumnMeta } from "../hooks/use-duck-report"
import { duckDbClient } from "@/services/duckdb"

import { deriveColumnKind } from "../lib/column-type-utils"
import { computeColumnValuesDigest } from "@/lib/grid-column-values"
import { resetGridCustomView } from "@/lib/yula-client-tools"
import { formatGridCellValue, formatColumnLabel } from "@/utils/format-cell"
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
  /** Rapor şemasının x-ai.columnDescriptions'ı — LLM kolon semantiği grounding'i */
  columnDescriptions?: Record<string, string>
  /** Aktif raporun scope'u — get_report_schema aracının kimliği */
  reportScope?: string
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

/**
 * columnTypes haritası Arrow/DuckDB şemasından türetilir (column-type-utils).
 * Yula'ya şema grounding olarak verilir; filtre değerlerinin kolon tipiyle
 * uyumu hem modele öğretilir hem execution anında jenerik doğrulanır.
 */

export function ArrowReportGrid({
  title = "Report Result",
  jobId,
  jobUrl,
  columns = [],
  expectedTotalRows,
  initialRows = [],
  showFilterRow = false,
  onShowFilterRowChange,
  columnDescriptions,
  reportScope,
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

  // DuckDB tablo adı — şema (DESCRIBE), kolon değerleri ve Yula bağlamı için
  const duckTableName = jobId
    ? `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}`
    : "current_report"

  // Yula set_grid_query: özel görünüm (gruplama/aggregate) aktif mi?
  const customQuerySql = useYulaGridStore((s) => s.customQuerySql)
  const customQueryTitle = useYulaGridStore((s) => s.customQueryTitle)

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
    customSql: customQuerySql,
  })

  const effectiveColumns = React.useMemo<SpreadsheetColumn[]>(() => {
    // Özel SQL modunda kolonlar sorgu sonucundan gelir (gruplama/aggregate adları)
    if (customQuerySql) {
      return discoveredCols.map((c) => ({
        name: c.name,
        label: c.label && c.label !== c.name ? c.label : formatColumnLabel(c.name),
        align: c.align ?? (c.isNumeric ? "right" : "left"),
      }))
    }
    if (columns.length > 0) return columns
    return discoveredCols.map((c) => ({
      name: c.name,
      label: c.label && c.label !== c.name ? c.label : formatColumnLabel(c.name),
      align: c.align ?? (c.isNumeric ? "right" : "left"),
    }))
  }, [customQuerySql, columns, discoveredCols])

  /**
   * Arrow/DuckDB şemasından türetilmiş kolon tip haritası.
   * Yula'ya (LLM) şema grounding olarak verilir; filtre değerlerinin
   * kolon tipiyle (tarih/sayı/metin) uyumlu olmasını hem modele öğretir hem
   * execution anında jenerik olarak doğrular.
   */
  // DuckDB DESCRIBE — TİPLERİN YETKİLİ KAYNAĞI. columns prop'u hizalama
  // (align) sezgisiyle gelir ve duckType taşımaz; "Qty (text)" gibi yanlış
  // grounding modelin araç çağırmayı reddetmesine yol açıyordu.
  const [describedCols, setDescribedCols] = React.useState<
    | Awaited<ReturnType<typeof duckDbClient.describeTable>>
    | undefined
  >()
  React.useEffect(() => {
    if (!jobId) return
    let cancelled = false
    void (async () => {
      try {
        const cols = await duckDbClient.describeTable(duckTableName)
        if (!cancelled && cols.length > 0) setDescribedCols(cols)
      } catch {
        // DESCRIBE hazır olmadıysa sezgisel map devrede kalır
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duckTableName])

  const columnTypes = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const c of metaColumns) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    for (const c of discoveredCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    // Öncelik: DuckDB DESCRIBE > keşif > align sezgisi
    if (describedCols) {
      for (const c of describedCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    }
    return map
  }, [metaColumns, discoveredCols, describedCols])

  /** Tool tanımı içinde LLM'e giden tipli kolon özeti. */
  
  const displayRows = customQuerySql
    ? rows
    : rows.length > 0
      ? rows
      : initialRows

  const sampleRows = React.useMemo(() => {
    return displayRows.slice(0, 3).map((r) => {
      const simplified: Record<string, unknown> = {}
      for (const col of effectiveColumns) {
        if (r[col.name] !== undefined) simplified[col.name] = r[col.name]
      }
      return simplified
    })
  }, [displayRows, effectiveColumns])

  /**
   * Kolon sindirimi (shape + örnek değer) — LLM bağlamı için kompakt
   * "hangi kolon neye benzer" özeti (ilk 20 satırdan). Yetkili çözüm yine
   * execution katmanındadır; bu özet yalnızca ipucu kalitesini artırır.
   */

  // Kardinalite sözlüğü: düşük kardinaliteli metin/bool kolonların GERÇEK
  // değerleri (DuckDB DISTINCT) — Yula kategori değerlerini uydurmasın.
  // Tablo başına (tipler hazır olunca) bir kez hesaplanır; filtre değişimi
  // yeniden tetiklemez.
  const [columnValuesDigest, setColumnValuesDigest] = React.useState<
    Record<string, string[]> | undefined
  >()
  const columnValuesDoneRef = React.useRef("")
  React.useEffect(() => {
    const key = `${duckTableName}:${Object.keys(columnTypes).length > 0 ? 1 : 0}:${totalRows ?? ""}`
    if (columnValuesDoneRef.current === key) return
    columnValuesDoneRef.current = key
    let cancelled = false
    void (async () => {
      const digest = await computeColumnValuesDigest({
        tableName: duckTableName,
        columns: effectiveColumns.map((c) => c.name),
        columnTypes,
        rowCount: totalRows,
      })
      if (!cancelled) setColumnValuesDigest(digest ?? undefined)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duckTableName, columnTypes, totalRows])

  // Parent callback bağlı değilse (örn. Yula içine gömülü grid) AI filtre
  // satırını kendisi açabilsin diye dahil yedek durum.
  const [internalShowFilterRow, setInternalShowFilterRow] = React.useState(false);
  const effectiveShowFilterRow = onShowFilterRowChange ? showFilterRow : (showFilterRow || internalShowFilterRow);
  const revealFilterRow = React.useCallback(() => {
    if (onShowFilterRowChange) onShowFilterRowChange(true);
    else setInternalShowFilterRow(true);
  }, [onShowFilterRowChange]);

  // Yula aracının yazdığı değeri doğrudan kendi filtre hücremize uygula
  React.useEffect(() => {
    const store = useYulaGridStore.getState();
    store.setRuntimeApi({
      applyFilter: (column, value) => {
        setFilter(column, value);
        revealFilterRow();
      },
      clearAll: () => {
        effectiveColumns.forEach((c) => setFilter(c.name, ""));
      },
    });
    return () => {
      useYulaGridStore.getState().setRuntimeApi(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFilter, effectiveColumns]);

  // Bağlam aynası senkronu: gridin GERÇEK filtre state'i tek doğruluk kaynağıdır.
  // Kullanıcı filtre hücrelerinden temizlerken mağaza aynası bayat kalıyordu →
  // Yula var olmayan filtrelerle analize devam ediyordu.
  React.useEffect(() => {
    useYulaGridStore.getState().setFilters(filters);
  }, [filters]);

  // Yula bağlamı — TEK yerden doğrudan store kaydı (aracı katman yok).
  // Gridin tüm verisi burada hesaplanır; veri geldikçe (DESCRIBE, örnek
  // satırlar, değer sözlüğü) spec otomatik güncellenir.
  const yulaContext = React.useMemo(
    () => ({
      tableName: duckTableName,
      title,
      columns: effectiveColumns.map((c) => c.name),
      rowCount: totalFiltered,
      columnTypes,
      sampleRows,
      columnValues: columnValuesDigest,
      columnDescriptions,
      reportScope,
    }),
    [duckTableName, title, effectiveColumns, totalFiltered, columnTypes, sampleRows, columnValuesDigest, columnDescriptions, reportScope],
  )

  React.useEffect(() => {
    useYulaGridStore.getState().register(yulaContext)
  }, [yulaContext])

  React.useEffect(() => {
    return () => {
      useYulaGridStore.getState().unregister()
    }
  }, [])

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
      <span>Saving report…</span>
    </span>
  ) : isStreaming && displayRows.length > 0 ? (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      Streaming: {formatCount(streamedRows)}
      {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows…
      {progressPercent != null ? ` (${progressPercent}%)` : ""}
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
      loading={isStreaming || isSavingDisk || isLoadingQuery || (effectiveColumns.length === 0 && Boolean(jobId))}
      emptyMessage={isStreaming || isSavingDisk || isLoadingQuery ? "Loading report..." : "No data found"}
      progressValue={progressPercent}
      resetKey={`${jobId}:${customQuerySql ?? ""}`}
      showFilterRow={effectiveShowFilterRow}
      onToggleFilterRow={onShowFilterRowChange}
      headerActions={
        <>
          {headerActions}
          {customQuerySql ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 max-w-56 shrink-0 gap-1.5 text-xs"
              onClick={() => void resetGridCustomView()}
              title={`"${customQueryTitle ?? "Aktif Veri Kümesi"}" görünümündesiniz — kapatıp raporun tam haline dönmek için tıklayın`}
              aria-label="Aktif görünümü kapat, rapora dön"
            >
              <DatabaseIcon className="size-3.5 shrink-0 text-orange-600/80 dark:text-orange-400/80" />
              <span className="truncate">
                {customQueryTitle ?? "Aktif Veri Kümesi"}
              </span>
              <X className="size-3 shrink-0" />
            </Button>
          ) : null}
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
                  {formatGridCellValue(values[col.name], col.align)}
                </div>
              </td>
            ))}
          </tr>
        )
      }}
    />
  )
}
