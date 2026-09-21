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
import {
  CHART_COLORS,
  compactFmt,
  computeTone,
  numberFmt,
  truncateTick,
} from "./yula-chart-utils";

export interface YulaPieChartViewProps {
  rows: Array<Record<string, unknown>>;
  dimensionY: string[];
  chartConfig: ChartConfig;
  chartHeight: number;
  isSideLegendPie: boolean;
  compact: boolean;
  borderless: boolean;
}

export function YulaPieChartView({
  rows,
  dimensionY,
  chartConfig,
  chartHeight,
  isSideLegendPie,
  compact,
  borderless,
}: YulaPieChartViewProps) {
  if (isSideLegendPie) {
    return (
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
                  fillOpacity={computeTone(i, rows.length)}
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
                  opacity: computeTone(i, rows.length),
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
    );
  }

  return (
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
            fillOpacity={computeTone(i, rows.length)}
            stroke={borderless ? "var(--background)" : "var(--card)"}
          />
        ))}
      </Pie>
    </PieChart>
  );
}

export interface YulaAreaChartViewProps {
  rows: Array<Record<string, unknown>>;
  dimensionY: string[];
  uid: string;
  multiSeries: boolean;
  tooltipContent: React.ReactElement;
}

export function YulaAreaChartView({
  rows,
  dimensionY,
  uid,
  multiSeries,
  tooltipContent,
}: YulaAreaChartViewProps) {
  return (
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
  );
}

export interface YulaBarChartViewProps {
  barRows: Array<Record<string, unknown>>;
  rows: Array<Record<string, unknown>>;
  dimensionY: string[];
  multiSeries: boolean;
  tooltipContent: React.ReactElement;
}

export function YulaBarChartView({
  barRows,
  rows,
  dimensionY,
  multiSeries,
  tooltipContent,
}: YulaBarChartViewProps) {
  return (
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
          {!multiSeries
            ? barRows.map((_, d) => (
                <Cell
                  key={d}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={computeTone(rows.length - 1 - d, rows.length)}
                />
              ))
            : null}
        </Bar>
      ))}
    </BarChart>
  );
}
