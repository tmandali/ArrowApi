import { useYulaGridStore } from "@/lib/stores/grid";
import {
  sqlSafeId,
  resolveActiveDataset,
  gridStillStreaming,
} from "./dataset";

export async function analyzeGrid(
  input: Record<string, unknown>,
): Promise<unknown> {
  const ds = await resolveActiveDataset();
  if (!ds) {
    return {
      status: "error",
      error: "Açık tablo yok.",
      hint: "Sonuç tablosu henüz yüklenmedi; birkaç saniye sonra tekrar deneyin.",
    };
  }

  const op = String(input.operation ?? "count");
  const column =
    typeof input.column === "string" ? input.column : undefined;
  const byColumn =
    typeof input.byColumn === "string" ? input.byColumn : undefined;
  const topN = Number(input.topN ?? 5);

  try {
    if (await gridStillStreaming(ds.tableName)) {
      return {
        status: "error",
        error: "Rapor hâlâ yükleniyor.",
        hint: "Yükleme bitince 'analiz et'i tekrar gönder.",
      };
    }

    const { duckDbClient } = await import("@/services/duckdb");
    const tableLabel = ds.isCustom ? "(aktif özel görünüm)" : ds.tableName;

    if (op === "count") {
      if (byColumn && ds.columns.includes(byColumn)) {
        const gcol = sqlSafeId(byColumn);
        const limitN = Math.max(1, Math.min(50, topN));
        const rows = await duckDbClient.executeCustomSql(
          `SELECT ${gcol} AS label, COUNT(*) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${limitN}`,
        );
        return {
          status: "ok",
          operation: "count-by",
          table: tableLabel,
          byColumn,
          items: rows.map((r) => ({
            label: String(r.label ?? ""),
            value: Number(r.value ?? 0),
          })),
        };
      }
      const countExpr =
        column && ds.columns.includes(column)
          ? `COUNT(${sqlSafeId(column)})`
          : "COUNT(*)";
      const rows = await duckDbClient.executeCustomSql(
        `SELECT ${countExpr} AS cnt FROM ${ds.from}`,
      );
      return {
        status: "ok",
        operation: "count",
        table: tableLabel,
        column,
        count: Number(rows[0]?.cnt ?? 0),
      };
    }

    if (!column || !ds.columns.includes(column)) {
      return {
        status: "error",
        error: `Invalid column: ${String(column)}`,
        availableColumns: ds.columns,
        numericColumns: [...ds.numeric],
        hint: "Select a column from availableColumns; numericColumns required for sum/avg.",
      };
    }

    // Sayısal olmayan kolonda top istendiyse: en sık geçen değerlerin sayımı (frekans analizi)
    if (!ds.numeric.has(column)) {
      if (op === "top") {
        const col = sqlSafeId(column);
        const limitN = Math.max(1, Math.min(10, topN));
        const rows = await duckDbClient.executeCustomSql(
          `SELECT ${col} AS label, COUNT(*) AS value FROM ${ds.from} GROUP BY ${col} ORDER BY value DESC LIMIT ${limitN}`,
        );
        return {
          status: "ok",
          operation: "top-count",
          table: tableLabel,
          column,
          items: rows.map((r) => ({
            label: String(r.label ?? ""),
            value: Number(r.value ?? 0),
          })),
        };
      }
      return {
        status: "error",
        error: `"${column}" is not a numeric column; SUM/AVG cannot be applied.`,
        numericColumns: [...ds.numeric],
        hint: "Retry calling this tool with a column from numericColumns.",
      };
    }
    const col = sqlSafeId(column);

    if (op === "sum" || op === "avg" || op === "min" || op === "max") {
      if (byColumn && ds.columns.includes(byColumn)) {
        const gcol = sqlSafeId(byColumn);
        const rows = await duckDbClient.executeCustomSql(
          `SELECT ${gcol} AS label, ROUND(${op.toUpperCase()}(${col}), 2) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${Math.max(1, Math.min(10, topN))}`,
        );
        return {
          status: "ok",
          operation: `${op}-by`,
          table: tableLabel,
          column,
          byColumn,
          items: rows.map((r) => ({
            label: String(r.label ?? ""),
            value: Number(r.value ?? 0),
          })),
        };
      }

      const rows = await duckDbClient.executeCustomSql(
        `SELECT ${op.toUpperCase()}(${col}) AS value FROM ${ds.from}`,
      );
      return {
        status: "ok",
        operation: op,
        table: tableLabel,
        column,
        value: Number(rows[0]?.value ?? 0),
      };
    }

    const { looksLikeIdentifierValues } = await import("@/lib/grid-column-values");
    const columnValues = useYulaGridStore.getState().spec?.columnValues;
    const groupCol =
      byColumn && ds.columns.includes(byColumn)
        ? byColumn
        : ds.columns.find(
            (c) =>
              c !== column &&
              !ds.numeric.has(c) &&
              !looksLikeIdentifierValues(columnValues?.[c]),
          ) ||
          ds.columns.find((c) => c !== column && !ds.numeric.has(c)) ||
          column;
    const gcol = sqlSafeId(groupCol);
    const rows = await duckDbClient.executeCustomSql(
      `SELECT ${gcol} AS label, SUM(${col}) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${Math.max(1, Math.min(10, topN))}`,
    );
    return {
      status: "ok",
      operation: "top",
      table: tableLabel,
      column,
      byColumn: groupCol,
      items: rows.map((r) => ({
        label: String(r.label ?? ""),
        value: Number(r.value ?? 0),
      })),
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      availableColumns: ds.columns,
      numericColumns: [...ds.numeric],
      hint: "Fix the query using this column list and retry.",
    };
  }
}

