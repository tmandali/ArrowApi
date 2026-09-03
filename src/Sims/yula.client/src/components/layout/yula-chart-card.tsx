"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Table } from "lucide-react";
import { useYulaGridStore } from "@/lib/stores/grid";
import { cn } from "@/utils/cn";

/** Yula paleti: marka turuncusu → primary → chart blues (tema token'ları) */
const CHART_COLORS = [
  "var(--yula-accent)",
  "var(--primary)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
];

const numberFmt = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});
/** Eksen için kompakt sayı: 24980000 → "25 Mn" */
const compactFmt = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Uzun kategori etiketini üç nokta ile kısaltır; sondaki ayırt edici kısmı korur. */
function truncateTick(value: unknown, max = 14): string {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 4)}…${s.slice(-3)}`;
}

interface ParsedChart {
  chartType: "bar" | "line" | "pie";
  title: string;
  description?: string;
  takeaway?: string;
  dimensionX: string;
  dimensionY: string[];
  rows: Array<Record<string, unknown>>;
  sql?: string;
}

function parseChartOutput(output: unknown): ParsedChart | null {
  const o =
    typeof output === "object" && output !== null
      ? (output as Record<string, unknown>)
      : null;
  if (!o || o.status !== "ok") return null;
  const chart =
    typeof o.chart === "object" && o.chart !== null
      ? (o.chart as Record<string, unknown>)
      : null;
  if (!chart || !Array.isArray(o.rows) || o.rows.length === 0) return null;
  const chartType = chart.chartType;
  if (
    typeof chartType !== "string" ||
    !["bar", "line", "pie"].includes(chartType)
  ) {
    return null;
  }
  // Yeni kontrat: dimensionX/dimensionY — eski konuşmalar: labelKey/valueKeys
  const dimensionX =
    typeof chart.dimensionX === "string"
      ? chart.dimensionX
      : typeof chart.labelKey === "string"
        ? chart.labelKey
        : "";
  const dimensionY = (
    Array.isArray(chart.dimensionY)
      ? chart.dimensionY
      : Array.isArray(chart.valueKeys)
        ? chart.valueKeys
        : []
  ).filter((k): k is string => typeof k === "string");
  if (!dimensionX || dimensionY.length === 0) return null;
  return {
    chartType: chartType as ParsedChart["chartType"],
    title: typeof chart.title === "string" ? chart.title : "Grafik",
    description:
      typeof chart.description === "string" ? chart.description : undefined,
    takeaway: typeof chart.takeaway === "string" ? chart.takeaway : undefined,
    dimensionX,
    dimensionY,
    rows: o.rows as Array<Record<string, unknown>>,
    sql: typeof o.sql === "string" ? o.sql : undefined,
  };
}

/**
 * visualize_grid_data kartı — tek jenerik render yolu.
 * Kontrat: model yalnız { chartType, dimensionX, dimensionY, aggregation }
 * bildirir; satırlar aggregasyonundan gelir (model transkripsiyonu yok).
 * Renkler doğrudan paletten (tema token'ları) — seriler ve pie dilimleri.
 */
export function YulaChartCard({
  output,
  className,
}: {
  output: unknown;
  className?: string;
}) {
  const outputKey = React.useMemo(() => {
    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }, [output]);

  const parsed = React.useMemo(() => parseChartOutput(output), [outputKey]);
  const uid = React.useId().replace(/:/g, "");

  // Legend/tooltip etiket sözleşmesi: bar/line → seri adları; pie → dilim adları
  const chartConfig = React.useMemo<ChartConfig>(() => {
    if (!parsed) return {};
    const config: ChartConfig = {};
    if (parsed.chartType === "pie") {
      // PIE: config anahtarları dilim adları; renkler TEK hue'nun tonları
      // (bar ile aynı dil) — karışık palet değil.
      const toneStep = 0.6 / Math.max(1, parsed.rows.length - 1);
      parsed.rows.forEach((row, i) => {
        const name = String(row.label ?? "");
        if (!name) return;
        config[name] = {
          label: name,
          color: `color-mix(in oklch, ${CHART_COLORS[0]} ${Math.round(
            Math.max(0.35, 1 - i * toneStep) * 100,
          )}%, var(--card))`,
        };
      });
      return config;
    }
    parsed.dimensionY.forEach((k, i) => {
      config[k] = { label: k, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    return config;
  }, [parsed]);

  // Yatay barda en yüksek değer ÜSTTE görünmesi için ters çevir
  const barRows = React.useMemo(
    () => (parsed ? [...parsed.rows].reverse() : []),
    [parsed],
  );

  const handleShowInGrid = React.useCallback(() => {
    if (!parsed?.sql) return;
    useYulaGridStore.getState().setCustomQuerySql(parsed.sql, parsed.title);
  }, [parsed]);

  if (!parsed) return null;
  const { chartType, title, description, takeaway, dimensionY, rows } = parsed;
  const multiSeries = dimensionY.length > 1;

  // Ton merdiveni: orijinal sıralamada en yüksek (ilk) bar tam doygun
  const toneStep = 0.6 / Math.max(1, rows.length - 1);
  const tone = (originalIndex: number) =>
    Math.max(0.35, 1 - originalIndex * toneStep);

  // Yatay barda bar sayısına göre dinamik yükseklik (30 kategoriye kadar okunur)
  const chartHeight =
    chartType === "bar"
      ? Math.min(420, Math.max(180, rows.length * 26 + 48))
      : 224;

  const tooltipContent = (
    <ChartTooltipContent
      labelKey="label"
      formatter={(value, name) =>
        `${name}: ${numberFmt.format(Number(value ?? 0))}`
      }
    />
  );

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-md border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="group/header flex h-7 items-center justify-between border-b bg-muted/40 px-3">
        <p className="text-[11px] font-medium leading-none">{title}</p>
        {parsed.sql ? (
          <button
            type="button"
            onClick={handleShowInGrid}
            title="Grafik sorgusu sonucunu ekrandaki gridte göster"
            className="flex cursor-pointer items-center justify-center p-0.5 text-muted-foreground/70 transition-colors hover:text-orange-600 dark:hover:text-orange-400"
          >
            <Table className="size-3.5" />
          </button>
        ) : null}
      </div>
      {description ? (
        <div className="px-3 pt-1.5">
          <p className="text-[11px] leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
      ) : null}
      <ChartContainer
        config={chartConfig}
        className="aspect-auto w-full px-2"
        style={{ height: chartHeight }}
      >
        {chartType === "pie" ? (
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelKey="label"
                  formatter={(value) => numberFmt.format(Number(value ?? 0))}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent nameKey="label" />} />
            <Pie
              data={rows}
              dataKey={dimensionY[0]}
              nameKey="label"
              innerRadius={36}
              outerRadius={70}
              paddingAngle={2}
              strokeWidth={1}
            >
              {rows.map((_, i) => (
                <Cell
                  key={i}
                  fill={CHART_COLORS[0]}
                  fillOpacity={tone(i)}
                  stroke="var(--card)"
                />
              ))}
            </Pie>
          </PieChart>
        ) : chartType === "line" ? (
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 20, bottom: 0, left: 4 }}
          >
            <defs>
              {dimensionY.map((k, i) => (
                <linearGradient key={k} id={`fill-${i}-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="95%"
                    stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickFormatter={truncateTick}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis tickLine={false} axisLine={false} width={56} />
            <ChartTooltip cursor={false} content={tooltipContent} />
            {multiSeries ? (
              <ChartLegend content={<ChartLegendContent />} />
            ) : null}
            {dimensionY.map((k, i) => (
              <Area
                key={k}
                dataKey={k}
                name={k}
                type="monotone"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={`url(#fill-${i}-${uid})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart
            data={barRows}
            layout="vertical"
            margin={{ top: 4, right: 20, bottom: 0, left: 4 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => compactFmt.format(Number(v ?? 0))}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={104}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => truncateTick(v, 14)}
            />
            <ChartTooltip cursor={false} content={tooltipContent} />
            {multiSeries ? (
              <ChartLegend content={<ChartLegendContent />} />
            ) : null}
            {dimensionY.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                name={k}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[0, 8, 8, 0]}
                maxBarSize={20}
              >
                {/* Tek seride barlar AYNI rengin tonları: en yüksek değer
                    (üstteki bar) tam doygun, aşağı doğru soluklaşır. */}
                {!multiSeries
                  ? barRows.map((_, d) => (
                      <Cell
                        key={d}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={tone(rows.length - 1 - d)}
                      />
                    ))
                  : null}
              </Bar>
            ))}
          </BarChart>
        )}
      </ChartContainer>
      {takeaway ? (
        <div className="flex h-7 items-center border-t bg-muted/40 px-3">
          <p className="truncate text-[11px] leading-none text-muted-foreground">
            <span className="mr-1">💡</span>
            {takeaway}
          </p>
        </div>
      ) : null}
    </div>
  );
}
