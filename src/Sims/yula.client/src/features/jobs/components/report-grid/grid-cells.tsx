"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatGridCellValue } from "@/utils/format-cell";
import { cn } from "@/utils/cn";
import {
  cellInputClass,
  cellClass,
  evaluateColorRules,
  type SpreadsheetColumn,
  type ConditionalColorRule,
} from "@/components/virtual-spreadsheet";
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
  columnRules?: Record<string, ConditionalColorRule[]>;
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
          // Köşeli kutu yok: hücrenin kendi alanını boyayan gradyan (td zeminine değil,
          // içerik div'ine arka plan olarak) — ek element, yuvarlak kutu veya inset yok.
          let cellBgImage: React.CSSProperties | undefined;
          if (spec?.kind === "bar" && Number.isFinite(numVal) && numVal !== 0) {
            const posScale = Math.max(spec.max, 0);
            const negScale = Math.max(-spec.min, 0);
            const pct = numVal >= 0
              ? posScale > 0 ? (numVal / posScale) * 100 : 0
              : negScale > 0 ? (-numVal / negScale) * 100 : 0;
            if (pct > 0) {
              const x = Math.min(pct, 100);
              cellBgImage = numVal >= 0
                ? {
                    backgroundImage:
                      `linear-gradient(to right, color-mix(in srgb, var(--color-primary, hsl(224 70% 50%)) 14%, transparent) ${x}%, transparent ${x}%)`,
                  }
                : {
                    backgroundImage:
                      `linear-gradient(to left, color-mix(in srgb, #ef4444 14%, transparent) ${x}%, transparent ${x}%)`,
                  };
            }
          }

          // Düşük kardinalite değerleri: pill/çip yerine DEĞER BAŞINA YAZI RENGİ
          // (altın açı hue haritası; light/dark uyumu globals.css'teki .vsp-chip-text'ten).
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
                  className="vsp-chip-text relative truncate"
                  style={{ ["--vsp-hue" as string]: hue }}
                >
                  {formattedVal}
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
                style={cellBgImage}
                title={rawVal != null ? String(rawVal) : undefined}
              >
                {content}
              </div>
            </td>
          );
        })}
      </tr>
    );
  };
}
