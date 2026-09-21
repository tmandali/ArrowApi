"use client";

import * as React from "react";
import { wasmSqlClient } from "@/services/wasmsql";
import { deriveColumnKind } from "../../lib/column-type-utils";
import { formatColumnLabel } from "@/utils/format-cell";
import type { WasmSqlColumnMeta } from "../../hooks/wasm-sql-types";
import type { SpreadsheetColumn } from "@/components/virtual-spreadsheet";

/**
 * Kolon şeması: DESCRIBE (yetkili kaynak) > keşif > align sezgisi.
 */
export function useGridColumns(args: {
  jobId: string | null | undefined;
  columns: SpreadsheetColumn[];
  metaColumns: WasmSqlColumnMeta[];
  discoveredCols: WasmSqlColumnMeta[];
  rows: Record<string, unknown>[];
  customQuerySql: string | null;
}) {
  const { jobId, columns, metaColumns, discoveredCols, rows, customQuerySql } = args;

  // tablo adı — şema (DESCRIBE), kolon değerleri ve Yula bağlamı için
  const tableName = jobId
    ? `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}`
    : "current_report";

  const [described, setDescribed] = React.useState<{
    table: string;
    cols: Awaited<ReturnType<typeof wasmSqlClient.describeTable>>;
  } | undefined>();

  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    void (async () => {
      try {
        const cols = await wasmSqlClient.describeTable(tableName);
        if (!cancelled && cols.length > 0) {
          setDescribed({ table: tableName, cols });
        }
      } catch {
        // DESCRIBE hazır olmadıysa sezgisel map devrede kalır
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableName, discoveredCols.length, jobId]);

  // Türetilmiş: DESCRIBE sonucu yalnızca GÜNCEL tabloya aitse kullanılır.
  const describedCols =
    described && described.table === tableName ? described.cols : undefined;

  const columnTypes = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of metaColumns) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric);
    for (const c of discoveredCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric);
    if (describedCols) {
      for (const c of describedCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric);
    }
    return map;
  }, [metaColumns, discoveredCols, describedCols]);

  // Şemadan gelen fiziksel ham SQL tipleri (BIGINT, INTEGER, DECIMAL, DATE...)
  const columnWasmTypes = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of metaColumns) if (c.duckType) map[c.name] = c.duckType;
    for (const c of discoveredCols) if (c.duckType) map[c.name] = c.duckType;
    if (describedCols) {
      for (const c of describedCols) if (c.duckType) map[c.name] = c.duckType;
    }
    return map;
  }, [metaColumns, discoveredCols, describedCols]);

  const effectiveColumns = React.useMemo<SpreadsheetColumn[]>(() => {
    // Özel SQL modunda kolonlar sorgu sonucundan gelir (gruplama/aggregate adları)
    if (customQuerySql) {
      return discoveredCols.map((c) => ({
        name: c.name,
        label: c.label && c.label !== c.name ? c.label : formatColumnLabel(c.name),
        align: c.align ?? (c.isNumeric ? "right" : "left"),
        kind: columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.isNumeric),
        duckType: columnWasmTypes[c.name] ?? c.duckType,
      }));
    }
    if (columns.length > 0) {
      return columns.map((c) => ({
        ...c,
        kind: c.kind ?? columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.align === "right"),
        duckType: c.duckType ?? columnWasmTypes[c.name],
      }));
    }
    return discoveredCols.map((c) => ({
      name: c.name,
      label: c.label && c.label !== c.name ? c.label : formatColumnLabel(c.name),
      align: c.align ?? (c.isNumeric ? "right" : "left"),
      kind: columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.isNumeric),
      duckType: columnWasmTypes[c.name] ?? c.duckType,
    }));
  }, [customQuerySql, columns, discoveredCols, columnTypes, columnWasmTypes]);

  const numericColumns = React.useMemo(() => {
    const set = new Set<string>();
    for (const col of effectiveColumns) {
      if (col.align === "right" || col.kind === "number") {
        set.add(col.name);
      }
    }
    return set;
  }, [effectiveColumns]);

  const booleanColumns = React.useMemo(() => {
    const set = new Set<string>();
    for (const col of effectiveColumns) {
      const type = (columnWasmTypes[col.name] ?? col.duckType ?? "").toUpperCase();
      if (col.kind === "bool" || type.includes("BOOL") || type === "BIT") {
        set.add(col.name);
      }
    }
    return set;
  }, [effectiveColumns, columnWasmTypes]);

  const sampleRows = React.useMemo(() => {
    return rows.slice(0, 3).map((r) => {
      const simplified: Record<string, unknown> = {};
      for (const col of effectiveColumns) {
        if (r[col.name] !== undefined) simplified[col.name] = r[col.name];
      }
      return simplified;
    });
  }, [rows, effectiveColumns]);

  return {
    tableName,
    duckTableName: tableName,
    metaColumns,
    columnTypes,
    columnWasmTypes,
    columnDuckTypes: columnWasmTypes,
    effectiveColumns,
    numericColumns,
    booleanColumns,
    sampleRows,
  };
}
