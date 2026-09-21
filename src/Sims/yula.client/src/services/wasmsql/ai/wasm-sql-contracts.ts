import { z } from "zod";
import type { ActionContract } from "@my-agent/core";

export const WASM_SQL_COMPONENT_ID = "wasm_sql_engine" as const;
export type WasmSqlComponentId = typeof WASM_SQL_COMPONENT_ID;

/**
 * Action Contract for `wasm_sql_engine.actions.RUN_SQL`.
 * Executes an in-browser read-only WebAssembly SQL query with zero network latency.
 */
export const WASM_SQL_RUN_CONTRACT = {
  description:
    "Executes a read-only SQL query on the in-browser WebAssembly SQL engine (zero network roundtrip). Query tables or 'active_view'.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Read-only SQL query (SELECT, WITH, DESCRIBE, SHOW, SUMMARIZE)"),
    limit: z.number().int().positive().max(1000).optional().default(100).describe("Maximum rows to return in result"),
  }),
  outputSchema: z.object({
    query: z.string(),
    rowCount: z.number(),
    durationMs: z.number(),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.unknown())),
    truncated: z.boolean(),
  }),
  whenToCall:
    "When you need direct headless SQL computation, fast ad-hoc queries, or aggregations without affecting the visual table grid.",
  whenNotToCall:
    "When the user wants to visually filter, sort, or modify the on-screen table grid (use result_grid actions instead).",
} satisfies ActionContract;

/**
 * Action Contract for `wasm_sql_engine.actions.DESCRIBE_TABLE`.
 * Discovers column names and data types of an in-memory table or view.
 */
export const WASM_SQL_DESCRIBE_CONTRACT = {
  description: "Discovers schema and columns of a WebAssembly table or view.",
  inputSchema: z.object({
    tableOrView: z
      .string()
      .optional()
      .default("active_view")
      .describe("Name of the table or view to inspect (defaults to 'active_view')"),
  }),
  outputSchema: z.object({
    tableOrView: z.string(),
    columns: z.array(
      z.object({
        column_name: z.string(),
        column_type: z.string(),
        null: z.string().optional(),
      })
    ),
  }),
  whenToCall:
    "When you need to inspect column names, types, and schema of a WebAssembly table or view before querying.",
  whenNotToCall:
    "When column names are already known from the active grid context.",
} satisfies ActionContract;

/**
 * Action Contract for `wasm_sql_engine.actions.LIST_TABLES`.
 * Lists all active tables and views registered in the in-browser WebAssembly catalog.
 */
export const WASM_SQL_LIST_TABLES_CONTRACT = {
  description: "Lists active tables and analytical views loaded in browser WebAssembly memory.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    tables: z.array(z.string()),
  }),
  whenToCall:
    "When you need to discover which tables and views are currently loaded in in-browser WebAssembly memory.",
  whenNotToCall:
    "When the target table or view is already known.",
} satisfies ActionContract;

export type WasmSqlRunInput = z.infer<typeof WASM_SQL_RUN_CONTRACT.inputSchema>;
export type WasmSqlRunOutput = z.infer<typeof WASM_SQL_RUN_CONTRACT.outputSchema>;
export type WasmSqlDescribeInput = z.infer<typeof WASM_SQL_DESCRIBE_CONTRACT.inputSchema>;
export type WasmSqlDescribeOutput = z.infer<typeof WASM_SQL_DESCRIBE_CONTRACT.outputSchema>;
export type WasmSqlListTablesOutput = z.infer<typeof WASM_SQL_LIST_TABLES_CONTRACT.outputSchema>;
