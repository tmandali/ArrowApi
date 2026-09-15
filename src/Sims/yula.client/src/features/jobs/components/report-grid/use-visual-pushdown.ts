"use client";

import * as React from "react";
import { duckDbClient } from "@/services/duckdb";
import { buildCombinedWhereClause } from "@/services/duckdb/filter-parser";
import type { SpreadsheetColumn } from "../virtual-spreadsheet";
import type { ColumnVisuals } from "./use-column-style-stats";

/**
 * Görsel katman (bar) ölçeği için tam veri seti üzerinden MIN/MAX.
 *
 * JS tarafındaki örneklem istatistikleri yalnızca YÜKLENMİŞ satırları görür;
 * bu pushdown sorgusu ise DuckDB WASM üzerinde TAM dosyayı tarar.
 * Böylece 100M satırda bile bar ölçeği doğru çizilir.
 *
 * Maliyet modeli:
 * - Varsayılan KAPALI: açık görsel kolon yoksa sorgu AÇILMAZ (sıfır maliyet).
 * - Kaldı: tek sorgu, tek satır sonuç — DuckDB rutin bir agregasyondur.
 * - 250ms debounce: kullanıcı birkaç kolonu art arda açsa bile tek atım.
 * - Aktif filtreler aynı where şartıyla uygulanır (footer özetleriyle uyumlu).
 */
export type VisualBounds = Record<string, { min: number; max: number }>;

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? NaN : Number(t);
  }
  if (v != null && typeof v === "object") {
    const fo = (v as { valueOf?: unknown }).valueOf;
    if (typeof fo === "function") return Number(fo.call(v));
  }
  return NaN;
}

function aliasFor(column: string, prefix: string): string {
  return `${prefix}_${column.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function useVisualPushdown(args: {
  duckTableName: string | undefined;
  effectiveColumns: readonly SpreadsheetColumn[];
  numericColumns: Set<string>;
  booleanColumns: Set<string>;
  filters: Record<string, string>;
  /** Açık görsel katmanlı kolonlar (varsayılan: tümü kapalı) */
  enabledColumns: ColumnVisuals;
  isStreaming: boolean;
  isSavingDisk: boolean;
}): VisualBounds {
  const {
    duckTableName,
    effectiveColumns,
    numericColumns,
    booleanColumns,
    filters,
    enabledColumns,
    isStreaming,
    isSavingDisk,
  } = args;

  const [bounds, setBounds] = React.useState<VisualBounds>({});

  React.useEffect(() => {
    // Yalnızca sayısal + açık görsel kolonlar bar ölçeğine adaydır.
    const enabled = effectiveColumns.filter(
      (c) => enabledColumns[c.name] && numericColumns.has(c.name)
    );
    if (!duckTableName || enabled.length === 0 || isStreaming || isSavingDisk) {
      setBounds({});
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const where = buildCombinedWhereClause(filters, numericColumns, booleanColumns);
        const selectParts: string[] = [];
        for (const c of enabled) {
          const safeCol = `"${c.name.replace(/"/g, '""')}"`;
          selectParts.push(`MIN(${safeCol}) AS "${aliasFor(c.name, "vmin")}"`);
          selectParts.push(`MAX(${safeCol}) AS "${aliasFor(c.name, "vmax")}"`);
        }
        const escapedTable = `"${duckTableName.replace(/"/g, '""')}"`;
        const sql = `SELECT ${selectParts.join(", ")} FROM ${escapedTable} ${where};`;
        const rows = await duckDbClient.executeCustomSql(sql);
        if (cancelled || !rows || rows.length === 0) return;
        const row = rows[0];

        const next: VisualBounds = {};
        for (const c of enabled) {
          const min = toNumber(row[aliasFor(c.name, "vmin")]);
          const max = toNumber(row[aliasFor(c.name, "vmax")]);
          if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
            next[c.name] = { min, max };
          }
        }
        if (!cancelled) setBounds(next);
      } catch {
        // Tablo henüz hazır değil / geçici hata — örneklem fallback'i devrede kalır.
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [duckTableName, effectiveColumns, numericColumns, booleanColumns, filters, enabledColumns, isStreaming, isSavingDisk]);

  return bounds;
}
