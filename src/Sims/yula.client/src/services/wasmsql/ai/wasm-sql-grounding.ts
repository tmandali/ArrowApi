/**
 * WasmSql Engine (In-Browser WebAssembly OLAP) AI Grounding & Constants.
 * Pure TypeScript (Server-safe, zero React/DOM imports) for Node.js API prompt generation.
 */

export const WASM_SQL_ACTIVE_VIEW_NAME = "active_view";

/**
 * WasmSql in-browser motoru için model kurallarını ve ReAct direktiflerini formatlar.
 */
export function formatWasmSqlEngineDirectives(): string {
  return [
    `WASM SQL ENGINE (In-Browser WebAssembly OLAP):`,
    `• Runtime: 100% In-Browser WebAssembly Sandbox (Zero network latency, instant local computation).`,
    `• Headless Querying: When you need raw data, calculations, or aggregations without modifying the on-screen table view, call 'wasm_sql_engine' with action='RUN_SQL'.`,
    `• Visual Transformation: When you want to modify, group, or transform what the user sees in the table grid, call 'result_grid:active' with action='RUN_SQL'.`,
    `• View "active_view": Represents currently visible, filtered, and aggregated rows rendered on the virtual grid.`,
    `• Permitted Read-Only Statements: SELECT, WITH, DESCRIBE, DESC, SHOW, SUMMARIZE.`,
  ].join("\n");
}
