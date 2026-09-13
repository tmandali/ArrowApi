import * as React from "react";
import type { CriteriaFilterRow } from "../../types";

/** Match Stock Balance / Analytics spreadsheet chrome. */
export const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70";

export const cellClass =
  "overflow-hidden p-0 align-middle border-r border-b border-border/60 last:border-r-0";
export const headClass =
  "h-7 overflow-hidden px-2 py-0 align-middle border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-none text-muted-foreground bg-muted/40";
export const rowIndexClass =
  "bg-muted/40 text-[11px] tabular-nums text-muted-foreground";

export const NO_COL_WIDTH = 32;
export const ACTIONS_COL_WIDTH = 32;
/**
 * Layout breakpoints (viewport):
 * - phone  (< 40rem): Name+Value stacked
 * - otherwise: Name | Value (Description stays off)
 */
export const PHONE_VIEWPORT_MAX_REM = 40;
export const DEFAULT_COL_WIDTHS = { name: 180, value: 260 } as const;
export const MIN_COL_WIDTHS = { name: 112, value: 128 } as const;

export type ResizableColKey = keyof typeof DEFAULT_COL_WIDTHS;
export type ColWidths = { name: number; value: number };
/** phone → stacked; otherwise → columns (description off) */
export type CriteriaGridLayout = "stacked" | "columns" | "columns-with-description";

export function rootFontSizePx(): number {
  return (
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
    16
  );
}

export function viewportPx(rem: number): number {
  return rem * rootFontSizePx();
}

export function isPhoneViewport(): boolean {
  return window.matchMedia(`(max-width: ${viewportPx(PHONE_VIEWPORT_MAX_REM)}px)`)
    .matches;
}

export function resolveGridLayout(
  _tableWidth: number,
  _colWidths: ColWidths,
  _previous: CriteriaGridLayout
): CriteriaGridLayout {
  if (isPhoneViewport()) return "stacked";
  // Description column stays off — Name | Value only.
  return "columns";
}

export const EDGE_COLS_TOTAL = NO_COL_WIDTH + ACTIONS_COL_WIDTH;

/** Space available for Name + Value (No / Actions are fixed). */
export function availableNameValueWidth(tableWidth: number): number {
  return Math.max(
    MIN_COL_WIDTHS.name + MIN_COL_WIDTHS.value,
    tableWidth - EDGE_COLS_TOTAL
  );
}

/**
 * Keep Name + Value exactly filling the flexible area so edge columns
 * never absorb leftover width. Prefer the requested Name width.
 */
export function clampColWidths(widths: ColWidths, tableWidth: number): ColWidths {
  if (tableWidth <= 0) return widths;
  const available = availableNameValueWidth(tableWidth);
  const name = Math.min(
    Math.max(MIN_COL_WIDTHS.name, widths.name),
    available - MIN_COL_WIDTHS.value
  );
  return { name, value: available - name };
}

export function widthsForLayout(
  layout: CriteriaGridLayout,
  tableWidth: number,
  previous: ColWidths
): ColWidths {
  if (layout === "stacked" || tableWidth <= 0) return previous;
  return clampColWidths(previous, tableWidth);
}

/** No / Actions — never share leftover width with resizable columns. */
export const fixedEdgeColStyle = (width: number): React.CSSProperties => ({
  width,
  minWidth: width,
  maxWidth: width,
  boxSizing: "border-box",
});

export const edgeCellClass = "box-border w-8 min-w-8 max-w-8";

export const nameColStyle = (width: number): React.CSSProperties => ({
  width,
  minWidth: width,
  maxWidth: width,
  boxSizing: "border-box",
});

/** Value takes whatever remains after fixed edges + Name. */
export const valueColStyle = (
  nameWidth: number,
  edgeTotal: number = EDGE_COLS_TOTAL
): React.CSSProperties => ({
  width: `calc(100% - ${edgeTotal + nameWidth}px)`,
  boxSizing: "border-box",
});

export const EDITABLE_COL_COUNT = 2;

export const emptyRow = (): CriteriaFilterRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  selected: false,
  name: "",
  value: "",
});

export function isBlankCriteriaRow(row: CriteriaFilterRow): boolean {
  return !row.name.trim() && !String(row.value ?? "").trim();
}
