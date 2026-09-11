"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Pin, Table } from "lucide-react";
import { findReport } from "@/features/reports/report-registry";
import {
  buildPinnedChartId,
  usePinnedCharts,
  type PinnedChart,
} from "@/hooks/use-pinned-charts";
import { useYulaGridStore } from "@/lib/stores/grid";
import {
  extractJobIdFromHref,
  reportExecutionHref,
  reportExecutionPath,
} from "@/lib/workspace-paths";
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

function resolveChartSourceContext(pathname: string, search: string) {
  const screen = useYulaGridStore.getState().screen;
  const spec = useYulaGridStore.getState().spec;
  const workspace = screen?.workspaceId?.trim() || "stock";
  const reportScope = screen?.reportScope ?? spec?.reportScope;
  const jobId =
    screen?.jobId?.trim() ||
    extractJobIdFromHref(`${pathname}${search}`) ||
    undefined;

  let pagePath = reportExecutionPath(pathname) ?? pathname;
  if (reportScope) {
    const meta = findReport(reportScope);
    if (meta?.pagePath) pagePath = meta.pagePath;
  }

  const sourceHref =
    jobId && pagePath
      ? reportExecutionHref(pagePath, jobId)
      : pagePath || pathname || "/";

  return { workspace, reportScope, jobId, sourceHref };
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
  /** Sohbet kartında pin göster (landing gömülü kullanımda kapatılabilir). */
  pinEnabled = true,
  /** Landing’de daha kısa grafik yüksekliği. */
  compact = false,
  /** Grid’e yaz butonu (landing’de kapalı). */
  showGridAction = true,
  /** Dashboard gömülü kullanımda bordersız soft KPI görünümü. */
  borderless = false,
}: {
  output: unknown;
  className?: string;
  pinEnabled?: boolean;
  compact?: boolean;
  showGridAction?: boolean;
  borderless?: boolean;
}) {
  const t = useTranslations("ChartCard")
  const parsed = React.useMemo(() => parseChartOutput(output), [output]);
  const uid = React.useId().replace(/:/g, "");
  const pathname = usePathname() ?? "/";
  const screen = useYulaGridStore((s) => s.screen);
  const spec = useYulaGridStore((s) => s.spec);
  const { isPinned, togglePin } = usePinnedCharts();

  const sourceCtx = React.useMemo(() => {
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    // screen/spec değişince yeniden çöz (jobId kaydı gecikmeli gelebilir)
    void screen;
    void spec;
    return resolveChartSourceContext(pathname, search);
  }, [pathname, screen, spec]);

  const pinId = React.useMemo(() => {
    if (!parsed) return null;
    return buildPinnedChartId({
      workspace: sourceCtx.workspace,
      title: parsed.title,
      chartType: parsed.chartType,
      dimensionX: parsed.dimensionX,
      dimensionY: parsed.dimensionY,
      reportScope: sourceCtx.reportScope,
    });
  }, [parsed, sourceCtx]);

  const pinned = pinId ? isPinned(pinId) : false;

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

  const handleTogglePin = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!parsed || !pinId) return;
      const search =
        typeof window !== "undefined" ? window.location.search : "";
      const fresh = resolveChartSourceContext(pathname, search);
      const item: PinnedChart = {
        id: pinId,
        workspace: fresh.workspace,
        title: parsed.title,
        chartType: parsed.chartType,
        description: parsed.description,
        takeaway: parsed.takeaway,
        dimensionX: parsed.dimensionX,
        dimensionY: parsed.dimensionY,
        rows: parsed.rows,
        sql: parsed.sql,
        sourceHref: fresh.sourceHref,
        reportScope: fresh.reportScope,
        jobId: fresh.jobId,
        pinnedAt: Date.now(),
      };
      togglePin(item);
    },
    [parsed, pinId, pathname, togglePin],
  );

  if (!parsed) return null;
  const { chartType, title, description, takeaway, dimensionY, rows } = parsed;
  const multiSeries = dimensionY.length > 1;

  // Ton merdiveni: orijinal sıralamada en yüksek (ilk) bar tam doygun
  const toneStep = 0.6 / Math.max(1, rows.length - 1);
  const tone = (originalIndex: number) =>
    Math.max(0.35, 1 - originalIndex * toneStep);

  // Yatay barda bar sayısına göre dinamik yükseklik (30 kategoriye kadar okunur)
  // Compact (dashboard) modda üstten kesmeyi önlemek için daha nefes alan min yükseklik.
  // Dashboard pie'da legend yana alındığı için grafik daha büyük çizilir.
  const isSideLegendPie = borderless && chartType === "pie";
  const chartHeight = compact
    ? chartType === "bar"
      ? Math.min(240, Math.max(160, rows.length * 24 + 48))
      : chartType === "pie"
        ? Math.min(240, Math.max(200, rows.length * 14 + 160))
        : 184
    : chartType === "bar"
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
        borderless
          ? "w-full overflow-hidden rounded-xl bg-transparent text-card-foreground border-0 shadow-none"
          : "w-full overflow-hidden rounded-md border bg-card text-card-foreground",
        className,
      )}
    >
      <div
        className={cn(
          "group/header flex h-7 items-center justify-between gap-2 px-3",
          borderless ? "border-0 bg-transparent" : "border-b bg-muted/40",
        )}
      >
        <p className="min-w-0 truncate text-[11px] font-medium leading-none">
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {pinEnabled ? (
            <button
              type="button"
              onClick={handleTogglePin}
              title={
                pinned
                  ? t("unpin_from_home")
                  : t("pin_to_home")
              }
              aria-pressed={pinned}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded p-0.5 transition-colors",
                pinned
                  ? "text-amber-500 hover:text-amber-600"
                  : "text-muted-foreground/70 hover:text-amber-500",
              )}
            >
              <Pin className={cn("size-3.5", pinned && "fill-current")} />
            </button>
          ) : null}
          {showGridAction && parsed.sql ? (
            <button
              type="button"
              onClick={handleShowInGrid}
              title={t("show_in_grid")}
              className="flex cursor-pointer items-center justify-center p-0.5 text-muted-foreground/70 transition-colors hover:text-orange-600 dark:hover:text-orange-400"
            >
              <Table className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      {!borderless && description ? (
        <div className="px-3 pt-1.5">
          <p className="text-[11px] leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
      ) : null}
      {isSideLegendPie ? (
        <div className="flex w-full items-stretch gap-1 px-2 pt-2 pb-1">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto min-w-0 flex-1"
            style={{ height: chartHeight }}
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelKey="label"
                    formatter={(value) =>
                      numberFmt.format(Number(value ?? 0))
                    }
                  />
                }
              />
              <Pie
                data={rows}
                dataKey={dimensionY[0]}
                nameKey="label"
                innerRadius={Math.max(40, chartHeight * 0.22)}
                outerRadius={Math.max(68, chartHeight * 0.38)}
                paddingAngle={2}
                strokeWidth={1}
              >
                {rows.map((_, i) => (
                  <Cell
                    key={i}
                    fill={CHART_COLORS[0]}
                    fillOpacity={tone(i)}
                    stroke="var(--background)"
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul
            className="flex w-32 shrink-0 flex-col justify-center gap-1 overflow-y-auto py-1 pr-1"
            style={{ maxHeight: chartHeight }}
          >
            {rows.map((row, i) => (
              <li
                key={i}
                className="flex min-w-0 items-center gap-1.5 text-[10px] leading-tight"
                title={`${String(row.label ?? "")}: ${numberFmt.format(Number(row[dimensionY[0]] ?? 0))}`}
              >
                <span
                  className="size-2 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: CHART_COLORS[0],
                    opacity: tone(i),
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground/85">
                  {String(row.label ?? "")}
                </span>
                <span className="shrink-0 font-medium text-foreground">
                  {compactFmt.format(Number(row[dimensionY[0]] ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
      <ChartContainer
        config={chartConfig}
        className="aspect-auto w-full px-2 pt-2 pb-1"
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
              innerRadius={compact ? 30 : 36}
              outerRadius={compact ? 58 : 70}
              paddingAngle={2}
              strokeWidth={1}
            >
              {rows.map((_, i) => (
                <Cell
                  key={i}
                  fill={CHART_COLORS[0]}
                  fillOpacity={tone(i)}
                  stroke={borderless ? "var(--background)" : "var(--card)"}
                />
              ))}
            </Pie>
          </PieChart>
        ) : chartType === "line" ? (
          <AreaChart
            data={rows}
            margin={{ top: 12, right: 20, bottom: 4, left: 4 }}
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
            margin={{ top: 8, right: 20, bottom: 4, left: 4 }}
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
      )}
      {takeaway && !borderless ? (
        <div
          className={cn(
            "flex h-7 items-center px-3",
            borderless ? "border-0 bg-transparent" : "border-t bg-muted/40",
          )}
        >
          <p className="truncate text-[11px] leading-none text-muted-foreground">
            <span className="mr-1">💡</span>
            {takeaway}
          </p>
        </div>
      ) : null}
    </div>
  );
}
