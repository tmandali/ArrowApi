import { z } from "zod";
import type { ActionContract } from "@my-agent/core";

/**
 * Action Contract for `result_grid:active.actions.RUN_SQL`.
 */
export const GRID_RUN_SQL_CONTRACT = {
  description:
    "Executes a read-only DuckDB SQL query against 'active_view' ({ query }).",
  inputSchema: z.object({
    query: z
      .string()
      .describe("DuckDB SQL query string against 'active_view' (e.g. 'SELECT Depo, SUM(Tutar) FROM active_view GROUP BY 1')"),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    rows: z.array(z.any()).optional().describe("Query result rows"),
    rowCount: z.number().optional().describe("Number of rows returned"),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall:
    "When the user requests calculations, top N, aggregations, or custom SQL analysis on active table data.",
  whenNotToCall:
    "For simple column filtering or sorting (use FILTER or SORT instead).",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.QUERY`.
 */
export const GRID_QUERY_CONTRACT = {
  description:
    "Updates the grid view via SQL or opens a derived view ({ query }).",
  inputSchema: z.object({
    query: z
      .string()
      .describe("SQL query to project or transform active view"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rowCount: z.number().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall:
    "When the user wants derived columns or grouped table views.",
  whenNotToCall:
    "When only changing simple filters or sorting.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.FILTER`.
 */
export const GRID_FILTER_CONTRACT = {
  description:
    "Applies a filter to a single column ({ field, value, op }).",
  inputSchema: z.object({
    field: z.string().describe("Column field name to filter"),
    value: z.any().describe("Value to match or compare against"),
    op: z
      .string()
      .optional()
      .default("eq")
      .describe("Filter operator: 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rowCount: z.number().optional(),
    totalFiltered: z.number().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall:
    "When the user wants to filter records by a single column value.",
  whenNotToCall:
    "When applying multiple filters simultaneously (use APPLY_FILTERS instead).",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.APPLY_FILTERS`.
 */
export const GRID_APPLY_FILTERS_CONTRACT = {
  description:
    "Applies multiple filters to the table simultaneously ({ filters, clearOthers }).",
  inputSchema: z.object({
    filters: z
      .record(z.string(), z.any())
      .describe("Map of column field names to filter values"),
    clearOthers: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to reset non-matching existing filters"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rowCount: z.number().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall:
    "When multiple columns need to be filtered concurrently.",
  whenNotToCall:
    "When filtering only a single column.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.SORT`.
 */
export const GRID_SORT_CONTRACT = {
  description:
    "Sorts the column in ascending or descending order ({ column, direction }).",
  inputSchema: z.object({
    column: z.string().describe("Column name to sort by"),
    direction: z.enum(["asc", "desc"]).describe("Sort direction ('asc' or 'desc')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    column: z.string().optional(),
    sortedColumn: z.string().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall: "When sorting is requested.",
  whenNotToCall: "When sorting is not requested.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.COLUMNS`.
 */
export const GRID_COLUMNS_CONTRACT = {
  description:
    "Shows, hides, or reorders columns ({ visibleColumns?, hiddenColumns?, order? }).",
  inputSchema: z.object({
    visibleColumns: z
      .array(z.string())
      .optional()
      .describe("Explicit list of column names to make visible"),
    hiddenColumns: z
      .array(z.string())
      .optional()
      .describe("List of column names to hide"),
    order: z
      .array(z.string())
      .optional()
      .describe("New left-to-right order of columns"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    visibleCount: z.number().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall: "When adjusting column visibility or display order.",
  whenNotToCall: "When filtering table data.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.PIN`.
 */
export const GRID_PIN_CONTRACT = {
  description: "Pins columns to the left or right ({ columns }).",
  inputSchema: z.object({
    columns: z
      .array(z.string())
      .describe("List of column names to freeze/pin to the left edge of the grid"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    pinnedColumns: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall: "When column freezing or pinning is requested.",
  whenNotToCall: "When pinning is not requested.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.RESET_LAYOUT`.
 */
export const GRID_RESET_LAYOUT_CONTRACT = {
  description: "Resets the grid to default layout and visibility.",
  inputSchema: z.object({
    resetFilters: z.boolean().optional().default(true),
    resetSort: z.boolean().optional().default(true),
    resetColumns: z.boolean().optional().default(true),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall: "When the user wants to reset custom column arrangements.",
  whenNotToCall: "When keeping the current layout.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.EXPORT`.
 */
export const GRID_EXPORT_CONTRACT = {
  description:
    "Exports the table to file ({ format: 'xlsx'|'parquet'|'csv'|'gz' }).",
  inputSchema: z.object({
    format: z
      .enum(["xlsx", "parquet", "csv", "gz"])
      .optional()
      .default("xlsx")
      .describe("Export file format"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    format: z.string().optional(),
    rowCount: z.number().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall:
    "When the user requests exporting or downloading data to Excel, CSV, or Parquet.",
  whenNotToCall: "When only viewing data on screen.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.PROFILE`.
 */
export const GRID_PROFILE_CONTRACT = {
  description:
    "Analyzes column null counts, cardinality, and data quality anomalies.",
  inputSchema: z.object({}).describe("No parameters needed"),
  outputSchema: z.object({
    success: z.boolean(),
    columns: z.array(z.any()).optional().describe("Column profile statistics"),
    rowCount: z.number().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall:
    "When the user requests data profiling or inspecting data quality anomalies.",
  whenNotToCall: "When the user is searching for specific rows.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.ANALYZE`.
 */
export const GRID_ANALYZE_CONTRACT = {
  description:
    "Generates a statistical analysis summary of active data ({ columns? }).",
  inputSchema: z.object({
    columns: z
      .array(z.string())
      .optional()
      .describe("Specific numeric/categorical columns to calculate statistics for"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    summary: z.any().optional().describe("Calculated metrics summary"),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall:
    "When statistical summary or distribution analysis is requested.",
  whenNotToCall: "When statistical summary is not requested.",
} satisfies ActionContract;

/**
 * Action Contract for `result_grid:active.actions.VISUALIZE`.
 */
export const GRID_VISUALIZE_CONTRACT = {
  description:
    "Generates a visual chart or plot from table data ({ type?, dimension?, metric? }).",
  inputSchema: z.object({
    type: z
      .enum(["bar", "line", "pie", "area"])
      .optional()
      .default("bar")
      .describe("Visualization chart type"),
    dimension: z
      .string()
      .optional()
      .describe("Category or grouping column"),
    metric: z
      .string()
      .optional()
      .describe("Numeric metric column"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    chartType: z.string().optional(),
    error: z.string().optional(),
  }),
  when: { phase: "results" },
  whenToCall: "When the user requests a chart, plot, or graph visualization.",
  whenNotToCall: "When there are no numeric metrics in the table.",
} satisfies ActionContract;
