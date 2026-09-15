"use client";

import { useYulaGridStore } from "@/lib/stores/grid";
import { useTranslations } from "next-intl";
import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useDuckReport } from "../../hooks/use-duck-report";
import { duckDbClient } from "@/services/duckdb";
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
import { useColumnStyleStats } from "./use-column-style-stats";
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
  columns = [],
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
  // Airtable benzeri kolon görsel kuralları: hücre bar'ı / renk çipleri / negatif vurgusu.
  // Yalnızca veri değişince (rows referansı) hesaplanır; scroll'da yeniden çalışmaz.
  // Σ (istatistik) düğmesi: analitik görünüm anahtarı — basılıyken otomatik
  // görsel katman (bar/çip/negatif-kırmızı) açık; kapalıyken grid tamamen sade.
  // Kullanıcı tanımlı eşik kuralları (columnRules) bilinçli tercih olduğu için her zaman aktiftir.
  const columnStyles = useColumnStyleStats({
    rows: displayRows,
    effectiveColumns,
    numericColumns,
    booleanColumns,
    enabled: agg.showFooterRow,
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
