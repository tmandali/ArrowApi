"use client";

import * as React from "react";
import { duckDbClient } from "@/services/duckdb";
import { deriveColumnKind } from "../../lib/column-type-utils";
import { formatColumnLabel } from "@/utils/format-cell";
import type { ReportColumnMeta } from "../../hooks/use-duck-report";
import type { SpreadsheetColumn } from "../virtual-spreadsheet";

/**
 * Kolon şeması: DESCRIBE (yetkili kaynak) > keşif > align sezgisi.
 * columns prop'u hizalama sezgisiyle gelir ve duckType taşımaz; "Qty (text)"
 * gibi yanlış grounding modelin araç çağırmayı reddetmesine yol açıyordu.
 */
export function useGridColumns(args: {
  jobId: string | null | undefined;
  columns: SpreadsheetColumn[];
  metaColumns: ReportColumnMeta[];
  discoveredCols: ReportColumnMeta[];
  rows: Record<string, unknown>[];
  customQuerySql: string | null;
}) {
  const { jobId, columns, metaColumns, discoveredCols, rows, customQuerySql } = args;

  // tablo adı — şema (DESCRIBE), kolon değerleri ve Yula bağlamı için
  const duckTableName = jobId
    ? `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}`
    : "current_report";

  const [described, setDescribed] = React.useState<{
    table: string;
    cols: Awaited<ReturnType<typeof duckDbClient.describeTable>>;
  } | undefined>();

  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    void (async () => {
      try {
        const cols = await duckDbClient.describeTable(duckTableName);
        if (!cancelled && cols.length > 0) {
          setDescribed({ table: duckTableName, cols });
        }
      } catch {
        // DESCRIBE hazır olmadıysa sezgisel map devrede kalır
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [duckTableName, discoveredCols.length, jobId]);

  // Türetilmiş: DESCRIBE sonucu yalnızca GÜNCEL tabloya aitse kullanılır.
  // Tablo değişince otomatik undefined → stale reset için senkron setState gerekmez.
  const describedCols =
    described && described.table === duckTableName ? described.cols : undefined;

  const columnTypes = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of metaColumns) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric);
    for (const c of discoveredCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric);
    // Öncelik: DESCRIBE > keşif > align sezgisi
    if (describedCols) {
      for (const c of describedCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric);
    }
    return map;
  }, [metaColumns, discoveredCols, describedCols]);

  // Şemadan gelen fiziksel ham DuckDB tipleri (BIGINT, INTEGER, DECIMAL, DATE...)
  const columnDuckTypes = React.useMemo<Record<string, string>>(() => {
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
        duckType: columnDuckTypes[c.name] ?? c.duckType,
      }));
    }
    if (columns.length > 0) {
      return columns.map((c) => ({
        ...c,
        kind: c.kind ?? columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.align === "right"),
        duckType: c.duckType ?? columnDuckTypes[c.name],
      }));
    }
    return discoveredCols.map((c) => ({
      name: c.name,
      label: c.label && c.label !== c.name ? c.label : formatColumnLabel(c.name),
      align: c.align ?? (c.isNumeric ? "right" : "left"),
      kind: columnTypes[c.name] ?? deriveColumnKind(c.duckType, c.isNumeric),
      duckType: columnDuckTypes[c.name] ?? c.duckType,
    }));
  }, [customQuerySql, columns, discoveredCols, columnTypes, columnDuckTypes]);

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
      const type = (columnDuckTypes[col.name] ?? col.duckType ?? "").toUpperCase();
      if (col.kind === "bool" || type.includes("BOOL") || type === "BIT") {
        set.add(col.name);
      }
    }
    return set;
  }, [effectiveColumns, columnDuckTypes]);

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
    duckTableName,
    metaColumns,
    columnTypes,
    columnDuckTypes,
    effectiveColumns,
    numericColumns,
    booleanColumns,
    sampleRows,
  };
}
