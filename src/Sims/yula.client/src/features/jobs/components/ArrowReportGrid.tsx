"use client";

import { useYulaGridStore } from "@/lib/stores/grid";
import * as React from "react"
import {
  RotateCw,
  X,
  DatabaseIcon,
  TriangleAlert,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  Filter,
  Download,
  Database,
  FileArchive,
  EyeOff,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDuckReport, type ReportColumnMeta } from "../hooks/use-duck-report"
import { duckDbClient } from "@/services/duckdb"
import { opfsReportCache } from "@/services/opfs/opfs-cache"
import { exportOpfsMergedParquet } from "@/services/opfs/opfs-parquet-merge"

import { deriveColumnKind } from "../lib/column-type-utils"
import { computeColumnValuesDigest } from "@/lib/grid-column-values"
import { resetGridCustomView } from "@/lib/yula-client-tools"
import { formatGridCellValue, formatColumnLabel } from "@/utils/format-cell"
import { buildCombinedWhereClause } from "@/services/duckdb/filter-parser"
import { VirtualSpreadsheet } from "./VirtualSpreadsheet"
import {
  cellInputClass,
  cellClass,
  type SpreadsheetColumn,
  type ColumnAggregationConfig,
  type ColumnAggregationValues,
  buildDuckDbAggregationSql,
  formatAggregatedValue,
  AGGREGATION_SHORT_LABELS,
  type AiSqlView,
} from "./virtual-spreadsheet"
import { cn } from "@/utils/cn"
import { formatCount } from "@/utils/format"

