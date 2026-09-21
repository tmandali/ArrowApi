"use client";

import * as React from "react";
import { wasmSqlClient } from "@/services/wasmsql";
import { computeColumnValuesDigest } from "@/lib/grid-column-values";

/**
 * Kardinalite sözlüğü: düşük kardinaliteli metin/bool kolonların GERÇEK
 * değerleri (DISTINCT) — Yula kategori değerlerini uydurmasın.
 * Tablo başına (tipler hazır olunca) bir kez hesaplanır; filtre değişimi
 * yeniden tetiklemez.
 */
export function useColumnValuesDigest(args: {
  tableName?: string;
  duckTableName?: string;
  columnNames: string[];
  columnTypes: Record<string, string>;
  totalRows: number;
  isStreaming: boolean;
}) {
  const tableName = args.tableName ?? args.duckTableName ?? "";
  const { columnNames, columnTypes, totalRows, isStreaming } = args;

  const [columnValuesDigest, setColumnValuesDigest] = React.useState<
    Record<string, string[]> | undefined
  >();
  const columnValuesDoneRef = React.useRef("");
  React.useEffect(() => {
    // Rapor hala akıyorsa (streaming) veya toplam satır sayısı 5 milyonu aşıyorsa digest sorgusu koşturma
    if (isStreaming || !totalRows || totalRows > 5_000_000) return;
    const key = `${tableName}:${Object.keys(columnTypes).length > 0 ? 1 : 0}:${totalRows ?? ""}`;
    if (columnValuesDoneRef.current === key) return;
    columnValuesDoneRef.current = key;
    const abortCtrl = new AbortController();
    void (async () => {
      try {
        const digest = await computeColumnValuesDigest({
          tableName,
          columns: columnNames,
          columnTypes,
          rowCount: totalRows,
          signal: abortCtrl.signal,
          client: wasmSqlClient,
        });
        if (!abortCtrl.signal.aborted) setColumnValuesDigest(digest ?? undefined);
      } catch {
        // Digest is optional metadata, never crash the report grid
      }
    })();
    return () => {
      abortCtrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, columnTypes, totalRows, isStreaming]);

  return columnValuesDigest;
}
