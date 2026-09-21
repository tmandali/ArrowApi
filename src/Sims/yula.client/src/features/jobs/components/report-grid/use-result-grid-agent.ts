"use client";

import { z } from "zod";
import { useAgentComponent } from "@my-agent/react";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import {
  GRID_RUN_SQL_CONTRACT,
  GRID_QUERY_CONTRACT,
  GRID_FILTER_CONTRACT,
  GRID_APPLY_FILTERS_CONTRACT,
  GRID_SORT_CONTRACT,
  GRID_COLUMNS_CONTRACT,
  GRID_PIN_CONTRACT,
  GRID_RESET_LAYOUT_CONTRACT,
  GRID_EXPORT_CONTRACT,
  GRID_PROFILE_CONTRACT,
  GRID_ANALYZE_CONTRACT,
  GRID_VISUALIZE_CONTRACT,
} from "@/lib/client-tools/result-grid-contracts";

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
      RUN_SQL: GRID_RUN_SQL_CONTRACT,
      QUERY: GRID_QUERY_CONTRACT,
      FILTER: GRID_FILTER_CONTRACT,
      APPLY_FILTERS: GRID_APPLY_FILTERS_CONTRACT,
      SORT: GRID_SORT_CONTRACT,
      COLUMNS: GRID_COLUMNS_CONTRACT,
      PIN: GRID_PIN_CONTRACT,
      RESET_LAYOUT: GRID_RESET_LAYOUT_CONTRACT,
      EXPORT: GRID_EXPORT_CONTRACT,
      PROFILE: GRID_PROFILE_CONTRACT,
      ANALYZE: GRID_ANALYZE_CONTRACT,
      VISUALIZE: GRID_VISUALIZE_CONTRACT,
    },
    onAction: async (action, payload) => {
      return executeDispatchComponentAction({ component_id: "result_grid:active", action, payload });
    },
  });
}
