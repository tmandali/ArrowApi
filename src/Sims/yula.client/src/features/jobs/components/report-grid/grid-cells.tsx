"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatGridCellValue } from "@/utils/format-cell";
import { cn } from "@/utils/cn";
import { cellInputClass, cellClass } from "../virtual-spreadsheet";
import { evaluateColorRules } from "../virtual-spreadsheet/conditional-rules";
import type { SpreadsheetColumn } from "../virtual-spreadsheet";
import type { ColumnStyleSpec } from "./use-column-style-stats";

/** Arrow/DuckDB hücre değerlerini sayıya çevirir (valueOf tabanlı nesneler dahil). */
function toCellNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? NaN : Number(t);
  }
  if (v != null && typeof v === "object") {
    const fo = (v as { valueOf?: unknown }).valueOf;
    if (typeof fo === "function") return Number(fo.call(v));
  }
  return NaN;
}

/** Filtre hücresi render'ı (VirtualSpreadsheet renderFilterCell prop'u). */
export function createFilterCellRenderer(args: {
  t: (key: string) => string;
  filters: Record<string, string>;
  setFilter: (column: string, value: string) => void;
}) {
  const { t, filters, setFilter } = args;
  return (col: SpreadsheetColumn, index: number) => {
    const val = filters[col.name] ?? "";
    return (
      <div className="group relative flex w-full items-center">
        <Input
          className={cn(
            cellInputClass,
            "shadow-none",
            val && "pr-5",
            col.align === "right" && "text-right"
          )}
          placeholder={index === 0 ? t("filter_placeholder") : undefined}
          title={t("filter_input_title")}
          value={val}
          onChange={(event) => setFilter(col.name, event.target.value)}
        />
        {val ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setFilter(col.name, "");
            }}
            className="absolute right-1 hidden size-4 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground group-hover:flex group-focus-within:flex"
            title="Filtreyi temizle"
            aria-label="Filtreyi temizle"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
    );
  };
}

/** Satır render'ı (VirtualSpreadsheet renderRow prop'u). */
export function createRowRenderer(args: {
  effectiveColumns: SpreadsheetColumn[];
  columnTypes: Record<string, string>;
  columnDuckTypes: Record<string, string>;
  /** Airtable benzeri kolon görsel kuralları (bar / çip). Opsiyonel. */
  columnStyles?: Record<string, ColumnStyleSpec>;
  /** Eşik tabanlı koşullu renk kuralları (kolon adı → kurallar). Opsiyonel. */
  columnRules?: Record<string, import("../virtual-spreadsheet/conditional-rules").ConditionalColorRule[]>;
}) {
  const { effectiveColumns, columnTypes, columnDuckTypes, columnStyles, columnRules } = args;
  return (
    row: Record<string, unknown>,
    index: number,
    cols: readonly SpreadsheetColumn[] = effectiveColumns
  ) => {
    const values = (row.values ?? row) as Record<string, unknown>;

    return (
      <tr key={index} className="hover:bg-muted/30">
        {cols.map((col) => {
          const rawVal = values[col.name];
          const formattedVal = formatGridCellValue(
            rawVal,
            col.align,
            columnDuckTypes[col.name] ?? columnTypes[col.name]
          );
          const spec = columnStyles?.[col.name];
          const ruleHit = evaluateColorRules(columnRules?.[col.name], rawVal);
          const numVal = spec?.kind === "bar" ? toCellNumber(rawVal) : NaN;
          const isNegative =
            spec?.kind === "bar" && Number.isFinite(numVal) && numVal < 0;

          // Bar: pozitif sol→sağa, negatif sağ→sola büyür (Airtable "show as bar").
          let bar: React.ReactNode = null;
          if (spec?.kind === "bar" && Number.isFinite(numVal) && numVal !== 0) {
            const posScale = Math.max(spec.max, 0);
            const negScale = Math.max(-spec.min, 0);
            const pct = numVal >= 0
              ? posScale > 0 ? (numVal / posScale) * 100 : 0
              : negScale > 0 ? (-numVal / negScale) * 100 : 0;
            if (pct > 0) {
              bar = (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 bottom-0 rounded-sm",
                    numVal >= 0 ? "left-0 bg-primary/10" : "right-0 bg-red-500/10"
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              );
            }
          }

          // Çip: düşük kardinalite değerleri Airtable tag görünümleriyle.
          // Hücre arka planına eşik kuralı rengi de zemin olarak eklenir (çok hafif alfa).
          let content: React.ReactNode = (
            <span
              className={cn(
                "relative truncate",
                ruleHit?.text ?? (isNegative && "text-red-600 dark:text-red-400")
              )}
            >
              {formattedVal}
            </span>
          );
          if (spec?.kind === "chip" && rawVal != null && String(rawVal) !== "") {
            const hue = spec.domain.get(String(rawVal));
            if (hue != null) {
              content = (
                <span
                  className="relative inline-flex max-w-full items-center truncate rounded-full border px-1.5 py-px text-[11px] leading-4"
                  style={{
                    backgroundColor: `hsl(${hue} 70% 50% / 0.12)`,
                    borderColor: `hsl(${hue} 70% 50% / 0.35)`,
                  }}
                >
                  <span className={cn("truncate", ruleHit?.text)}>{formattedVal}</span>
                </span>
              );
            }
          }

          return (
            <td
              key={col.name}
              className={cn(
                cellClass,
                col.align === "left" ? "text-left" : "text-right"
              )}
            >
              <div
                className={cn(
                  "relative flex h-7 min-w-0 items-center px-2 tabular-nums text-zinc-900 dark:text-zinc-50",
                  col.align === "right" && "justify-end",
                  ruleHit?.bg
                )}
                title={rawVal != null ? String(rawVal) : undefined}
              >
                {bar}
                {content}
              </div>
            </td>
          );
        })}
      </tr>
    );
  };
}
