"use client";

import { useYulaGridStore } from "@/lib/stores/grid";
import { useTranslations } from "next-intl";
import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useDuckReport } from "../../hooks/use-duck-report";
import { duckDbClient } from "@/services/duckdb";
import { useAgentComponent } from "@my-agent/react";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { VirtualSpreadsheet } from "../VirtualSpreadsheet";
import {
  ROW_HEIGHT,
  type SpreadsheetColumn,
} from "../virtual-spreadsheet";
import { formatCount } from "@/utils/format";
import { useAiSqlViews } from "./use-ai-sql-views";
import { useGridColumns } from "./use-grid-columns";
import { useColumnValuesDigest } from "./use-column-values-digest";
import { useGridRuntime } from "./use-grid-runtime";
import { useViewSync } from "./use-view-sync";
import { useGridAggregations } from "./use-grid-aggregations";
import { useGridExport, type ExportFormat } from "./use-grid-export";
import { ReportGridHeaderActions } from "./report-grid-header";
import { ExportWarningDialog } from "./export-warning-dialog";
import { createFilterCellRenderer, createRowRenderer } from "./grid-cells";
import { useColumnStyleStats, type ColumnVisuals } from "./use-column-style-stats";
import { useVisualPushdown } from "./use-visual-pushdown";
import type { ConditionalColorRule } from "../virtual-spreadsheet/conditional-rules";

export type ArrowReportGridProps = {
  title?: string;
  jobId: string | null | undefined;
  jobUrl: string | null | undefined;
  columns?: SpreadsheetColumn[];
  expectedTotalRows?: number | null;
  showFilterRow?: boolean;
  onShowFilterRowChange?: (open: boolean) => void;
  /**
   * Hücre seçimi / Name Box / TSV kopyalama (Yula "hücreye git" için) açık mı?
   * Varsayılan açık; kapatacak yer `cellLocator={false}` geçirir.
   */
  cellLocator?: boolean;
  /** Rapor şemasının x-ai.columnDescriptions'ı — LLM kolon semantiği grounding'i */
  columnDescriptions?: Record<string, string>;
  /** Aktif raporun scope'u — get_report_schema aracının kimliği */
  reportScope?: string;
  className?: string;
  headerActions?: React.ReactNode;
  onError?: (err: string | null) => void;
};

/**
 * Kararlı boş kolon varsayılansı: modül düzeyinde tek referans.
 * `columns` prop'u geçilmeyen rapor grid'lerinde her render'da yeni bir
 * `[]` oluşmasını önler — yeni referans metaColumns → columnTypes →
 * effectiveColumns → numeric/booleanColumns zincirini çalkalar ve
 * useVisualPushdown'un useEffect bağımlılıklarını her render'da bozarak
 * "Maximum update depth exceeded" döngüsüne yol açardı.
 */
const EMPTY_COLUMNS: SpreadsheetColumn[] = [];

/**
 * Uygulama genelinde tüm Arrow raporları için ortak, Wasm + OPFS destekli
 * yüksek performanslı sanal spreadsheet bileşeni.
 *
 * Herhangi bir workspace'teki (Stok, Satış, Muhasebe, Üretim vb.) rapor için
 * tek satırla bağlanır; 100k-1M+ satırlık verilerde anında SQL filtreleme sağlar.
 */
