/**
 * Grafik aggregasyon sorgusu üreticisi — saf modül.
 *
 * "Config gönder, data gönderme" ilkesi: model yalnız boyutları (dimensionX/
 * dimensionY) bildirir; veri burada üretilen tek deterministik SELECT ile
 * DuckDB'den hesaplanır. Model satır verisi taşıyamaz.
 */

export type ChartAggregation = "sum" | "avg" | "min" | "max" | "count";

export interface ChartQueryInput {
  /** FROM ifadesi: tablo adı ya da `(custom sql) AS alias` */
  fromExpr: string;
  /** Kategori (X) kolonu — arayan taraf spec.columns ile doğrulamalı */
  labelKey: string;
  /** Ölçü kolonları — count dışında zorunlu; sayısal doğrulaması arayan tarafta */
  valueKeys: string[];
  aggregation?: ChartAggregation;
  /** Grafik kartında gösterilecek maksimum grup sayısı */
  limit?: number;
}

function sqlSafeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/**
 * `SELECT label, SUM(v1), ... FROM x GROUP BY label ORDER BY ilk ölçü DESC LIMIT n`
 * üretir. Geçersiz girdide (boş kolon adları) null döner.
 */
export function buildChartQuery(input: ChartQueryInput): string | null {
  const label = input.labelKey.trim();
  const valueKeys = input.valueKeys.map((k) => k.trim()).filter(Boolean);
  const agg = input.aggregation ?? "sum";
  if (!label) return null;
  if (agg !== "count" && valueKeys.length === 0) return null;
  const limit = Math.max(1, Math.min(50, input.limit ?? 30));

  const labelSel = `COALESCE(CAST(${sqlSafeId(label)} AS VARCHAR), '(boş)') AS label`;
  const valueSel =
    agg === "count"
      ? `COUNT(*) AS "Kayıt"`
      : valueKeys
          .map(
            (k) =>
              `ROUND(${agg.toUpperCase()}(${sqlSafeId(k)}), 2) AS ${sqlSafeId(k)}`,
          )
          .join(", ");
  const orderCol =
    agg === "count" ? `"Kayıt"` : sqlSafeId(valueKeys[0] ?? "value");
  return `SELECT ${labelSel}, ${valueSel} FROM ${input.fromExpr} GROUP BY 1 ORDER BY ${orderCol} DESC LIMIT ${limit}`;
}
