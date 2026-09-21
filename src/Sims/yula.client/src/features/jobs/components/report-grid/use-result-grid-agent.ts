"use client";

import * as React from "react";
import { z } from "zod";
import { useAgentComponent } from "@my-agent/react";
import { uiEventBus } from "@my-agent/core";
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
  jobId?: string;
  tableName?: string;
  duckTableName?: string;
  totalFiltered?: number;
  columns: string[];
  filters: unknown;
  customQuerySql?: string | null;
  customQueryTitle?: string | null;
  activeAiViewId?: string | null;
  savedViews?: Array<{ id?: string; name?: string; title: string; sql: string }>;
  isTableReady: boolean;
}

/**
 * Headless React UI-Agent (@my-agent/react) bağdaştırıcısı.
 * Grid mount edildiğinde kendini canlı React state'i, olay şemaları
 * ve eylem çıktı sözleşmeleriyle 'result_grid:active' olarak kaydeder.
 */
export function useResultGridAgent(options: UseResultGridAgentOptions) {
  const {
    jobId,
    totalFiltered,
    columns,
    filters,
    customQuerySql,
    customQueryTitle,
    activeAiViewId,
    savedViews,
    isTableReady,
  } = options;
  const tableName = options.tableName ?? options.duckTableName ?? "";
  const [selectedRow, setSelectedRow] = React.useState<Record<string, unknown> | null>(null);

  const isBaseTable = !customQuerySql && !activeAiViewId;
  const activeView = customQuerySql ? "active_view" : tableName;

  const { emit } = useAgentComponent({
    id: "result_grid:active",
    meta: {
      description: `Active Result Grid (${tableName}) - ${totalFiltered ?? "?"} rows`,
      tableName,
      baseTable: tableName,
      isBaseTable,
      activeView,
      activeAiViewId: activeAiViewId ?? null,
      customQueryTitle: customQueryTitle ?? null,
      customQuerySql: customQuerySql ?? null,
      savedViews: savedViews ?? [],
      columns,
      rowCount: totalFiltered,
      selectedRow,
      filters,
      isTableReady,
    },
    events: {
      filter_change: {
        description: "Triggered when user or agent filters the grid columns",
        schema: z.object({ filters: z.record(z.string(), z.any()) }),
      },
      sort_changed: {
        description: "Triggered when user or agent sorts the grid columns",
        schema: z.object({
          column: z.string(),
          direction: z.enum(["asc", "desc"]).nullable().optional(),
          sortConfigs: z.record(z.string(), z.enum(["asc", "desc"])).optional(),
        }),
      },
      row_selected: {
        description: "Triggered when user selects a row in the result grid",
        schema: z.object({
          id: z.union([z.string(), z.number()]),
          rowData: z.record(z.string(), z.unknown()).optional(),
        }),
      },
      view_transformed: {
        description: "Triggered when SQL, saved query navigation, or projection transforms active view",
        schema: z.object({
          baseTable: z.string(),
          activeView: z.string(),
          isBaseTable: z.boolean(),
          viewId: z.string().nullable().optional(),
          title: z.string().nullable().optional(),
          query: z.string().nullable().optional(),
          rowCount: z.number().optional(),
        }),
      },
      table_loaded: {
        description: "Triggered when DuckDB report table is fully loaded and ready in the virtual grid",
        schema: z.object({
          tableName: z.string(),
          activeView: z.string(),
          columns: z.array(z.string()),
          rowCount: z.number().optional(),
        }),
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

  const tableLoadedKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (isTableReady && tableName && Array.isArray(columns) && columns.length > 0) {
      const key = `${tableName}:${columns.join(",")}:${totalFiltered ?? "?"}`;
      if (tableLoadedKeyRef.current !== key) {
        tableLoadedKeyRef.current = key;
        emit("table_loaded", {
          tableName,
          activeView: "active_view",
          columns,
          rowCount: totalFiltered,
        });
        try {
          uiEventBus.recordTelemetry(
            {
              topic: "data",
              source: "result_grid:active",
              type: "TABLE_LOADED",
              payload: {
                tableName,
                activeView: "active_view",
                rowCount: totalFiltered,
                columns,
              },
            },
            { coalesceKey: "result_grid:table_loaded", correlationId: jobId }
          );
        } catch {
          // Telemetry best-effort
        }
      }
    }
  }, [isTableReady, tableName, columns, totalFiltered, emit, jobId]);

  const prevFiltersRef = React.useRef(filters);
  React.useEffect(() => {
    if (filters && filters !== prevFiltersRef.current) {
      prevFiltersRef.current = filters;
      if (typeof filters === "object" && Object.keys(filters).length > 0) {
        emit("filter_change", { filters: filters as Record<string, any> });
        try {
          uiEventBus.recordTelemetry(
            {
              topic: "data",
              source: "result_grid:active",
              type: "FILTER_APPLIED",
              payload: { filters: filters as Record<string, unknown> },
            },
            { coalesceKey: "result_grid:filters", correlationId: jobId }
          );
        } catch {
          // Telemetry best-effort
        }
      }
    }
  }, [filters, emit, jobId]);

  const handleRowSelect = React.useCallback(
    (rowIndex: number, rowData: unknown) => {
      const raw = (rowData as any)?.values ?? rowData;
      if (raw && typeof raw === "object") {
        setSelectedRow(raw as Record<string, unknown>);
        try {
          uiEventBus.recordTelemetry(
            {
              topic: "data",
              source: "result_grid:active",
              type: "ROW_SELECTED",
              payload: { id: rowIndex, rowData: raw as Record<string, unknown> },
            },
            { coalesceKey: "result_grid:row_selected", correlationId: jobId }
          );
        } catch {
          // Telemetry best-effort
        }
      }
    },
    [jobId]
  );

  const handleSortChange = React.useCallback(
    (column: string, direction?: "asc" | "desc" | null, sortConfigs?: Record<string, "asc" | "desc">) => {
      try {
        uiEventBus.recordTelemetry(
          {
            topic: "data",
            source: "result_grid:active",
            type: "SORT_CHANGED",
            payload: { column, direction, sortConfigs },
          },
          { coalesceKey: "result_grid:sort", correlationId: jobId }
        );
      } catch {
        // Telemetry best-effort
      }
    },
    [jobId]
  );

  const handleViewTransformed = React.useCallback(
    (viewId?: string | null, title?: string | null, query?: string | null) => {
      const isBase = !viewId && !query;
      const payload = {
        baseTable: tableName,
        activeView: isBase ? tableName : "active_view",
        isBaseTable: isBase,
        viewId: viewId ?? null,
        title: title ?? (isBase ? "Base Table" : "Custom View"),
        query: query ?? null,
        rowCount: totalFiltered,
      };

      emit("view_transformed", payload);

      try {
        uiEventBus.recordTelemetry(
          {
            topic: "data",
            source: "result_grid:active",
            type: "VIEW_TRANSFORMED",
            payload,
          },
          { coalesceKey: "result_grid:view_transformed", correlationId: jobId }
        );
      } catch {
        // Telemetry best-effort
      }
    },
    [tableName, totalFiltered, emit, jobId]
  );

  const prevViewKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isTableReady) return;
    const currentKey = `${activeAiViewId ?? ""}:${customQuerySql ?? ""}:${customQueryTitle ?? ""}`;
    if (prevViewKeyRef.current === null) {
      prevViewKeyRef.current = currentKey;
      return;
    }
    if (prevViewKeyRef.current !== currentKey) {
      prevViewKeyRef.current = currentKey;
      handleViewTransformed(activeAiViewId, customQueryTitle, customQuerySql);
    }
  }, [isTableReady, activeAiViewId, customQuerySql, customQueryTitle, handleViewTransformed]);

  return {
    emit,
    selectedRow,
    handleRowSelect,
    handleSortChange,
    handleViewTransformed,
  };
}
