"use client";

import * as React from "react";

export type PinnedChartType = "bar" | "line" | "pie";

/** Workspace ana sayfasına sabitlenen Yula grafik anlık görüntüsü. */
export interface PinnedChart {
  id: string;
  workspace: string;
  title: string;
  chartType: PinnedChartType;
  description?: string;
  takeaway?: string;
  dimensionX: string;
  dimensionY: string[];
  rows: Array<Record<string, unknown>>;
  sql?: string;
  /** Tıklanınca açılacak rapor kaynağı (`/stock/...?jobId=`). */
  sourceHref: string;
  reportScope?: string;
  jobId?: string;
  pinnedAt: number;
}

export const PINNED_CHART_VIEW_PARAM = "aiView";

export function getPinnedChartViewId(chart: Pick<PinnedChart, "id">) {
  return `pinned_chart_${chart.id}`;
}

export function savePinnedChartAsAiView(chart: PinnedChart) {
  if (typeof window === "undefined" || !chart.reportScope || !chart.sql) {
    return null;
  }

  const storageKey = `arrow_grid_${chart.reportScope}_ai_views`;
  const viewId = getPinnedChartViewId(chart);
  const view = {
    id: viewId,
    title: chart.title,
    sql: chart.sql,
    createdAt: chart.pinnedAt,
  };

  try {
    const raw = localStorage.getItem(storageKey);
    const existing = raw ? JSON.parse(raw) : [];
    const views = Array.isArray(existing) ? existing : [];
    const next = [...views.filter((item) => item?.id !== viewId), view];
    localStorage.setItem(storageKey, JSON.stringify(next));
    return viewId;
  } catch (error) {
    console.warn("[usePinnedCharts] Error saving chart view:", error);
    return null;
  }
}

const STORAGE_KEY = "yula_pinned_charts";
const CHANGE_EVENT = "yula-pinned-charts-change";

const EMPTY_PINNED_CHARTS: PinnedChart[] = [];

/** Aynı grafik yeniden pinlenince toggle için kararlı kimlik (href hariç). */
export function buildPinnedChartId(input: {
  workspace: string;
  title: string;
  chartType: string;
  dimensionX: string;
  dimensionY: string[];
  reportScope?: string;
}): string {
  return [
    input.workspace,
    input.reportScope ?? "",
    input.title.trim(),
    input.chartType,
    input.dimensionX,
    input.dimensionY.join(","),
  ].join("::");
}

function getStoredPinnedCharts(): PinnedChart[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PinnedChart[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("[usePinnedCharts] Error reading localStorage:", e);
    return [];
  }
}

let storedCache: { raw: string | null; items: PinnedChart[] } | null = null;

function subscribePinnedCharts(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getStoredPinnedChartsSnapshot(): PinnedChart[] {
  const raw =
    typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  if (storedCache && storedCache.raw === raw) return storedCache.items;
  let items = EMPTY_PINNED_CHARTS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PinnedChart[];
      items = Array.isArray(parsed) ? parsed : EMPTY_PINNED_CHARTS;
    } catch (e) {
      console.warn("[usePinnedCharts] Error reading localStorage:", e);
    }
  }
  storedCache = { raw, items };
  return items;
}

function saveStoredPinnedCharts(items: PinnedChart[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    storedCache = { raw: JSON.stringify(items), items };
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: items }));
  } catch (e) {
    console.warn("[usePinnedCharts] Error saving localStorage:", e);
  }
}

/** PinnedChart → YulaChartCard `output` sözleşmesi. */
export function pinnedChartToOutput(chart: PinnedChart): Record<string, unknown> {
  return {
    status: "ok",
    sql: chart.sql,
    chart: {
      chartType: chart.chartType,
      title: chart.title,
      description: chart.description,
      takeaway: chart.takeaway,
      dimensionX: chart.dimensionX,
      dimensionY: chart.dimensionY,
    },
    rows: chart.rows,
    rowCount: chart.rows.length,
  };
}

export function usePinnedCharts(workspace?: string) {
  const allPinnedCharts = React.useSyncExternalStore(
    subscribePinnedCharts,
    getStoredPinnedChartsSnapshot,
    () => EMPTY_PINNED_CHARTS,
  );

  const pinnedCharts = React.useMemo(() => {
    if (!workspace || workspace === "all" || workspace === "system") {
      return allPinnedCharts;
    }
    return allPinnedCharts.filter((item) => {
      if (item.workspace === workspace) return true;
      if (workspace === "selling" && item.workspace === "subcontracting") return true;
      if (workspace === "subcontracting" && item.workspace === "selling") return true;
      if (workspace === "financial-reports" && item.workspace === "accounting") return true;
      return false;
    });
  }, [allPinnedCharts, workspace]);

  const isPinned = React.useCallback(
    (id: string) => allPinnedCharts.some((item) => item.id === id),
    [allPinnedCharts],
  );

  const pinChart = React.useCallback((item: PinnedChart) => {
    const current = getStoredPinnedCharts();
    if (!current.some((i) => i.id === item.id)) {
      saveStoredPinnedCharts([...current, item]);
    }
  }, []);

  const unpinChart = React.useCallback((id: string) => {
    const current = getStoredPinnedCharts();
    saveStoredPinnedCharts(current.filter((i) => i.id !== id));
  }, []);

  const togglePin = React.useCallback((item: PinnedChart) => {
    const current = getStoredPinnedCharts();
    const exists = current.some((i) => i.id === item.id);
    if (exists) {
      saveStoredPinnedCharts(current.filter((i) => i.id !== item.id));
    } else {
      saveStoredPinnedCharts([...current, item]);
    }
  }, []);

  return {
    pinnedCharts,
    allPinnedCharts,
    isPinned,
    pinChart,
    unpinChart,
    togglePin,
  };
}
