import { useYulaGridStore } from "@/lib/stores/grid";
import {
  buildChartQuery,
  inferChartOrderMode,
  type ChartOrderMode,
} from "@/lib/chart-query";
import {
  sqlSafeId,
  resolveActiveDataset,
} from "./dataset";

/**
 * visualize_grid_data — modelin ürettiği grafik KONFİGÜRASYONUNU deterministik
 * aggregasyonuyla veriye çevirir. Model satır verisi taşımaz; kart
 * dönen gerçek satırlardan çizilir (transkripsiyon hatası imkânsızlaşır).
 */
export async function visualizeGrid(
  input: Record<string, unknown>,
): Promise<unknown> {
  const ds = await resolveActiveDataset();
  if (!ds) {
    return {
      status: "error",
      error: "No active table found.",
      hint: "Results table is not ready yet; please wait a moment and try again.",
    };
  }

  let rawChartType = String(input.chartType ?? input.type ?? "bar").toLowerCase();
  if (rawChartType === "area") rawChartType = "line";
  const chartType = ["bar", "line", "pie"].includes(rawChartType)
    ? rawChartType
    : "bar";

  const labelKey = String(
    input.dimensionX ?? input.dimension ?? input.labelKey ?? "",
  ).trim();
  const rawMetrics = input.dimensionY ?? input.metric ?? input.valueKeys;
  const valueKeys = (
    Array.isArray(rawMetrics)
      ? rawMetrics
      : typeof rawMetrics === "string"
        ? [rawMetrics]
        : []
  )
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
  const aggregation = (["sum", "avg", "min", "max", "count"] as const).includes(
    input.aggregation as "sum",
  )
    ? (input.aggregation as "sum" | "avg" | "min" | "max" | "count")
    : "sum";

  let activeColumns = ds.columns;
  let activeNumeric = ds.numeric;
  let activeFrom = ds.from;

  // Özel görünüm aktifse ancak istenen kolonlar yalnız temel tabloda varsa, temel tabloya geç
  if (
    ds.isCustom &&
    ds.baseColumns &&
    (!activeColumns.includes(labelKey) || valueKeys.some((k) => !activeColumns.includes(k))) &&
    ds.baseColumns.includes(labelKey)
  ) {
    activeFrom = sqlSafeId(ds.tableName);
    activeColumns = ds.baseColumns;
    try {
      const { wasmSqlClient } = await import("@/services/wasmsql");
      const described = await wasmSqlClient.describeTable(ds.tableName);
      activeNumeric = new Set(described.filter((c) => c.isNumeric).map((c) => c.name));
    } catch {
      activeNumeric = new Set(
        ds.baseColumns.filter((c) =>
          /qty|total|sum|avg|count|amount|price|balance|miktar|tutar|bakiye/i.test(c),
        ),
      );
    }
  }

  if (!labelKey || !activeColumns.includes(labelKey)) {
    return {
      status: "error",
      error: labelKey
        ? `Invalid category column: ${labelKey}`
        : "Category column (dimension / dimensionX) cannot be empty.",
      availableColumns: activeColumns,
      hint: "dimension (or dimensionX) must be a text column from availableColumns.",
    };
  }

  const invalid = valueKeys.filter((k) => !activeColumns.includes(k));
  if (aggregation !== "count" && (valueKeys.length === 0 || invalid.length > 0)) {
    return {
      status: "error",
      error:
        invalid.length > 0
          ? `Invalid metric column(s): ${invalid.join(", ")}`
          : "metric (or dimensionY) cannot be empty.",
      numericColumns: [...activeNumeric],
      hint: "metric (or dimensionY) must be numeric column(s) from numericColumns.",
    };
  }
  const nonNumeric = valueKeys.filter((k) => !activeNumeric.has(k));
  if (nonNumeric.length > 0) {
    return {
      status: "error",
      error: `Non-numeric metric column(s): ${nonNumeric.join(", ")}`,
      numericColumns: [...activeNumeric],
      hint: "Retry calling this tool with columns from numericColumns.",
    };
  }

  const seriesNames =
    aggregation === "count" && valueKeys.length === 0
      ? ["Records"]
      : valueKeys;

  const titleHint =
    typeof input.title === "string" ? input.title : undefined;
  const descriptionHint =
    typeof input.description === "string" ? input.description : undefined;
  const takeawayHint =
    typeof input.takeaway === "string" ? input.takeaway : undefined;
  const orderMode: ChartOrderMode = inferChartOrderMode(
    typeof input.orderMode === "string" ? input.orderMode : undefined,
    {
      title: titleHint,
      description: descriptionHint,
      takeaway: takeawayHint,
    },
  );

  let appearanceOrderBy: string | undefined;
  if (orderMode === "appearance") {
    const snap = useYulaGridStore.getState().runtimeApi?.getGridState?.();
    if (snap?.sortBy && ds.columns.includes(snap.sortBy)) {
      appearanceOrderBy = `${sqlSafeId(snap.sortBy)} ${snap.sortDesc ? "DESC" : "ASC"}`;
    }
  }

  let fromExpr = activeFrom;
  const viewName = useYulaGridStore.getState().spec?.activeViewName?.trim();
  if (viewName && !ds.isCustom) {
    fromExpr = sqlSafeId(viewName);
  }

  const sql = buildChartQuery({
    fromExpr,
    labelKey,
    valueKeys: aggregation === "count" ? [] : valueKeys,
    aggregation,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    orderMode,
    appearanceOrderBy,
  });
  if (!sql) {
    return { status: "error", error: "Failed to generate chart query." };
  }

  try {
    const { wasmSqlClient } = await import("@/services/wasmsql");
    let rows: Record<string, unknown>[];
    try {
      rows = await wasmSqlClient.executeCustomSql(sql);
    } catch (viewErr) {
      if (fromExpr !== ds.from) {
        const fallbackSql = buildChartQuery({
          fromExpr: ds.from,
          labelKey,
          valueKeys: aggregation === "count" ? [] : valueKeys,
          aggregation,
          limit: typeof input.limit === "number" ? input.limit : undefined,
          orderMode,
          appearanceOrderBy,
        });
        if (!fallbackSql) throw viewErr;
        rows = await wasmSqlClient.executeCustomSql(fallbackSql);
      } else {
        throw viewErr;
      }
    }
    if (rows.length === 0) {
      if (
        ds.isCustom &&
        fromExpr !== sqlSafeId(ds.tableName) &&
        ds.baseColumns?.includes(labelKey)
      ) {
        const baseSql = buildChartQuery({
          fromExpr: sqlSafeId(ds.tableName),
          labelKey,
          valueKeys: aggregation === "count" ? [] : valueKeys,
          aggregation,
          limit: typeof input.limit === "number" ? input.limit : undefined,
          orderMode,
          appearanceOrderBy,
        });
        if (baseSql) {
          const baseRows = await wasmSqlClient.executeCustomSql(baseSql);
          if (baseRows.length > 0) {
            rows = baseRows;
          }
        }
      }
      if (rows.length === 0) {
        return {
          status: "error",
          error: "Query returned empty results; try different columns.",
        };
      }
    }
    return {
      status: "ok",
      success: true,
      sql,
      chart: {
        chartType,
        title:
          typeof input.title === "string" && input.title.trim()
            ? input.title.trim()
            : `${labelKey} chart`,
        description:
          typeof input.description === "string" ? input.description : undefined,
        takeaway:
          typeof input.takeaway === "string" ? input.takeaway : undefined,
        dimensionX: labelKey,
        dimensionY: seriesNames,
        aggregation,
        orderMode,
      },
      rowCount: rows.length,
      rows,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      hint: "Check column types; use numeric metric columns.",
    };
  }
}
