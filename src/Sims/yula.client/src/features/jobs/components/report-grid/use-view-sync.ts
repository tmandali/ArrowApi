"use client";

import * as React from "react";
import { duckDbClient } from "@/services/duckdb";
import { resolveActiveViewReferences } from "@/lib/sql-guard";
import { buildCombinedWhereClause } from "@/services/duckdb/filter-parser";
import type { AiSqlView, SpreadsheetColumn } from "../virtual-spreadsheet";

// Helper: Görünüm adını güvenli SQL tanımlayıcısına dönüştürür (örn: "Ege Bölgesi Satışları" -> "view_ege_bolgesi_satislari")
export function sanitizeViewIdentifier(name: string, id: string): string {
  const slug = name
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Şş]/g, "s")
    .replace(/[İıI]/g, "i")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase()
    .replace(/[^a-z0-9_]/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 30)
    .replace(/^_+|_+$/g, "");
  return `view_${slug || id.slice(0, 8)}`;
}

/**
 * DuckDB VIEW senkronu: kayıtlı AI görünümleri + canlı `active_view`
 * (300ms debounce; sıralama + filtre + özel SQL yansıtılır).
 */
export function useViewSync(args: {
  aiViews: AiSqlView[];
  duckTableName: string;
  isTableReady: boolean;
  isStreaming: boolean;
  isSavingDisk: boolean;
  effectiveColumns: SpreadsheetColumn[];
  filters: Record<string, string>;
  numericColumns: Set<string>;
  booleanColumns: Set<string>;
  sortBy: string | null;
  sortDesc: boolean;
  sortConfigs: Record<string, "asc" | "desc">;
  customQuerySql: string | null;
}) {
  const {
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
  } = args;

  // Kayıtlı AI SQL Görünümlerinin DuckDB VIEW eşlemesi
  const savedViewSpecs = React.useMemo(() => {
    return aiViews.map((v) => ({
      name: sanitizeViewIdentifier(v.title, v.id),
      title: v.title,
      sql: v.sql,
    }));
  }, [aiViews]);

  // Kayıtlı görünümleri DuckDB içinde SQL VIEW olarak senkronize et
  React.useEffect(() => {
    if (!duckTableName || !isTableReady || isStreaming || isSavingDisk) return;
    for (const v of savedViewSpecs) {
      // Kayıtlı görünüm SQL'i 'active_view' içeriyorsa döngüsel bağımlılığı (infinite recursion)
      // önlemek için temel tablo adına çözümlenir
      const resolvedSql = resolveActiveViewReferences(v.sql, duckTableName);
      void duckDbClient
        .createOrReplaceView({
          viewName: v.name,
          selectSql: resolvedSql,
        })
        .catch((err) => {
          console.warn(`[ArrowReportGrid] Saved view (${v.name}) DuckDB view sync error:`, err);
        });
    }
  }, [duckTableName, isTableReady, isStreaming, isSavingDisk, savedViewSpecs]);

  // Canlı aktif görünümü ("active_view") DuckDB VIEW olarak 300ms debounce ile senkronize et
  React.useEffect(() => {
    if (!duckTableName || !isTableReady || isStreaming || isSavingDisk || effectiveColumns.length === 0) return;

    const timer = setTimeout(() => {
      // 1. Sıralama clause'u (soldan sağa çoklu sıralama)
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

      let orderClause = "";
      if (sortList.length > 0) {
        orderClause = `ORDER BY ${sortList
          .map((s) => `"${s.column.replace(/"/g, '""')}" ${s.desc ? "DESC" : "ASC"}`)
          .join(", ")}`;
      }

      // 2. Filtre WHERE clause'u
      const whereClause = buildCombinedWhereClause(filters, numericColumns, booleanColumns);

      // 3. SELECT SQL oluşturma
      let selectSql = "";
      if (customQuerySql) {
        // active_view tanımlanırken kendi içine 'active_view' yazılması özyinelemeli döngü
        // ("infinite recursion detected: attempting to recursively bind view active_view") üretir.
        // Bu nedenle sorgu içindeki 'active_view' referansları fiziksel temel tabloya çözülür.
        const resolvedQuery = resolveActiveViewReferences(customQuerySql, duckTableName);
        const cleanQuery = resolvedQuery.trim().replace(/;+$/, "");
        selectSql = `SELECT * FROM (${cleanQuery}) AS __active_base ${whereClause} ${orderClause}`;
      } else {
        const selectCols = effectiveColumns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(", ");
        selectSql = `SELECT ${selectCols} FROM "${duckTableName.replace(/"/g, '""')}" ${whereClause} ${orderClause}`;
      }

      void duckDbClient
        .createOrReplaceView({
          viewName: "active_view",
          selectSql,
        })
        .catch((err) => {
          console.warn("[ArrowReportGrid] active_view DuckDB sync warning:", err);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [
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
  ]);

  return { savedViewSpecs };
}