export function ArrowReportGrid({
  title = "Report Result",
  jobId,
  jobUrl,
  columns = EMPTY_COLUMNS,
  expectedTotalRows,
  showFilterRow = false,
  onShowFilterRowChange,
  cellLocator = true,
  columnDescriptions,
  reportScope,
  className,
  headerActions,
  onError,
}: ArrowReportGridProps) {
  const t = useTranslations("ReportGrid");

  // Yula set_grid_query: özel görünüm (gruplama/aggregate) aktif mi?
  const customQuerySql = useYulaGridStore((s) => s.customQuerySql);
  const customQueryTitle = useYulaGridStore((s) => s.customQueryTitle);
  const isMaximized = useYulaGridStore((s) => s.isMaximized);

  const views = useAiSqlViews({
    reportScope,
    title,
    customQuerySql,
    customQueryTitle,
    t,
  });
  const {
    aiViews,
    activeAiViewId,
    storageKey,
    handleSaveCurrentAiView,
    handleSelectAiView,
    handleRenameAiView,
    handleDeleteAiView,
  } = views;

  const metaColumns = React.useMemo(
    () =>
      columns.map((col) => ({
        name: col.name,
        label: col.label,
        align: col.align,
        isNumeric: col.align === "right",
      })),
    [columns]
  );

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
    isTableReady,
    isLoadingQuery,
    isLoadingMore,
    refresh,
    sortBy,
    sortDesc,
    sortConfigs,
    toggleSort,
    setSorting,
    setMultiSorting,
    applyFilters: duckApplyFilters,
    clearFilters,
  } = useDuckReport({
    jobId,
    jobUrl,
    columns: metaColumns,
    expectedTotalRows,
    onError,
    customSql: customQuerySql,
  });

  const cols = useGridColumns({
    jobId,
    columns,
    metaColumns,
    discoveredCols,
    rows,
    customQuerySql,
  });
  const {
    duckTableName,
    columnTypes,
    columnDuckTypes,
    effectiveColumns,
    numericColumns,
    booleanColumns,
    sampleRows,
  } = cols;

  const columnValuesDigest = useColumnValuesDigest({
    duckTableName,
    columnNames: effectiveColumns.map((c) => c.name),
    columnTypes,
    totalRows,
    isStreaming,
  });

  const hasActiveFilters = React.useMemo(
    () => Object.values(filters).some((q) => q.trim().length > 0),
    [filters]
  );

  const filterKey = React.useMemo(() => JSON.stringify(filters), [filters]);

  const displayRows = rows;

  // Yula runtimeApi → export köprüsü (ref ile döngü kırılır; orijinal desen).
  const handleExportClickRef = React.useRef<(format?: ExportFormat) => void>(undefined);
  const requestExport = React.useCallback((format?: ExportFormat) => {
    handleExportClickRef.current?.(format);
  }, []);

  const runtime = useGridRuntime({
    setFilter,
    duckApplyFilters,
    clearFilters,
    setSorting,
    effectiveColumns,
    filters,
    totalFiltered,
    sortBy,
    sortDesc,
    sortConfigs,
    showFilterRow,
    onShowFilterRowChange,
    requestExport,
  });
  const {
    hiddenColumns,
    setHiddenColumns,
    pinnedColumns,
    setPinnedColumns,
    columnOrder,
    setColumnOrder,
    effectiveShowFilterRow,
  } = runtime;

  const gridExport = useGridExport({
    duckTableName,
    jobId,
    title,
    effectiveColumns,
    filters,
    numericColumns,
    booleanColumns,
    sortBy,
    sortDesc,
    sortConfigs,
    columnDuckTypes,
    customQuerySql,
    hiddenColumns,
    totalFiltered,
    totalRows,
    hasActiveFilters,
    isStreaming,
    isSavingDisk,
    t,
  });
  React.useEffect(() => {
    handleExportClickRef.current = gridExport.handleExportClick;
  }, [gridExport.handleExportClick]);

  const { savedViewSpecs } = useViewSync({
    aiViews,
    duckTableName,
    isTableReady,
    isStreaming,
    isSavingDisk,
    effectiveColumns,
    filters,
    numericColumns,
    booleanColumns,
    sortBy,
    sortDesc,
    sortConfigs,
    customQuerySql,
  });

  const agg = useGridAggregations({
    duckTableName,
    effectiveColumns,
    filters,
    numericColumns,
    booleanColumns,
    isStreaming,
    isSavingDisk,
  });

  // Yula bağlamı — TEK yerden doğrudan store kaydı (aracı katman yok).
  // Gridin tüm verisi burada hesaplanır; veri geldikçe (DESCRIBE, örnek
  // satırlar, değer sözlüğü, active_view) spec otomatik güncellenir.
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
      activeViewName: "active_view",
      savedViews: savedViewSpecs,
    }),
    [
      duckTableName,
      title,
      effectiveColumns,
      totalFiltered,
      columnTypes,
      sampleRows,
      columnValuesDigest,
      columnDescriptions,
      reportScope,
      savedViewSpecs,
    ]
  );

  React.useEffect(() => {
    useYulaGridStore.getState().register(yulaContext);
  }, [yulaContext]);

  // Headless React UI-Agent (@my-agent/react): Grid mount edildiğinde kendini
  // canlı React state'iyle result_grid:active olarak kaydeder.
  useAgentComponent({
    id: "result_grid:active",
    meta: {
      description: `Active Result Grid (${duckTableName}) - ${totalFiltered ?? "?"} rows`,
      tableName: duckTableName,
      columns: effectiveColumns.map((c) => c.name),
      rowCount: totalFiltered,
      filters,
      customQuerySql,
      isTableReady,
    },
    actions: {
      RUN_SQL: {
        description: "Executes a read-only DuckDB SQL query against 'active_view' ({ query }).",
        whenToCall: "When custom SQL queries, aggregations, or calculations are requested.",
        whenNotToCall: "When simple column filtering or sorting is sufficient.",
      },
      FILTER: {
        description: "Filters the grid by a column value ({ field, value, op }).",
        whenToCall: "To filter table data by a column value.",
        whenNotToCall: "When filtering is not requested.",
      },
      APPLY_FILTERS: {
        description: "Applies multiple column filters simultaneously ({ filters, clearOthers }).",
        whenToCall: "When multiple columns need to be filtered concurrently.",
        whenNotToCall: "When filtering only a single column.",
      },
      SORT: {
        description: "Sorts the grid by column ({ column, direction }).",
        whenToCall: "When sorting is requested.",
        whenNotToCall: "When sorting is not requested.",
      },
      COLUMNS: {
        description: "Shows, hides, or reorders columns ({ visibleColumns, hiddenColumns }).",
        whenToCall: "To adjust column visibility or layout.",
        whenNotToCall: "When column layout should remain untouched.",
      },
      PIN: {
        description: "Pins columns to the left or right ({ columns }).",
        whenToCall: "When column freezing or pinning is requested.",
        whenNotToCall: "When pinning is not requested.",
      },
      RESET_LAYOUT: {
        description: "Resets the grid to default layout and visibility.",
        whenToCall: "When the user wants to reset custom column arrangements.",
        whenNotToCall: "When keeping the current layout.",
      },
      EXPORT: {
        description: "Exports data to Excel, CSV, or Parquet ({ format }).",
        whenToCall: "When downloading or exporting grid data is requested.",
        whenNotToCall: "When export is not requested.",
      },
      VISUALIZE: {
        description: "Generates a chart or visual plot ({ type, dimension, metric }).",
        whenToCall: "When a chart or graph visualization is requested.",
        whenNotToCall: "When no visual chart is requested.",
      },
      ANALYZE: {
        description: "Generates a statistical summary of the active data.",
        whenToCall: "When statistical summary or data distribution is requested.",
        whenNotToCall: "When summary analysis is not requested.",
      },
      PROFILE: {
        description: "Profiles column data quality, null counts, and distinct values.",
        whenToCall: "When inspecting data quality or anomalies.",
        whenNotToCall: "When profiling is not requested.",
      },
    },
    onAction: async (action, payload) => {
      return executeDispatchComponentAction({ component_id: "result_grid:active", action, payload });
    },
  });

  React.useEffect(() => {
    return () => {
      useYulaGridStore.getState().unregister();
      void duckDbClient.dropView("active_view").catch(() => {});
    };
  }, []);

  const countDisplay =
    hasActiveFilters && totalRows > 0 ? (
      <span className="tabular-nums">
        {formatCount(totalFiltered)} / {formatCount(totalRows)} (filtered)
      </span>
    ) : totalRows > 0 ? (
      <span className="tabular-nums">
        {formatCount(totalRows)} row{totalRows === 1 ? "" : "s"}
      </span>
    ) : (
      <span className="tabular-nums">
        {formatCount(displayRows.length)} row{displayRows.length === 1 ? "" : "s"}
      </span>
    );

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
  ) : null;

  const partialSubtitle =
    !isStreaming && !isSavingDisk && isPartial ? (
      <span
        className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 tabular-nums dark:text-amber-400"
        title={t("partial_memory_title")}
      >
        <TriangleAlert className="size-3 shrink-0" />
        Partial: {formatCount(totalRows)}
        {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows
      </span>
    ) : null;

  const subtitle =
    streamingSubtitle ??
    partialSubtitle ??
    (isStreaming || isSavingDisk || effectiveColumns.length === 0 ? null : countDisplay);

  const renderFilterCell = createFilterCellRenderer({ t, filters, setFilter });
  // Airtable benzeri kolon görsel katmanı (hücre bar'ı / renk çipleri).
  // Varsayılan KAPALIdır: yalnızca kullanıcının footer menüsünden o kolon için
  // açıkça açtığı katmanlar (columnVisuals) işlenir; açık kolon yoksa sıfır tarama.
  // Σ (alt toplam) düğmesi artık sadece footer SATIRINI kontrol eder.
  // Kullanıcı tanımlı eşik kuralları (columnRules) bilinçli tercih olduğu için her zaman aktiftir.
  const [columnVisuals, setColumnVisuals] = React.useState<ColumnVisuals>({});
  const handleColumnVisualToggle = React.useCallback((column: string, next: boolean) => {
    setColumnVisuals((prev) => {
      const isOn = Boolean(prev[column]);
      if (next === isOn) return prev; // değişim yok
      const updated = { ...prev };
      if (next) updated[column] = true;
      else delete updated[column];
      return updated;
    });
  }, []);

  // Bar ölçeği için TAM veri seti MIN/MAX (DuckDB pushdown): 100M satırda bile
  // bar doğru çizilir. Yalnızca açık görsel kolonlar sorgulanır; kapalıysa sıfır maliyet.
  // Fallback: pushdown sonuç gelene kadar / başarısız olursa örneklem min/max kullanılır.
  const visualBounds = useVisualPushdown({
    duckTableName,
    effectiveColumns,
    numericColumns,
    booleanColumns,
    filters,
    enabledColumns: columnVisuals,
    isStreaming,
    isSavingDisk,
  });

  const columnStyles = useColumnStyleStats({
    rows: displayRows,
    effectiveColumns,
    numericColumns,
    booleanColumns,
    enabledColumns: columnVisuals,
    pushedBounds: visualBounds,
  });

  // Eşik tabanlı koşullu renk kuralları (kolon menüsünden düzenlenir).
  // MVP: oturum içi state; kalıcılık (localStorage/store) sonraki adım.
  const [columnRules, setColumnRules] = React.useState<Record<string, ConditionalColorRule[]>>({});
  const handleColumnRulesChange = React.useCallback(
    (column: string, rules: ConditionalColorRule[]) => {
      setColumnRules((prev) => {
        const next = { ...prev };
        if (rules.length > 0) next[column] = rules;
        else delete next[column];
        return next;
      });
    },
    []
  );

  const renderRow = React.useMemo(
    () =>
      createRowRenderer({
        effectiveColumns,
        columnTypes,
        columnDuckTypes,
        columnStyles,
        columnRules,
      }),
    [effectiveColumns, columnTypes, columnDuckTypes, columnStyles, columnRules]
  );

  return (
    <>
      <VirtualSpreadsheet
        columns={effectiveColumns}
        items={displayRows}
        title={title}
        subtitle={subtitle}
        cellLocator={cellLocator}
        columnRules={columnRules}
        onColumnRulesChange={handleColumnRulesChange}
        className={className}
        loading={isStreaming || isSavingDisk || (isLoadingQuery && displayRows.length === 0) || (effectiveColumns.length === 0 && Boolean(jobId))}
        emptyMessage={isStreaming || isSavingDisk || isLoadingQuery ? "Loading report..." : "No data found"}
        progressValue={progressPercent}
        resetKey={`${jobId}:${customQuerySql ?? ""}:${filterKey}`}
        storageKey={storageKey}
        aiViews={aiViews}
        activeAiViewId={activeAiViewId}
        currentQuerySql={customQuerySql}
        currentQueryTitle={customQueryTitle}
        onSelectAiView={handleSelectAiView}
        onSaveCurrentAiView={handleSaveCurrentAiView}
        onRenameAiView={handleRenameAiView}
        onDeleteAiView={handleDeleteAiView}
        isViewLoading={
          isLoadingQuery &&
          (!!customQuerySql || (displayRows.length === 0 && !!activeAiViewId))
        }
        hiddenColumns={hiddenColumns}
        onHiddenColumnsChange={setHiddenColumns}
        pinnedColumns={pinnedColumns}
        onPinnedColumnsChange={setPinnedColumns}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        showFilterRow={effectiveShowFilterRow}
        onToggleFilterRow={onShowFilterRowChange}
        headerActions={
          <ReportGridHeaderActions
            headerActions={headerActions}
            hiddenCount={hiddenColumns?.length ?? 0}
            onClearHidden={() => setHiddenColumns([])}
            onRefresh={() => void refresh()}
            refreshDisabled={isStreaming || isSavingDisk || gridExport.isExporting}
            refreshSpinning={isStreaming || isSavingDisk}
            exportDisabled={isStreaming || isSavingDisk || gridExport.isExporting || effectiveColumns.length === 0}
            isExporting={gridExport.isExporting}
            onExport={(format) => gridExport.handleExportClick(format)}
          />
        }
        showFooterRow={agg.showFooterRow}
        onToggleFooterRow={agg.setShowFooterRow}
        aggregationConfigs={agg.aggregationConfigs}
        onAggregationConfigsChange={agg.setAggregationConfigs}
        aggregationValues={agg.duckDbAggregations}
        columnVisuals={columnVisuals}
        onColumnVisualToggle={handleColumnVisualToggle}
        onNeedMore={loadMore}
        hasMore={hasMore}
        loadingMore={isLoadingMore}
        sortColumn={sortBy}
        sortDirection={sortBy ? (sortDesc ? "desc" : "asc") : null}
        sortConfigs={sortConfigs}
        onSortConfigsChange={(configs, orderedCols) => setMultiSorting(configs, orderedCols)}
        onSortChange={(colName) => toggleSort(colName, effectiveColumns.map((c) => c.name))}
        onSortSettingChange={(colName, desc) => setSorting(colName, desc)}
        rowHeight={ROW_HEIGHT}
        isMaximized={isMaximized}
        renderFilterCell={renderFilterCell}
        renderRow={renderRow}
      />

      <ExportWarningDialog
        warning={gridExport.exportWarning}
        onDismiss={() => gridExport.setExportWarning(null)}
        onExport={(format, maxTotalRows) => void gridExport.runExport(format, maxTotalRows)}
      />
    </>
  );
}
