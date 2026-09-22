import { findReport } from "@/features/reports/report-registry";
import { useYulaGridStore } from "@/lib/stores/grid";
import {
  extractJobIdFromHref,
  reportExecutionHref,
  reportExecutionPath,
  workspaceIdFromPath,
} from "@/lib/workspace-paths";

/** Yula paleti: marka turuncusu → primary → chart blues (tema token'ları) */
export const CHART_COLORS = [
  "var(--yula-accent)",
  "var(--primary)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
];

export const numberFmt = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});

/** Eksen için kompakt sayı: 24980000 → "25 Mn" */
export const compactFmt = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Uzun kategori etiketini üç nokta ile kısaltır; sondaki ayırt edici kısmı korur. */
export function truncateTick(value: unknown, max = 14): string {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 4)}…${s.slice(-3)}`;
}

export interface ParsedChart {
  chartType: "bar" | "line" | "pie";
  title: string;
  description?: string;
  takeaway?: string;
  dimensionX: string;
  dimensionY: string[];
  rows: Array<Record<string, unknown>>;
  sql?: string;
}

export function parseChartOutput(output: unknown): ParsedChart | null {
  if (!output || typeof output !== "object") return null;
  const outObj = output as Record<string, unknown>;
  const o = (
    outObj.details && typeof outObj.details === "object"
      ? outObj.details
      : outObj
  ) as Record<string, unknown>;

  if (o.status !== "ok" && o.success !== true) return null;
  const chart =
    typeof o.chart === "object" && o.chart !== null
      ? (o.chart as Record<string, unknown>)
      : null;
  if (!chart || !Array.isArray(o.rows) || o.rows.length === 0) return null;
  let chartType = chart.chartType;
  if (chartType === "area") chartType = "line";
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

export function resolveChartSourceContext(pathname: string, search: string) {
  const screen = useYulaGridStore.getState().screen;
  const spec = useYulaGridStore.getState().spec;
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

  // Ekran workspace'si ekran kaydından; kayıtsa yolun workspace'iden
  // çözülür (canonik resolver: `getWorkspaceForPath` — unknown "system").
  const workspace =
    screen?.workspaceId?.trim() ||
    workspaceIdFromPath(pagePath || pathname || "/");

  const sourceHref =
    jobId && pagePath
      ? reportExecutionHref(pagePath, jobId)
      : pagePath || pathname || "/";

  return { workspace, reportScope, jobId, sourceHref };
}

export function computeTone(originalIndex: number, totalRows: number): number {
  const toneStep = 0.6 / Math.max(1, totalRows - 1);
  return Math.max(0.35, 1 - originalIndex * toneStep);
}
