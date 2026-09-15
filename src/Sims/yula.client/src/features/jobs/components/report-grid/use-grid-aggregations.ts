"use client";

import * as React from "react";
import { duckDbClient } from "@/services/duckdb";
import { buildCombinedWhereClause } from "@/services/duckdb/filter-parser";
import type { SpreadsheetColumn } from "../virtual-spreadsheet";
import {
  buildDuckDbAggregationSql,
  formatAggregatedValue,
  AGGREGATION_SHORT_LABELS,
  type ColumnAggregationConfig,
  type ColumnAggregationValues,
} from "../virtual-spreadsheet";

/**
 * Alt toplamlar (footer row): aktif filtreler + aggregationConfigs ile
 * DuckDB üzerinde hesaplanır (150ms debounce).
 */
export function useGridAggregations(args: {
  duckTableName: string;
  effectiveColumns: SpreadsheetColumn[];
  filters: Record<string, string>;
  numericColumns: Set<string>;
  booleanColumns: Set<string>;
  isStreaming: boolean;
  isSavingDisk: boolean;
}) {
  const {
    duckTableName,
    effectiveColumns,
    filters,
    numericColumns,
    booleanColumns,
    isStreaming,
    isSavingDisk,
  } = args;

  const [aggregationConfigs, setAggregationConfigs] = React.useState<ColumnAggregationConfig>({});
  const [duckDbAggregations, setDuckDbAggregations] = React.useState<ColumnAggregationValues | undefined>(undefined);
  const [showFooterRow, setShowFooterRow] = React.useState(false);

  // Footer'da en az bir kolon için aktif aggregation var mı (render'da türet — setState yok).
  const hasAny = React.useMemo(
    () => Object.values(aggregationConfigs).some((t) => t && t !== "none"),
    [aggregationConfigs]
  );

  // DuckDB üzerinde aktif filtreler ve aggregationConfigs ile alt toplamları hesapla
  React.useEffect(() => {
    if (
      !showFooterRow ||
      !duckTableName ||
      effectiveColumns.length === 0 ||
      !hasAny ||
      isStreaming ||
      isSavingDisk
    ) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const where = buildCombinedWhereClause(filters, numericColumns, booleanColumns);
        const query = buildDuckDbAggregationSql(duckTableName, where, effectiveColumns, aggregationConfigs);
        if (!query) return;
        const rows = await duckDbClient.executeCustomSql(query.sql);
        if (cancelled || !rows || rows.length === 0) return;
        const row = rows[0];
        const values: ColumnAggregationValues = {};
        for (const item of query.activeColumns) {
          const val = row[item.alias] as number | string | null | undefined;
          const col = effectiveColumns.find((c) => c.name === item.name);
          if (col) {
            values[item.name] = {
              type: item.type,
              value: val ?? null,
              formatted: formatAggregatedValue(item.type, val, col),
              label: AGGREGATION_SHORT_LABELS[item.type],
            };
          }
        }
        setDuckDbAggregations(values);
      } catch {
        // Tablo henüz oluşmamışsa veya geçici sorgu hatası varsa
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showFooterRow, duckTableName, hasAny, filters, aggregationConfigs, effectiveColumns, numericColumns, booleanColumns, isStreaming, isSavingDisk]);

  return {
    aggregationConfigs,
    setAggregationConfigs,
    // !hasAny iken stale state'i render'a sızmaz — kaynakta gate (setState yok).
    duckDbAggregations: hasAny ? duckDbAggregations : undefined,
    showFooterRow,
    setShowFooterRow,
  };
}
