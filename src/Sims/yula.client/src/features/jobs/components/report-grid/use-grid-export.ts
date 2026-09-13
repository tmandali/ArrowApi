"use client";

import * as React from "react";
import { toast } from "sonner";
import { duckDbClient } from "@/services/duckdb";
import { opfsReportCache } from "@/services/opfs/opfs-cache";
import {
  exportOpfsMergedParquet,
  exportQueryToParquetStream,
} from "@/services/opfs/opfs-parquet-merge";
import { formatCount } from "@/utils/format";
import type { SpreadsheetColumn } from "../virtual-spreadsheet";

export type ExportFormat = "xlsx" | "parquet" | "csv" | "gz";

export type ExportWarning = {
  type: "warning" | "hard_limit";
  count: number;
} | null;

function sanitizeFileStem(title: string): string {
  return (title && title !== "Report Result" ? title : "report")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ_]/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
}

/**
 * Dışa aktarma: Excel/CSV (DuckDB), Parquet (OPFS birleştirme veya
 * lazy-stream; 32-bit WASM OOM korumalı) + satır-sınır uyarıları.
 */
export function useGridExport(args: {
  duckTableName: string;
  jobId: string | null | undefined;
  title: string;
  effectiveColumns: SpreadsheetColumn[];
  filters: Record<string, string>;
  numericColumns: Set<string>;
  booleanColumns: Set<string>;
  sortBy: string | null;
  sortDesc: boolean;
  sortConfigs: Record<string, "asc" | "desc">;
  columnDuckTypes: Record<string, string>;
  customQuerySql: string | null;
  hiddenColumns?: string[];
  totalFiltered: number;
  totalRows: number;
  hasActiveFilters: boolean;
  isStreaming: boolean;
  isSavingDisk: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const {
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
  } = args;

  const [isExporting, setIsExporting] = React.useState(false);
  const [exportWarning, setExportWarning] = React.useState<ExportWarning>(null);

  const runExport = React.useCallback(
    async (
      format: ExportFormat = "xlsx",
      maxTotalRows?: number
    ) => {
      setExportWarning(null);
      if (!duckTableName || isExporting || isStreaming || isSavingDisk || effectiveColumns.length === 0) return;
      setIsExporting(true);
      const formatLabel =
        format === "xlsx"
          ? t("export_format_xlsx")
          : format === "parquet"
          ? t("export_format_parquet")
          : format === "gz"
          ? t("export_format_gz")
          : t("export_format_csv");
      const exportToastId = toast.loading(t("export_preparing", { label: formatLabel }));
      try {
        const stamp = new Date().toISOString().slice(0, 10);
        const fileName = `${sanitizeFileStem(title)}_${stamp}`;

        // PARQUET ÖZEL AKIŞI: Eğer OPFS'te parquet parçaları varsa,
        // DuckDB 32-bit WASM motorunun bellek taşması (OOM) hatasını önlemek için
        // parçaları doğrudan parquet-wasm lazy stream ile birleştirip indiriyoruz.
        if (format === "parquet" && jobId) {
          const hasParts = await opfsReportCache.hasParquetParts(jobId);
          if (hasParts && !customQuerySql && Object.keys(filters).length === 0) {
            const result = await exportOpfsMergedParquet({ jobId, fileName });
            const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
            toast.success(
              t("export_parquet_downloaded", { rows: formatCount(result.totalRows), size: sizeMb }),
              { id: exportToastId }
            );
            return;
          }
        }

        const sortList: { column: string; desc: boolean }[] = [];
        for (const col of effectiveColumns) {
          const dir = sortConfigs[col.name];
          if (dir) {
            sortList.push({ column: col.name, desc: dir === "desc" });
          }
        }
        if (sortList.length === 0 && sortBy) {
          sortList.push({ column: sortBy, desc: sortDesc });
        }

        const exportCols = effectiveColumns
          .filter((c) => !hiddenColumns?.includes(c.name))
          .map((c) => c.name);

        // PARQUET: Filtrelenmiş veya özel görünüm sorgusu için 32-bit OOM'u önleyen lazy-stream ihracı
        if (format === "parquet") {
          const result = await exportQueryToParquetStream({
            tableName: duckTableName,
            customSql: customQuerySql ?? undefined,
            columns: exportCols.length > 0 ? exportCols : effectiveColumns.map((c) => c.name),
            filters,
            numericColumns,
            sortBy,
            sortDesc,
            sortConfigs: sortList,
            fileName,
          });
          const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
          toast.success(
            t("export_parquet_downloaded", { rows: formatCount(result.totalRows), size: sizeMb }),
            { id: exportToastId }
          );
          return;
        }

        const result = await duckDbClient.exportReportTable({
          tableName: duckTableName,
          fileName,
          filters,
          numericColumns,
          booleanColumns,
          sortBy,
          sortDesc,
          sortConfigs: sortList,
          columns: exportCols.length > 0 ? exportCols : effectiveColumns.map((c) => c.name),
          columnDuckTypes,
          preferredFormat: format,
          maxTotalRows,
          customSql: customQuerySql ?? undefined,
        });

        if (result.format === "xlsx") {
          if (result.sheetCount && result.sheetCount > 1) {
            toast.success(
              t("export_excel_downloaded_sheets", { sheets: result.sheetCount, rows: formatCount(result.totalRows) }),
              { id: exportToastId }
            );
          } else {
            toast.success(t("export_excel_downloaded", { name: result.fileName }), {
              id: exportToastId,
            });
          }
        } else if (result.format === "parquet") {
          const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
          toast.success(
            t("export_parquet_downloaded", { rows: formatCount(result.totalRows), size: sizeMb }),
            { id: exportToastId }
          );
        } else if (result.format === "gz") {
          const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
          toast.success(
            t("export_gz_downloaded", { rows: formatCount(result.totalRows), size: sizeMb }),
            { id: exportToastId }
          );
        } else {
          toast.success(t("export_csv_downloaded", { name: result.fileName }), {
            id: exportToastId,
          });
        }
      } catch (err) {
        toast.error(t("export_error", { error: String(err) }), {
          id: exportToastId,
        });
        // Eğer DuckDB Parquet oluştururken bellek (OOM) veya başka bir hata verdiyse
        // ve OPFS'te bu rapora ait parçalar mevcutsa, parçaları birleştirerek kullanıcıyı kurtar
        if (format === "parquet" && jobId) {
          try {
            const hasParts = await opfsReportCache.hasParquetParts(jobId);
            if (hasParts) {
              toast.loading(t("opfs_merge_loading"), {
                id: exportToastId,
              });
              const stamp = new Date().toISOString().slice(0, 10);
              const fallbackFileName = `${sanitizeFileStem(title)}_${stamp}`;
              const result = await exportOpfsMergedParquet({ jobId, fileName: fallbackFileName });
              const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
              toast.success(
                t("export_parquet_downloaded", { rows: formatCount(result.totalRows), size: sizeMb }),
                { id: exportToastId }
              );
              return;
            }
          } catch (fallbackErr) {
            console.error("OPFS Parquet fallback error:", fallbackErr);
          }
        }
        toast.error(t("export_failed"), { id: exportToastId });
      } finally {
        setIsExporting(false);
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
      sortConfigs,
      jobId,
      customQuerySql,
      hiddenColumns,
      columnDuckTypes,
      booleanColumns,
      t,
    ]
  );

  const handleExportClick = React.useCallback(
    (format: ExportFormat = "xlsx") => {
      if (!duckTableName || isExporting || isStreaming || isSavingDisk || effectiveColumns.length === 0) return;
      const exportRowCount = hasActiveFilters ? totalFiltered : totalRows;

      // Parquet ve CSV için Excel'in 1M/2M satır sınırı kısıtlayıcı değildir
      if (format === "xlsx") {
        if (exportRowCount > 2_000_000) {
          setExportWarning({ type: "hard_limit", count: exportRowCount });
          return;
        }
        if (exportRowCount > 1_000_000) {
          setExportWarning({ type: "warning", count: exportRowCount });
          return;
        }
      }

      void runExport(format);
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
  );

  return {
    isExporting,
    exportWarning,
    setExportWarning,
    runExport,
    handleExportClick,
  };
}
