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

  const chartType = String(input.chartType ?? "bar");
  if (!["bar", "line", "pie"].includes(chartType)) {
    return {
      status: "error",
      error: `Invalid chart type: ${chartType}`,
      hint: "chartType must be bar | line | pie.",
    };
  }

  const labelKey = String(input.dimensionX ?? input.labelKey ?? "").trim();
  const valueKeys = (
    Array.isArray(input.dimensionY)
      ? input.dimensionY
      : typeof input.dimensionY === "string"
        ? [input.dimensionY]
        : Array.isArray(input.valueKeys)
          ? input.valueKeys
          : []
  ).map(String);
  const aggregation = (["sum", "avg", "min", "max", "count"] as const).includes(
    input.aggregation as "sum",
  )
    ? (input.aggregation as "sum" | "avg" | "min" | "max" | "count")
    : "sum";

  if (!labelKey || !ds.columns.includes(labelKey)) {
    return {
      status: "error",
      error: `Invalid category column: ${labelKey}`,
      availableColumns: ds.columns,
      hint: "dimensionX must be a text column from availableColumns.",
    };
  }

  const invalid = valueKeys.filter((k) => !ds.columns.includes(k));
  if (aggregation !== "count" && (valueKeys.length === 0 || invalid.length > 0)) {
    return {
      status: "error",
      error:
        invalid.length > 0
          ? `Invalid metric column(s): ${invalid.join(", ")}`
          : "dimensionY cannot be empty.",
      numericColumns: [...ds.numeric],
      hint: "dimensionY must be numeric column(s) from numericColumns.",
    };
  }
  const nonNumeric = valueKeys.filter((k) => !ds.numeric.has(k));
  if (nonNumeric.length > 0) {
    return {
      status: "error",
      error: `Non-numeric metric column(s): ${nonNumeric.join(", ")}`,
      numericColumns: [...ds.numeric],
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

  let fromExpr = ds.from;
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
    const { duckDbClient } = await import("@/services/duckdb");
    let rows: Record<string, unknown>[];
    try {
      rows = await duckDbClient.executeCustomSql(sql);
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
        rows = await duckDbClient.executeCustomSql(fallbackSql);
      } else {
        throw viewErr;
      }
    }
    if (rows.length === 0) {
      return {
        status: "error",
        error: "Query returned empty results; try different columns.",
      };
    }
    return {
      status: "ok",
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