export type ArrowReportGridProps = {
  title?: string
  jobId: string | null | undefined
  jobUrl: string | null | undefined
  columns?: SpreadsheetColumn[]
  expectedTotalRows?: number | null
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
 * Uygulama genelinde tüm Arrow raporları için ortak, Wasm + OPFS destekli
 * yüksek performanslı sanal spreadsheet bileşeni.
 *
 * Herhangi bir workspace'teki (Stok, Satış, Muhasebe, Üretim vb.) rapor için
 * tek satırla bağlanır; 100k-1M+ satırlık verilerde anında SQL filtreleme sağlar.
 */

/**
 * columnTypes haritası Arrow/şemasından türetilir (column-type-utils).
 * Yula'ya şema grounding olarak verilir; filtre değerlerinin kolon tipiyle
 * uyumu hem modele öğretilir hem execution anında jenerik doğrulanır.
 */

export function ArrowReportGrid({
  title = "Report Result",
  jobId,
  jobUrl,
  columns = [],
  expectedTotalRows,
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

  // tablo adı — şema (DESCRIBE), kolon değerleri ve Yula bağlamı için
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
    isPartial,
    isFromCache,
    isLoadingQuery,
    refresh,
    sortBy,
    sortDesc,
    toggleSort,
    setSorting,
    applyFilters: duckApplyFilters,
    clearFilters,
  } = useDuckReport({
    jobId,
    jobUrl,
    columns: metaColumns,
    expectedTotalRows,
    onError,
    customSql: customQuerySql,
  })

  /**
   * Arrow/şemasından türetilmiş kolon tip haritası.
   * Yula'ya (LLM) şema grounding olarak verilir; filtre değerlerinin
   * kolon tipiyle (tarih/sayı/metin) uyumlu olmasını hem modele öğretir hem
   * execution anında jenerik olarak doğrular.
   */
  // DESCRIBE — TİPLERİN YETKİLİ KAYNAĞI. columns prop'u hizalama
  // (align) sezgisiyle gelir ve duckType taşımaz; "Qty (text)" gibi yanlış
  // grounding modelin araç çağırmayı reddetmesine yol açıyordu.
  const [describedCols, setDescribedCols] = React.useState<
    | Awaited<ReturnType<typeof duckDbClient.describeTable>>
    | undefined
  >()

  React.useEffect(() => {
    setDescribedCols(undefined)
  }, [duckTableName])

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
  }, [duckTableName, discoveredCols.length, jobId])

  const columnTypes = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const c of metaColumns) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    for (const c of discoveredCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    // Öncelik: DESCRIBE > keşif > align sezgisi
    if (describedCols) {
      for (const c of describedCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    }
    return map
  }, [metaColumns, discoveredCols, describedCols])

  // Şemadan gelen fiziksel ham DuckDB tipleri (BIGINT, INTEGER, DECIMAL, DATE...)
  const columnDuckTypes = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const c of metaColumns) if (c.duckType) map[c.name] = c.duckType
    for (const c of discoveredCols) if (c.duckType) map[c.name] = c.duckType
    if (describedCols) {
      for (const c of describedCols) if (c.duckType) map[c.name] = c.duckType
    }
    return map
  }, [metaColumns, discoveredCols, describedCols])

  const effectiveColumns = React.useMemo<SpreadsheetColumn[]>(() => {
    // Özel SQL modunda kolonlar sorgu sonucundan gelir (gruplama/aggregate adları)
    if (customQuerySql) {
      return discoveredCols.map((c) => ({
        name: c.name,
        label: c.label && c.label !== c.name ? c.label : formatColumnLabel(c.name),
        align: c.align ?? (c.isNumeric ? "right" : "left"),
        kind: columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.isNumeric),
        duckType: columnDuckTypes[c.name] ?? c.duckType,
      }))
    }
    if (columns.length > 0) {
      return columns.map((c) => ({
        ...c,
        kind: c.kind ?? columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.align === "right"),
        duckType: c.duckType ?? columnDuckTypes[c.name],
      }))
    }
    return discoveredCols.map((c) => ({
      name: c.name,
      label: c.label && c.label !== c.name ? c.label : formatColumnLabel(c.name),
      align: c.align ?? (c.isNumeric ? "right" : "left"),
      kind: columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.isNumeric),
      duckType: columnDuckTypes[c.name] ?? c.duckType,
    }))
  }, [customQuerySql, columns, discoveredCols, columnTypes, columnDuckTypes])

  const storageKey = React.useMemo(() => {
    if (reportScope) return `arrow_grid_${reportScope}`
    if (title && title !== "Report Result") {
      return `arrow_grid_${title.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`
    }
    return undefined
  }, [reportScope, title])

  // AI SQL Görünümleri Yönetimi
  const [aiViews, setAiViews] = React.useState<AiSqlView[]>([])
  const [activeAiViewId, setActiveAiViewId] = React.useState<string | null>(null)

  // LocalStorage'dan AI görünümlerini yükle
  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(`${storageKey}_ai_views`)
      if (raw) {
        const parsed = JSON.parse(raw) as AiSqlView[]
        if (Array.isArray(parsed)) {
          setAiViews(parsed)
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey])

  // customQuerySql değiştiğinde (AI yeni bir SQL ürettiğinde) otomatik kaydet ve aktif et
  React.useEffect(() => {
    if (!customQuerySql) {
      setActiveAiViewId(null)
      return
    }

    setAiViews((prev) => {
      const existing = prev.find((v) => v.sql.trim() === customQuerySql.trim())
      if (existing) {
        setActiveAiViewId(existing.id)
        return prev
      }

      const newView: AiSqlView = {
        id: `ai_${Date.now()}`,
        title: customQueryTitle || `AI Görünümü ${prev.length + 1}`,
        sql: customQuerySql,
        createdAt: Date.now(),
      }
      setActiveAiViewId(newView.id)
      const next = [...prev, newView]

      if (storageKey && typeof window !== "undefined") {
        try {
          localStorage.setItem(`${storageKey}_ai_views`, JSON.stringify(next))
        } catch {
          // ignore
        }
      }
      return next
    })
  }, [customQuerySql, customQueryTitle, storageKey])

  const handleSelectAiView = React.useCallback(
    (viewId: string | null) => {
      if (!viewId) {
        useYulaGridStore.getState().setCustomQuerySql(null, null)
        setActiveAiViewId(null)
        return
      }
      const target = aiViews.find((v) => v.id === viewId)
      if (target) {
        useYulaGridStore.getState().setCustomQuerySql(target.sql, target.title)
        setActiveAiViewId(target.id)
      }
    },
    [aiViews]
  )

  const handleRenameAiView = React.useCallback(
    (viewId: string, nextTitle: string) => {
      setAiViews((prev) => {
        const next = prev.map((v) =>
          v.id === viewId ? { ...v, title: nextTitle } : v
        )
        if (storageKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(`${storageKey}_ai_views`, JSON.stringify(next))
          } catch {
            // ignore
          }
        }
        return next
      })

      if (activeAiViewId === viewId && customQuerySql) {
        useYulaGridStore.getState().setCustomQuerySql(customQuerySql, nextTitle)
      }
    },
    [activeAiViewId, customQuerySql, storageKey]
  )

  const handleDeleteAiView = React.useCallback(
    (viewId: string) => {
      setAiViews((prev) => {
        const next = prev.filter((v) => v.id !== viewId)
        if (storageKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(`${storageKey}_ai_views`, JSON.stringify(next))
          } catch {
            // ignore
          }
        }
        return next
      })

      if (activeAiViewId === viewId) {
        useYulaGridStore.getState().setCustomQuerySql(null, null)
        setActiveAiViewId(null)
      }
    },
    [activeAiViewId, storageKey]
  )

  const hasActiveFilters = React.useMemo(
    () => Object.values(filters).some((q) => q.trim().length > 0),
    [filters]
  )

  const filterKey = React.useMemo(() => JSON.stringify(filters), [filters])

  const displayRows = rows

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
  // değerleri (DISTINCT) — Yula kategori değerlerini uydurmasın.
  // Tablo başına (tipler hazır olunca) bir kez hesaplanır; filtre değişimi
  // yeniden tetiklemez.
  const [columnValuesDigest, setColumnValuesDigest] = React.useState<
    Record<string, string[]> | undefined
  >()
  const columnValuesDoneRef = React.useRef("")
  React.useEffect(() => {
    // Rapor hala akıyorsa (streaming) veya toplam satır sayısı 5 milyonu aşıyorsa digest sorgusu koşturma
    if (isStreaming || !totalRows || totalRows > 5_000_000) return
    const key = `${duckTableName}:${Object.keys(columnTypes).length > 0 ? 1 : 0}:${totalRows ?? ""}`
    if (columnValuesDoneRef.current === key) return
    columnValuesDoneRef.current = key
    const abortCtrl = new AbortController()
    void (async () => {
      try {
        const digest = await computeColumnValuesDigest({
          tableName: duckTableName,
          columns: effectiveColumns.map((c) => c.name),
          columnTypes,
          rowCount: totalRows,
          signal: abortCtrl.signal,
          client: duckDbClient,
        })
        if (!abortCtrl.signal.aborted) setColumnValuesDigest(digest ?? undefined)
      } catch {
        // Digest is optional metadata, never crash the report grid
      }
    })()
    return () => {
      abortCtrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duckTableName, columnTypes, totalRows, isStreaming])

  // Parent callback bağlı değilse (örn. Yula içine gömülü grid) AI filtre
  // satırını kendisi açabilsin diye dahil yedek durum.
  const [internalShowFilterRow, setInternalShowFilterRow] = React.useState(false);
  const effectiveShowFilterRow = onShowFilterRowChange ? showFilterRow : (showFilterRow || internalShowFilterRow);
  const revealFilterRow = React.useCallback(() => {
    if (onShowFilterRowChange) onShowFilterRowChange(true);
    else setInternalShowFilterRow(true);
  }, [onShowFilterRowChange]);

  // AI & Kontrollü Grid Düzeni Durumu (Kolon Gizleme, Sabitleme, Sıralama Düzeni)
  const [hiddenColumns, setHiddenColumns] = React.useState<string[] | undefined>(undefined);
  const [pinnedColumns, setPinnedColumns] = React.useState<string[] | undefined>(undefined);
  const [columnOrder, setColumnOrder] = React.useState<string[] | undefined>(undefined);

  // Anlık snapshot referansı (her render'da güncellenir, runtimeApi'yi yeniden tetiklemez)
  const latestGridStateRef = React.useRef({
    sortBy,
    sortDesc,
    hiddenColumns: hiddenColumns ?? [],
    pinnedColumns: pinnedColumns ?? [],
    columnOrder: columnOrder ?? [],
    filters,
    rowCount: totalFiltered,
    effectiveColumns,
  });
  React.useEffect(() => {
    latestGridStateRef.current = {
      sortBy,
      sortDesc,
      hiddenColumns: hiddenColumns ?? [],
      pinnedColumns: pinnedColumns ?? [],
      columnOrder: columnOrder ?? [],
      filters,
      rowCount: totalFiltered,
      effectiveColumns,
    };
  });

  const handleExportClickRef = React.useRef<(format?: "xlsx" | "parquet" | "csv" | "gz") => void>(undefined);

  // Yula aracının çağrılarını doğrudan grid ve DuckDB motoruna bağla
  React.useEffect(() => {
    const store = useYulaGridStore.getState();
    store.setRuntimeApi({
      applyFilter: (column, value) => {
        setFilter(column, value);
        revealFilterRow();
      },
      applyFilters: (newFilters, clearOthers) => {
        duckApplyFilters(newFilters, clearOthers);
        revealFilterRow();
      },
      clearAll: () => {
        clearFilters();
      },
      setSort: (column, direction) => {
        if (!column || direction === null) {
          setSorting(null, false);
        } else {
          setSorting(column, direction === "desc");
        }
      },
      setVisibleColumns: (visibleCols) => {
        const visibleSet = new Set(visibleCols);
        const toHide = effectiveColumns
          .map((c) => c.name)
          .filter((name) => !visibleSet.has(name));
        setHiddenColumns(toHide);
      },
      setHiddenColumns: (toHide) => {
        setHiddenColumns(toHide);
      },
      setPinnedColumns: (pinned) => {
        setPinnedColumns(pinned);
      },
      setColumnOrder: (order) => {
        setColumnOrder(order);
      },
      resetLayout: (options) => {
        const opt = options ?? { filters: true, sort: true, columns: true };
        if (opt.filters) clearFilters();
        if (opt.sort) setSorting(null, false);
        if (opt.columns) {
          setHiddenColumns([]);
          setPinnedColumns(undefined);
          setColumnOrder(undefined);
        }
      },
      exportGrid: async (format) => {
        handleExportClickRef.current?.(format);
      },
      getGridState: () => {
        const s = latestGridStateRef.current;
        return {
          sortBy: s.sortBy,
          sortDesc: s.sortDesc,
          hiddenColumns: s.hiddenColumns,
          pinnedColumns: s.pinnedColumns,
          columnOrder:
            s.columnOrder.length > 0
              ? s.columnOrder
              : s.effectiveColumns.map((c) => c.name),
          filters: s.filters,
          rowCount: s.rowCount,
        };
      },
    });
    return () => {
      useYulaGridStore.getState().setRuntimeApi(null);
    };
  }, [
    setFilter,
    duckApplyFilters,
    clearFilters,
    setSorting,
    effectiveColumns,
    revealFilterRow,
  ]);

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

  const countDisplay =
    hasActiveFilters && totalRows > 0 ? (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        {isLoadingQuery ? (
          <Spinner className="size-3 text-muted-foreground animate-spin" aria-hidden />
        ) : null}
        <span>
          {formatCount(totalFiltered)} / {formatCount(totalRows)} (filtered)
        </span>
      </span>
    ) : totalRows > 0 ? (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        {isLoadingQuery ? (
          <Spinner className="size-3 text-muted-foreground animate-spin" aria-hidden />
        ) : null}
        <span>
          {formatCount(totalRows)} row{totalRows === 1 ? "" : "s"}
        </span>
      </span>
    ) : (
      `${formatCount(displayRows.length)} row${displayRows.length === 1 ? "" : "s"}`
    )

  const streamingSubtitle = isSavingDisk ? (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
      <Spinner className="size-3" />
      <span>Saving report…</span>
    </span>
  ) : isStreaming && displayRows.length > 0 ? (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      {isFromCache ? "Streaming (local cache)" : "Streaming"}:{" "}
      {formatCount(streamedRows)}
      {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows…
      {progressPercent != null ? ` (${progressPercent}%)` : ""}
    </span>
  ) : null

  const partialSubtitle =
    !isStreaming && !isSavingDisk && isPartial ? (
      <span
        className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 tabular-nums dark:text-amber-400"
        title="Tarayıcı WebAssembly bellek sınırı doldu — raporun yalnızca sunucudan inen kısmı gösteriliyor. Yenile butonu tekrar dener."
      >
        <TriangleAlert className="size-3 shrink-0" />
        Partial: {formatCount(totalRows)}
        {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows
      </span>
    ) : null
  const numericColumns = React.useMemo(() => {
    const set = new Set<string>()
    for (const col of effectiveColumns) {
      if (col.align === "right" || col.kind === "number") {
        set.add(col.name)
      }
    }
    return set
  }, [effectiveColumns])

  const [aggregationConfigs, setAggregationConfigs] = React.useState<ColumnAggregationConfig>({})
  const [duckDbAggregations, setDuckDbAggregations] = React.useState<ColumnAggregationValues | undefined>(undefined)
  const [showFooterRow, setShowFooterRow] = React.useState(true)

  // DuckDB üzerinde aktif filtreler ve aggregationConfigs ile alt toplamları hesapla
  React.useEffect(() => {
    if (!duckTableName || effectiveColumns.length === 0 || isStreaming || isSavingDisk) {
      return
    }
    const hasAny = Object.values(aggregationConfigs).some((t) => t && t !== "none")
    if (!hasAny) {
      setDuckDbAggregations(undefined)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const where = buildCombinedWhereClause(filters, numericColumns)
        const query = buildDuckDbAggregationSql(duckTableName, where, effectiveColumns, aggregationConfigs)
        if (!query) return
        const rows = await duckDbClient.executeCustomSql(query.sql)
        if (cancelled || !rows || rows.length === 0) return
        const row = rows[0]
        const values: ColumnAggregationValues = {}
        for (const item of query.activeColumns) {
          const val = row[item.alias] as number | string | null | undefined
          const col = effectiveColumns.find((c) => c.name === item.name)
          if (col) {
            values[item.name] = {
              type: item.type,
              value: val ?? null,
              formatted: formatAggregatedValue(item.type, val, col),
              label: AGGREGATION_SHORT_LABELS[item.type],
            }
          }
        }
        setDuckDbAggregations(values)
      } catch {
        // Tablo henüz oluşmamışsa veya geçici sorgu hatası varsa
      }
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [duckTableName, filters, aggregationConfigs, effectiveColumns, numericColumns, isStreaming, isSavingDisk])

  const [isExporting, setIsExporting] = React.useState(false)
  const [exportWarning, setExportWarning] = React.useState<{
    type: "warning" | "hard_limit"
    count: number
  } | null>(null)

  const runExport = React.useCallback(
    async (
      format: "xlsx" | "parquet" | "csv" | "gz" = "xlsx",
      maxTotalRows?: number
    ) => {
      setExportWarning(null)
      if (!duckTableName || isExporting || isStreaming || isSavingDisk || effectiveColumns.length === 0) return
      setIsExporting(true)
      const formatLabel =
        format === "xlsx"
          ? "Excel dosyası"
          : format === "parquet"
          ? "Parquet dosyası"
          : format === "gz"
          ? "Gzip CSV dosyası"
          : "CSV dosyası"
      const exportToastId = toast.loading(`${formatLabel} hazırlanıyor...`)
      try {
        const sanitizedTitle = (title && title !== "Report Result" ? title : "rapor")
          .toLowerCase()
          .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ_]/gi, "_")
          .replace(/_+/g, "_")
          .slice(0, 40)
        const stamp = new Date().toISOString().slice(0, 10)
        const fileName = `${sanitizedTitle}_${stamp}`

        // PARQUET ÖZEL AKIŞI: Eğer OPFS'te parquet parçaları varsa,
        // DuckDB 32-bit WASM motorunun bellek taşması (OOM) hatasını önlemek için
        // parçaları doğrudan parquet-wasm lazy stream ile birleştirip indiriyoruz.
        if (format === "parquet" && jobId) {
          const hasParts = await opfsReportCache.hasParquetParts(jobId)
          if (hasParts && !customQuerySql && Object.keys(filters).length === 0) {
            const result = await exportOpfsMergedParquet({ jobId, fileName })
            const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1)
            toast.success(
              `Parquet dosyası indirildi (${formatCount(result.totalRows)} satır / ${sizeMb} MB)`,
              { id: exportToastId }
            )
            return
          }
        }

        const result = await duckDbClient.exportReportTable({
          tableName: duckTableName,
          fileName,
          filters,
          numericColumns,
          sortBy,
          sortDesc,
          columns: effectiveColumns.map((c) => c.name),
          preferredFormat: format,
          maxTotalRows,
        })

        if (result.format === "xlsx") {
          if (result.sheetCount && result.sheetCount > 1) {
            toast.success(
              `Excel dosyası indirildi (${result.sheetCount} sayfa / ${formatCount(result.totalRows)} satır)`,
              { id: exportToastId }
            )
          } else {
            toast.success(`Excel dosyası indirildi (${result.fileName})`, {
              id: exportToastId,
            })
          }
        } else if (result.format === "parquet") {
          const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1)
          toast.success(
            `Parquet dosyası indirildi (${formatCount(result.totalRows)} satır / ${sizeMb} MB)`,
            { id: exportToastId }
          )
        } else if (result.format === "gz") {
          const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1)
          toast.success(
            `Gzip CSV indirildi (${formatCount(result.totalRows)} satır / ${sizeMb} MB)`,
            { id: exportToastId }
          )
        } else {
          toast.success(`Excel uyumlu CSV indirildi (${result.fileName})`, {
            id: exportToastId,
          })
        }
      } catch (err) {
        console.error("Export error:", err)
        // Eğer DuckDB Parquet oluştururken bellek (OOM) veya başka bir hata verdiyse
        // ve OPFS'te bu rapora ait parçalar mevcutsa, parçaları birleştirerek kullanıcıyı kurtar
        if (format === "parquet" && jobId) {
          try {
            const hasParts = await opfsReportCache.hasParquetParts(jobId)
            if (hasParts) {
              toast.loading("DuckDB bellek sınırına ulaşıldı, OPFS parçaları doğrudan birleştiriliyor...", {
                id: exportToastId,
              })
              const sanitizedTitle = (title && title !== "Report Result" ? title : "rapor")
                .toLowerCase()
                .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ_]/gi, "_")
                .replace(/_+/g, "_")
                .slice(0, 40)
              const stamp = new Date().toISOString().slice(0, 10)
              const fallbackFileName = `${sanitizedTitle}_${stamp}`
              const result = await exportOpfsMergedParquet({ jobId, fileName: fallbackFileName })
              const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1)
              toast.success(
                `Parquet dosyası indirildi (${formatCount(result.totalRows)} satır / ${sizeMb} MB)`,
                { id: exportToastId }
              )
              return
            }
          } catch (fallbackErr) {
            console.error("OPFS Parquet fallback error:", fallbackErr)
          }
        }
        toast.error("Dışa aktarma başarısız oldu", { id: exportToastId })
      } finally {
        setIsExporting(false)
      }
    },
    [
      duckTableName,
      isExporting,
      isStreaming,
      isSavingDisk,
      effectiveColumns,
      title,
      filters,
      numericColumns,
      sortBy,
      sortDesc,
      jobId,
      customQuerySql,
    ]
  )

  const handleExportClick = React.useCallback(
    (format: "xlsx" | "parquet" | "csv" | "gz" = "xlsx") => {
      if (!duckTableName || isExporting || isStreaming || isSavingDisk || effectiveColumns.length === 0) return
      const exportRowCount = hasActiveFilters ? totalFiltered : totalRows

      // Parquet ve CSV için Excel'in 1M/2M satır sınırı kısıtlayıcı değildir
      if (format === "xlsx") {
        if (exportRowCount > 2_000_000) {
          setExportWarning({ type: "hard_limit", count: exportRowCount })
          return
        }
        if (exportRowCount > 1_000_000) {
          setExportWarning({ type: "warning", count: exportRowCount })
          return
        }
      }

      void runExport(format)
    },
    [
      duckTableName,
      isExporting,
      isStreaming,
      isSavingDisk,
      effectiveColumns.length,
      hasActiveFilters,
      totalFiltered,
      totalRows,
      runExport,
    ]
  )
  React.useEffect(() => {
    handleExportClickRef.current = handleExportClick;
  }, [handleExportClick]);

  const subtitle =
    streamingSubtitle ??
    partialSubtitle ??
    (isStreaming || isSavingDisk || effectiveColumns.length === 0 ? null : countDisplay)

  return (
    <>
      <VirtualSpreadsheet
      columns={effectiveColumns}
      items={displayRows}
      title={title}
      subtitle={subtitle}
      className={className}
      loading={isStreaming || isSavingDisk || isLoadingQuery || (effectiveColumns.length === 0 && Boolean(jobId))}
      emptyMessage={isStreaming || isSavingDisk || isLoadingQuery ? "Loading report..." : "No data found"}
      progressValue={progressPercent}
      resetKey={`${jobId}:${customQuerySql ?? ""}:${filterKey}`}
      storageKey={storageKey}
      aiViews={aiViews}
      activeAiViewId={activeAiViewId}
      onSelectAiView={handleSelectAiView}
      onRenameAiView={handleRenameAiView}
      onDeleteAiView={handleDeleteAiView}
      hiddenColumns={hiddenColumns}
      onHiddenColumnsChange={setHiddenColumns}
      pinnedColumns={pinnedColumns}
      onPinnedColumnsChange={setPinnedColumns}
      columnOrder={columnOrder}
      onColumnOrderChange={setColumnOrder}
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
          {hiddenColumns && hiddenColumns.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setHiddenColumns([])}
              title={`${hiddenColumns.length} kolon gizlendi — tümünü göstermek için tıklayın`}
            >
              <EyeOff className="size-3.5 shrink-0" />
              <span>{hiddenColumns.length} gizli</span>
              <X className="size-3 shrink-0" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => void refresh()}
            disabled={isStreaming || isSavingDisk || isExporting}
            title="Verileri sunucudan yeniden çek"
            aria-label="Refresh report"
          >
            <RotateCw className={cn("size-3.5", (isStreaming || isSavingDisk) && "animate-spin")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                disabled={isStreaming || isSavingDisk || isExporting || effectiveColumns.length === 0}
                title="Export (Excel, Parquet, CSV)"
                aria-label="Export"
              >
                {isExporting ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Download className="size-3.5 text-muted-foreground" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => handleExportClick("xlsx")}
                className="cursor-pointer gap-2 py-2"
              >
                <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-xs">Excel (.xlsx)</span>
                  <span className="text-[10px] text-muted-foreground">Microsoft Excel tablosu</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExportClick("parquet")}
                className="cursor-pointer gap-2 py-2"
              >
                <Database className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-xs">Apache Parquet (.parquet)</span>
                  <span className="text-[10px] text-muted-foreground">Python, Pandas, BI — ZSTD & Hızlı</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleExportClick("gz")}
                className="cursor-pointer gap-2 py-2"
              >
                <FileArchive className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-xs">CSV (.csv.gz)</span>
                  <span className="text-[10px] text-muted-foreground">Doğrudan C++ GZIP akışı — Hızlı & Kompakt</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      showFooterRow={showFooterRow}
      onToggleFooterRow={setShowFooterRow}
      aggregationConfigs={aggregationConfigs}
      onAggregationConfigsChange={setAggregationConfigs}
      aggregationValues={duckDbAggregations}
      onNeedMore={loadMore}
      hasMore={hasMore}
      loadingMore={isLoadingQuery}
      sortColumn={sortBy}
      sortDirection={sortBy ? (sortDesc ? "desc" : "asc") : null}
      onSortChange={(colName) => toggleSort(colName)}
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
              placeholder={index === 0 ? "Filtrele…" : undefined}
              title="Arama terimi, boşluklu kelimeler, aralık (10..50), >100 veya boş hücreler için '' yazabilirsiniz"
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
      renderRow={(row, index, cols = effectiveColumns) => {
        const values = (row.values ?? row) as Record<string, unknown>

        return (
          <tr key={index} className="hover:bg-muted/30">
            {cols.map((col) => {
              const rawVal = values[col.name]
              const formattedVal = formatGridCellValue(
                rawVal,
                col.align,
                columnDuckTypes[col.name] ?? columnTypes[col.name]
              )
              return (
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
                    title={rawVal != null ? String(rawVal) : undefined}
                  >
                    <span className="truncate">{formattedVal}</span>
                  </div>
                </td>
              )
            })}
          </tr>
        )
      }}
    />

    <Dialog
      open={exportWarning !== null}
      onOpenChange={(open) => {
        if (!open) setExportWarning(null)
      }}
    >
      <DialogContent className="sm:max-w-md">
        {exportWarning?.type === "hard_limit" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="size-5 shrink-0" />
                <DialogTitle className="text-base font-semibold">
                  Excel Dışa Aktarma Sınırı Aşıldı
                </DialogTitle>
              </div>
              <DialogDescription className="pt-2 text-xs leading-relaxed text-muted-foreground">
                Bu raporda{" "}
                <strong className="font-semibold text-foreground tabular-nums">
                  {formatCount(exportWarning.count)} satır
                </strong>{" "}
                veri bulunmaktadır. Microsoft Excel&apos;in tek sayfa sınırı 1.048.576 satırdır ve 2 milyonun üzerindeki veri kümelerinde Excel kilitlenmekte veya çökmektedir.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold">Önerilen Çözüm:</p>
              <p className="mt-0.5 text-muted-foreground">
                Excel uygulamasının kilitlenmesini önlemek için lütfen tarih, şube, cari veya ürün filtrelerini daraltarak sonuçları en fazla 1-2 milyon satır ile sınırlandırın.
              </p>
            </div>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportWarning(null)}
              >
                <Filter className="mr-1.5 size-3.5" />
                Filtreleri Düzenle
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void runExport("xlsx", 1_000_000)}
              >
                <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600 dark:text-emerald-400" />
                İlk 1.000.000 (Excel)
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => void runExport("parquet")}
              >
                <Database className="mr-1.5 size-3.5 text-purple-400" />
                Tümünü Parquet İndir ({formatCount(exportWarning.count)})
              </Button>
            </DialogFooter>
          </>
        ) : exportWarning?.type === "warning" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                <AlertTriangle className="size-5 shrink-0" />
                <DialogTitle className="text-base font-semibold">
                  Büyük Veri Kümesi Uyarısı
                </DialogTitle>
              </div>
              <DialogDescription className="pt-2 text-xs leading-relaxed text-muted-foreground">
                Bu raporda{" "}
                <strong className="font-semibold text-foreground tabular-nums">
                  {formatCount(exportWarning.count)} satır
                </strong>{" "}
                veri bulunmaktadır. Microsoft Excel tek sayfada en fazla 1.048.576 satır desteklediği için veriniz{" "}
                <strong className="font-semibold text-foreground">2 çalışma sayfasına</strong> (Sayfa 1 ve Sayfa 2) bölünerek aktarılacaktır.
              </DialogDescription>
            </DialogHeader>

            <p className="text-xs text-muted-foreground">
              2 çalışma sayfasından oluşan büyük dosyaları açarken bilgisayarınızda kısa süreli donma veya performans kaybı yaşanabilir.
            </p>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportWarning(null)}
              >
                Vazgeç / Filtrele
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void runExport("xlsx", 1_000_000)}
              >
                <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600 dark:text-emerald-400" />
                İlk 1.000.000 (Excel)
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => void runExport("xlsx")}
              >
                2 Sayfa Olarak İndir
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  )
}
