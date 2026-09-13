"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatGridCellValue } from "@/utils/format-cell";
import { cn } from "@/utils/cn";
import { cellInputClass, cellClass } from "../virtual-spreadsheet";
import type { SpreadsheetColumn } from "../virtual-spreadsheet";

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
}) {
  const { effectiveColumns, columnTypes, columnDuckTypes } = args;
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
                  "flex h-7 min-w-0 items-center px-2 tabular-nums text-foreground",
                  col.align === "right" && "justify-end"
                )}
                title={rawVal != null ? String(rawVal) : undefined}
              >
                <span className="truncate">{formattedVal}</span>
              </div>
            </td>
          );
        })}
      </tr>
    );
  };
}