type ProfileColumnKind = "numeric" | "text" | "date" | "boolean" | "other";

function classifyDuckType(
  duckType: string | undefined,
  isNumeric: boolean
): ProfileColumnKind {
  const t = (duckType ?? "").toLowerCase();
  if (/bool/.test(t)) return "boolean";
  if (/timestamp|date/.test(t)) return "date";
  if (isNumeric || /int|decimal|double|float|real|numeric|hugeint/.test(t)) {
    return "numeric";
  }
  if (/varchar|char|text|string|enum|uuid/.test(t)) return "text";
  return isNumeric ? "numeric" : "text";
}

function sqlAlias(col: string): string {
  return `__c_${col.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export async function profileGrid(): Promise<unknown> {
  const ds = await resolveActiveDataset();
  if (!ds) {
    return {
      status: "error",
      error: "No active table found.",
      hint: "Results table is not ready yet; please wait a moment and try again.",
    };
  }

  try {
    if (await gridStillStreaming(ds.tableName)) {
      return {
        status: "error",
        error: "Report data is still loading.",
        hint: "Wait until loading finishes and retry.",
      };
    }

    const { duckDbClient } = await import("@/services/duckdb");
    const { buildCombinedWhereClause } = await import(
      "@/services/duckdb/filter-parser"
    );
    const filters = useYulaGridStore.getState().filters;
    const where = buildCombinedWhereClause(filters, ds.numeric);

    const kindOf = (name: string): ProfileColumnKind => {
      const meta = ds.described?.find((c) => c.name === name);
      if (meta) return classifyDuckType(meta.duckType, meta.isNumeric);
      return ds.numeric.has(name) ? "numeric" : "text";
    };

    const aggParts: string[] = ["COUNT(*) AS __row_count"];
    for (const col of ds.columns) {
      const q = sqlSafeId(col);
      const a = sqlAlias(col);
      const kind = kindOf(col);
      aggParts.push(`SUM(CASE WHEN ${q} IS NULL THEN 1 ELSE 0 END) AS ${a}_nulls`);
      aggParts.push(`approx_count_distinct(${q}) AS ${a}_distinct`);
      if (kind === "numeric") {
        aggParts.push(
          `MIN(${q}) AS ${a}_min, MAX(${q}) AS ${a}_max, ROUND(AVG(${q}), 4) AS ${a}_avg, ROUND(SUM(${q}), 4) AS ${a}_sum, SUM(CASE WHEN ${q} < 0 THEN 1 ELSE 0 END) AS ${a}_negative`
        );
      } else if (kind === "date") {
        aggParts.push(
          `CAST(MIN(${q}) AS VARCHAR) AS ${a}_min, CAST(MAX(${q}) AS VARCHAR) AS ${a}_max`
        );
      }
    }

    const aggRows = await duckDbClient.executeCustomSql(
      `SELECT ${aggParts.join(", ")} FROM ${ds.from} ${where}`
    );
    const agg = aggRows[0] ?? {};

    const textCols = ds.columns
      .filter((col) => kindOf(col) === "text")
      .slice(0, 4);
    const topValuesByColumn: Record<string, { value: string; count: number }[]> = {};
    for (const col of textCols) {
      const q = sqlSafeId(col);
      try {
        const rows = await duckDbClient.executeCustomSql(
          `SELECT CAST(${q} AS VARCHAR) AS value, COUNT(*) AS cnt FROM (SELECT * FROM (SELECT * FROM ${ds.from} ${where}) AS __yula_profile_filtered USING SAMPLE 10% (bernoulli)) AS __yula_profile_sample GROUP BY 1 ORDER BY cnt DESC LIMIT 3`,
        );
        topValuesByColumn[col] = rows.map((r) => ({
          value: String(r.value ?? ""),
          count: Number(r.cnt ?? 0),
        }));
      } catch (err) {
        console.warn(`[Yula exec] profil top-values hatası (${col}):`, err);
      }
    }

    const columns = ds.columns.map((col) => {
      const a = sqlAlias(col);
      const kind = kindOf(col);
      const entry: Record<string, unknown> = {
        name: col,
        kind,
        nullCount: Number(agg[`${a}_nulls`] ?? 0),
        distinctCount: Number(agg[`${a}_distinct`] ?? 0),
      };
      if (kind === "numeric") {
        entry.numeric = {
          min: agg[`${a}_min`] ?? null,
          max: agg[`${a}_max`] ?? null,
          avg: agg[`${a}_avg`] ?? null,
          sum: agg[`${a}_sum`] ?? null,
          negativeCount: Number(agg[`${a}_negative`] ?? 0),
        };
      } else if (kind === "date") {
        entry.dateRange = {
          min: agg[`${a}_min`] ?? null,
          max: agg[`${a}_max`] ?? null,
        };
      }
      if (topValuesByColumn[col]) {
        entry.topValues = topValuesByColumn[col];
      }
      return entry;
    });

    const filterSummary = Object.entries(filters)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${k}=${v}`);

    return {
      status: "ok",
      table: ds.tableName,
      view: ds.isCustom ? "custom" : "base",
      rowCount: Number(agg.__row_count ?? 0),
      filtersApplied: filterSummary,
      columns,
      note: "Table profiling results above (cardinality approximate; top values sampled). Provide a clear and comprehensive summary in the user's language based on these findings. Do not call another tool.",
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
