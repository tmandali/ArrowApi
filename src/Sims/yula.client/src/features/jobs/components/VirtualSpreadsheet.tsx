"use client";

/**
 * Backward compatibility re-export proxy.
 * VirtualSpreadsheet is now maintained at `@/components/virtual-spreadsheet`.
 */
export type {
  SpreadsheetColumn,
  VirtualSpreadsheetProps,
  ColumnSortConfigs,
} from "@/components/virtual-spreadsheet";

export { VirtualSpreadsheet } from "@/components/virtual-spreadsheet";
