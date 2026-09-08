/**
 * Grafik aggregasyon sorgusu üreticisi — saf modül.
 *
 * "Config gönder, data gönderme" ilkesi: model yalnız boyutları (dimensionX/
 * dimensionY) bildirir; veri burada üretilen tek deterministik SELECT ile
 * DuckDB'den hesaplanır. Model satır verisi taşıyamaz.
 */

export type ChartAggregation = "sum" | "avg" | "min" | "max" | "count";

/**
 * - value_desc: en yüksek / top N (varsayılan)
 * - value_asc: en düşük N
 * - label_asc / label_desc: kategori (mağaza/depo) sırasında
 * - appearance: kaynak satır sırasındaki ilk N kategori (grid "ilk N")
 */
export type ChartOrderMode =
  | "value_desc"
  | "value_asc"
  | "label_asc"
  | "label_desc"
  | "appearance";

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
  /** Dilim/çubuk sırası — "ilk N" ≠ "en yüksek N" */
  orderMode?: ChartOrderMode;
  /**
   * appearance modunda ROW_NUMBER için ORDER BY parçası
   * (örn. `"Tutar" DESC`). Yoksa kaynağın tarama sırası kullanılır.
   */
  appearanceOrderBy?: string;
}

function sqlSafeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

function buildValueOrderClause(
  orderMode: Exclude<ChartOrderMode, "appearance">,
  orderCol: string
): string {
  switch (orderMode) {
    case "value_asc":
      return `ORDER BY ${orderCol} ASC`;
    case "label_asc":
      return `ORDER BY label ASC`;
    case "label_desc":
      return `ORDER BY label DESC`;
    case "value_desc":
      return `ORDER BY ${orderCol} DESC`;
    default: {
      const _exhaustive: never = orderMode;
      void _exhaustive;
      return `ORDER BY ${orderCol} DESC`;
    }
  }
}

/**
 * Model orderMode vermezse veya "ilk N" derken value_desc bırakırsa,
 * başlık/açıklama metninden sırayı çıkarır. "en yüksek/top" value_desc kazanır.
 * "ilk N" / mağaza sırasında → label_asc (kategori sırası, metrik değil).
 */
export function inferChartOrderMode(
  explicit: string | undefined | null,
  hints: { title?: string; description?: string; takeaway?: string } = {},
): ChartOrderMode {
  const raw = String(explicit ?? "").trim().toLowerCase();
  if (
    raw === "value_asc" ||
    raw === "label_asc" ||
    raw === "label_desc" ||
    raw === "appearance" ||
    raw === "value_desc"
  ) {
    // Model value_desc demiş olsa bile metin "ilk N" ve "en yüksek" yoksa label_asc
    if (raw === "value_desc") {
      const blob = [hints.title, hints.description, hints.takeaway]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      const wantsTop =
        /\ben\s+y[uü]ksek\b/.test(blob) ||
        /\ben\s+[cç]ok\b/.test(blob) ||
        /\btop\s*\d+\b/.test(blob) ||
        /\bhighest\b/.test(blob);
      const wantsLabelOrder =
        /\bilk\s*\d+\b/.test(blob) ||
        /\bfirst\s*\d+\b/.test(blob) ||
        /\bs[ıi]rada\b/.test(blob) ||
        /\bin\s+order\b/.test(blob) ||
        /\bma[gğ]aza\s*s[ıi]ras/.test(blob) ||
        /\bdepo\s*s[ıi]ras/.test(blob);
      if (wantsLabelOrder && !wantsTop) return "label_asc";
    }
    return raw;
  }

  const blob = [hints.title, hints.description, hints.takeaway]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  const wantsTop =
    /\ben\s+y[uü]ksek\b/.test(blob) ||
    /\ben\s+[cç]ok\b/.test(blob) ||
    /\btop\s*\d+\b/.test(blob) ||
    /\bhighest\b/.test(blob);
  const wantsLabelOrder =
    /\bilk\s*\d+\b/.test(blob) ||
    /\bfirst\s*\d+\b/.test(blob) ||
    /\bs[ıi]rada\b/.test(blob) ||
    /\bin\s+order\b/.test(blob) ||
    /\bma[gğ]aza\s*s[ıi]ras/.test(blob) ||
    /\bdepo\s*s[ıi]ras/.test(blob);
  if (wantsLabelOrder && !wantsTop) return "label_asc";
  if (/\ben\s+d[uü][sş][uü]k\b/.test(blob) || /\blowest\b/.test(blob)) {
    return "value_asc";
  }
  return "value_desc";
}

/**
 * `SELECT label, SUM(v1), ... FROM x GROUP BY label ORDER BY … LIMIT n`
 * üretir. Geçersiz girdide (boş kolon adları) null döner.
 */
export function buildChartQuery(input: ChartQueryInput): string | null {
  const label = input.labelKey.trim();
  const valueKeys = input.valueKeys.map((k) => k.trim()).filter(Boolean);
  const agg = input.aggregation ?? "sum";
  if (!label) return null;
  if (agg !== "count" && valueKeys.length === 0) return null;
  const limit = Math.max(1, Math.min(50, input.limit ?? 30));
  const orderMode: ChartOrderMode = input.orderMode ?? "value_desc";

  const labelExpr = `COALESCE(CAST(${sqlSafeId(label)} AS VARCHAR), '(boş)')`;
  const valueAggSel =
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

  // "ilk N mağaza" — kaynak sırasındaki ilk N kategori, dilimler de o sırada
  if (orderMode === "appearance") {
    const overOrder = input.appearanceOrderBy?.trim()
      ? `ORDER BY ${input.appearanceOrderBy.trim()}`
      : "";
    const numberedCols =
      agg === "count"
        ? `${labelExpr} AS label, ROW_NUMBER() OVER (${overOrder}) AS __rn`
        : `${labelExpr} AS label, ${valueKeys
            .map((k) => sqlSafeId(k))
            .join(", ")}, ROW_NUMBER() OVER (${overOrder}) AS __rn`;
    const joinAgg =
      agg === "count"
        ? `COUNT(*) AS "Kayıt"`
        : valueKeys
            .map(
              (k) =>
                `ROUND(${agg.toUpperCase()}(n.${sqlSafeId(k)}), 2) AS ${sqlSafeId(k)}`,
            )
            .join(", ");
    return [
      `WITH __numbered AS (SELECT ${numberedCols} FROM ${input.fromExpr}),`,
      `__first AS (SELECT label, MIN(__rn) AS first_rn FROM __numbered GROUP BY label ORDER BY first_rn LIMIT ${limit})`,
      `SELECT n.label, ${joinAgg}`,
      `FROM __numbered n INNER JOIN __first f ON n.label = f.label`,
      `GROUP BY n.label, f.first_rn`,
      `ORDER BY f.first_rn`,
    ].join(" ");
  }

  const labelSel = `${labelExpr} AS label`;
  const orderClause = buildValueOrderClause(orderMode, orderCol);
  return `SELECT ${labelSel}, ${valueAggSel} FROM ${input.fromExpr} GROUP BY 1 ${orderClause} LIMIT ${limit}`;
}
