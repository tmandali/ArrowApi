"use client";

import * as React from "react";
import { z } from "zod";
import { useAgentComponent } from "@my-agent/react";
import { uiEventBus } from "@my-agent/core";
import { wasmSqlClient } from "../wasm-sql-client";
import { guardReadOnlySelect, resolveActiveViewReferences } from "@/lib/sql-guard";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import {
  WASM_SQL_COMPONENT_ID,
  WASM_SQL_RUN_CONTRACT,
  WASM_SQL_DESCRIBE_CONTRACT,
  WASM_SQL_LIST_TABLES_CONTRACT,
  type WasmSqlRunOutput,
  type WasmSqlDescribeOutput,
  type WasmSqlListTablesOutput,
} from "./wasm-sql-contracts";

export interface UseWasmSqlAgentOptions {
  baseTable?: string;
  isTableReady?: boolean;
}

export function useWasmSqlAgent(options: UseWasmSqlAgentOptions = {}) {
  const { baseTable, isTableReady = true } = options;

  const handleRunSql = React.useCallback(
    async (args: { query: string; limit?: number }): Promise<WasmSqlRunOutput> => {
      const startTime = performance.now();
      const guard = guardReadOnlySelect(args.query);
      if (!guard.ok) {
        throw new Error(guard.error);
      }
      const effectiveSql = baseTable
        ? resolveActiveViewReferences(guard.sql, baseTable)
        : guard.sql;

      const limit = args.limit ?? 100;
      const limitedSql = effectiveSql.toLowerCase().includes("limit")
        ? effectiveSql
        : `${effectiveSql} LIMIT ${limit + 1}`;

      const rawRows = await wasmSqlClient.executeCustomSql(limitedSql);
      const durationMs = Math.round(performance.now() - startTime);

      const truncated = rawRows.length > limit;
      const rows = truncated ? rawRows.slice(0, limit) : rawRows;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      const payload: WasmSqlRunOutput = {
        query: args.query,
        rowCount: rows.length,
        durationMs,
        columns,
        rows: rows as Array<Record<string, unknown>>,
        truncated,
      };

      try {
        uiEventBus.recordTelemetry({
          topic: "data",
          source: WASM_SQL_COMPONENT_ID,
          type: "QUERY_EXECUTED",
          payload: {
            query: args.query,
            durationMs,
            rowCount: rows.length,
          },
        });
      } catch {
        // Telemetry best-effort
      }

      return payload;
    },
    [baseTable]
  );

  const handleDescribe = React.useCallback(
    async (args: { tableOrView?: string }): Promise<WasmSqlDescribeOutput> => {
      const target = args.tableOrView || "active_view";
      const effectiveTarget =
        target === "active_view" && baseTable ? baseTable : target;
      const safeTarget = effectiveTarget.replace(/[^a-zA-Z0-9_]/g, "");

      const cols = await wasmSqlClient.describeTable(safeTarget);
      const columns = cols.map((c) => ({
        column_name: c.name,
        column_type: c.duckType ?? "VARCHAR",
      }));

      try {
        uiEventBus.recordTelemetry({
          topic: "data",
          source: WASM_SQL_COMPONENT_ID,
          type: "TABLE_DESCRIBED",
          payload: {
            target,
            columnCount: columns.length,
          },
        });
      } catch {
        // Telemetry best-effort
      }

      return {
        tableOrView: target,
        columns,
      };
    },
    [baseTable]
  );

  const handleListTables = React.useCallback(async (): Promise<WasmSqlListTablesOutput> => {
    const rows = await wasmSqlClient.executeCustomSql("SHOW TABLES;");
    const tables = rows.map((r: Record<string, unknown>) => String(Object.values(r)[0] ?? ""));

    try {
      uiEventBus.recordTelemetry({
        topic: "data",
        source: WASM_SQL_COMPONENT_ID,
        type: "TABLES_LISTED",
        payload: {
          count: tables.length,
        },
      });
    } catch {
      // Telemetry best-effort
    }

    return { tables };
  }, []);

  const meta = React.useMemo(
    () => ({
      description:
        "Client-side in-browser WebAssembly SQL engine. Performs zero-network analytical queries, schema inspection, and aggregations on loaded tables.",
      engine: "WebAssembly SQL Engine (DuckDB WASM)",
      runtime: "In-Browser WebAssembly Sandbox (Zero Network Latency)",
      baseTable: baseTable ?? null,
      activeView: "active_view",
      isReady: isTableReady,
    }),
    [baseTable, isTableReady]
  );

  const { emit } = useAgentComponent({
    id: WASM_SQL_COMPONENT_ID,
    meta,
    actions: {
      RUN_SQL: WASM_SQL_RUN_CONTRACT,
      DESCRIBE_TABLE: WASM_SQL_DESCRIBE_CONTRACT,
      LIST_TABLES: WASM_SQL_LIST_TABLES_CONTRACT,
    },
    events: {
      query_executed: {
        description: "Triggered when a read-only WebAssembly query finishes execution",
        schema: z.object({
          query: z.string(),
          rowCount: z.number(),
          durationMs: z.number(),
        }),
      },
      table_described: {
        description: "Triggered when table or view schema is inspected",
        schema: z.object({
          target: z.string(),
          columnCount: z.number(),
        }),
      },
    },
    onAction: async (action, payload) => {
      const res = await executeDispatchComponentAction({
        component_id: WASM_SQL_COMPONENT_ID,
        action,
        payload: payload as Record<string, unknown>,
      });
      if (action === "RUN_SQL") {
        const r = res as Partial<WasmSqlRunOutput>;
        if (r.query && typeof r.rowCount === "number") {
          emit("query_executed", {
            query: r.query,
            rowCount: r.rowCount,
            durationMs: r.durationMs ?? 0,
          });
        }
      }
      return res;
    },
  });

  return {
    runSql: handleRunSql,
    describeTable: handleDescribe,
    listTables: handleListTables,
  };
}
