"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pin, Table } from "lucide-react";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  buildPinnedChartId,
  usePinnedCharts,
  type PinnedChart,
} from "@/hooks/use-pinned-charts";
import { useYulaGridStore } from "@/lib/stores/grid";
import { cn } from "@/utils/cn";
import {
  CHART_COLORS,
  numberFmt,
  parseChartOutput,
  resolveChartSourceContext,
} from "./yula-chart-utils";
import {
  YulaPieChartView,
  YulaAreaChartView,
  YulaBarChartView,
} from "./yula-chart-views";

export interface YulaChartCardProps {
  output: unknown;
  className?: string;
  pinEnabled?: boolean;
  compact?: boolean;
  showGridAction?: boolean;
  borderless?: boolean;
}

export function YulaChartCard({
  output,
  className,
  pinEnabled = true,
  compact = false,
  showGridAction = true,
  borderless = false,
}: YulaChartCardProps) {
  const t = useTranslations("ChartCard");
  const parsed = React.useMemo(() => parseChartOutput(output), [output]);
  const uid = React.useId().replace(/:/g, "");
  const pathname = usePathname() ?? "/";
  const screen = useYulaGridStore((s) => s.screen);
  const spec = useYulaGridStore((s) => s.spec);
  const { isPinned, togglePin } = usePinnedCharts();

  const sourceCtx = React.useMemo(() => {
    const search =
      typeof window !== "undefined" ? window.location.search : "";
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

  const chartConfig = React.useMemo<ChartConfig>(() => {
    if (!parsed) return {};
    const config: ChartConfig = {};
    if (parsed.chartType === "pie") {
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
              title={pinned ? t("unpin_from_home") : t("pin_to_home")}
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
        <YulaPieChartView
          rows={rows}
          dimensionY={dimensionY}
          chartConfig={chartConfig}
          chartHeight={chartHeight}
          isSideLegendPie={true}
          compact={compact}
          borderless={borderless}
        />
      ) : (
        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full px-2 pt-2 pb-1"
          style={{ height: chartHeight }}
        >
          {chartType === "pie" ? (
            <YulaPieChartView
              rows={rows}
              dimensionY={dimensionY}
              chartConfig={chartConfig}
              chartHeight={chartHeight}
              isSideLegendPie={false}
              compact={compact}
              borderless={borderless}
            />
          ) : chartType === "line" ? (
            <YulaAreaChartView
              rows={rows}
              dimensionY={dimensionY}
              uid={uid}
              multiSeries={multiSeries}
              tooltipContent={tooltipContent}
            />
          ) : (
            <YulaBarChartView
              barRows={barRows}
              rows={rows}
              dimensionY={dimensionY}
              multiSeries={multiSeries}
              tooltipContent={tooltipContent}
            />
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
