"use client";

import { z } from "zod";
import { useAgentComponent } from "@my-agent/react";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";

export interface UseResultGridAgentOptions {
  duckTableName: string;
  totalFiltered?: number;
  columns: string[];
  filters: unknown;
  customQuerySql?: string | null;
  isTableReady: boolean;
}

/**
 * Headless React UI-Agent (@my-agent/react) bağdaştırıcısı.
 * Grid mount edildiğinde kendini canlı React state'i, olay şemaları
 * ve eylem çıktı sözleşmeleriyle 'result_grid:active' olarak kaydeder.
 */
export function useResultGridAgent({
  duckTableName,
  totalFiltered,
  columns,
  filters,
  customQuerySql,
  isTableReady,
}: UseResultGridAgentOptions) {
  useAgentComponent({
    id: "result_grid:active",
    meta: {
      description: `Active Result Grid (${duckTableName}) - ${totalFiltered ?? "?"} rows`,
      tableName: duckTableName,
      columns,
      rowCount: totalFiltered,
      filters,
      customQuerySql,
      isTableReady,
    },
    events: {
      filter_change: {
        description: "Triggered when user or agent filters the grid columns",
        schema: z.object({ filters: z.record(z.string(), z.any()) }),
      },
      view_transformed: {
        description: "Triggered when SQL, sorting, or projection transforms active view",
        schema: z.object({ query: z.string().optional(), rowCount: z.number().optional() }),
      },
    },
    actions: {
      RUN_SQL: {
        description: "Executes a read-only DuckDB SQL query against 'active_view' ({ query }).",
        outputSchema: z.object({ success: z.boolean(), rowCount: z.number().optional() }),
        whenToCall: "When custom SQL queries, aggregations, or calculations are requested.",
        whenNotToCall: "When simple column filtering or sorting is sufficient.",
        when: { phase: "results" },
      },
      FILTER: {
        description: "Filters the grid by a column value ({ field, value, op }).",
        outputSchema: z.object({ success: z.boolean(), rowCount: z.number().optional() }),
        whenToCall: "To filter table data by a column value.",
        whenNotToCall: "When filtering is not requested.",
        when: { phase: "results" },
      },
      APPLY_FILTERS: {
        description: "Applies multiple column filters simultaneously ({ filters, clearOthers }).",
        outputSchema: z.object({ success: z.boolean(), rowCount: z.number().optional() }),
        whenToCall: "When multiple columns need to be filtered concurrently.",
        whenNotToCall: "When filtering only a single column.",
        when: { phase: "results" },
      },
      SORT: {
        description: "Sorts the grid by column ({ column, direction }).",
        outputSchema: z.object({ success: z.boolean(), column: z.string().optional() }),
        whenToCall: "When sorting is requested.",
        whenNotToCall: "When sorting is not requested.",
        when: { phase: "results" },
      },
      COLUMNS: {
        description: "Shows, hides, or reorders columns ({ visibleColumns, hiddenColumns }).",
        outputSchema: z.object({ success: z.boolean(), visibleCount: z.number().optional() }),
        whenToCall: "To adjust column visibility or layout.",
        whenNotToCall: "When column layout should remain untouched.",
        when: { phase: "results" },
      },
      PIN: {
        description: "Pins columns to the left or right ({ columns }).",
        outputSchema: z.object({ success: z.boolean(), pinnedColumns: z.array(z.string()).optional() }),
        whenToCall: "When column freezing or pinning is requested.",
        whenNotToCall: "When pinning is not requested.",
        when: { phase: "results" },
      },
      RESET_LAYOUT: {
        description: "Resets the grid to default layout and visibility.",
        outputSchema: z.object({ success: z.boolean() }),
        whenToCall: "When the user wants to reset custom column arrangements.",
        whenNotToCall: "When keeping the current layout.",
        when: { phase: "results" },
      },
      EXPORT: {
        description: "Exports data to Excel, CSV, or Parquet ({ format }).",
        outputSchema: z.object({ success: z.boolean(), format: z.string().optional() }),
        whenToCall: "When downloading or exporting grid data is requested.",
        whenNotToCall: "When export is not requested.",
        when: { phase: "results" },
      },
      VISUALIZE: {
        description: "Generates a chart or visual plot ({ type, dimension, metric }).",
        outputSchema: z.object({ success: z.boolean(), chartType: z.string().optional() }),
        whenToCall: "When a chart or graph visualization is requested.",
        whenNotToCall: "When no visual chart is requested.",
        when: { phase: "results" },
      },
      ANALYZE: {
        description: "Generates a statistical summary of the active data.",
        outputSchema: z.object({ success: z.boolean(), summary: z.any().optional() }),
        whenToCall: "When statistical summary or data distribution is requested.",
        whenNotToCall: "When summary analysis is not requested.",
        when: { phase: "results" },
      },
      PROFILE: {
        description: "Profiles column data quality, null counts, and distinct values.",
        outputSchema: z.object({ success: z.boolean(), profile: z.any().optional() }),
        whenToCall: "When inspecting data quality or anomalies.",
        whenNotToCall: "When profiling is not requested.",
        when: { phase: "results" },
      },
    },
    onAction: async (action, payload) => {
      return executeDispatchComponentAction({ component_id: "result_grid:active", action, payload });
    },
  });
}
