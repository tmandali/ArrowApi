import {
  analyzeGrid,
  profileGrid,
  getReportSchema,
  runExpertSql,
  setGridQuery,
  visualizeGrid,
} from "./grid-sql-tools";
import {
  applyFilter,
  sortCurrentGrid,
  configureGridColumns,
  pinGridColumns,
  applyGridFiltersMulti,
  resetGridLayout,
  exportGridData,
} from "./grid-ui-tools";
import {
  runJobTool,
  applyCriteriaTool,
  navigateToPageTool,
  openLastReportTool,
  validateCriteriaInputTool,
  getCurrentCriteriaTool,
  findMatchingReportTool,
  listReportExecutionsTool,
  cancelJobTool,
} from "./job-lifecycle-tools";
import { getJobDetailTool } from "./job-detail-tool";
import {
  JOB_OPEN_LAST_ACTION_CONTRACT,
  JOB_DETAIL_ACTION_CONTRACT,
  JOB_LIST_ACTION_CONTRACT,
  JOB_FIND_ACTION_CONTRACT,
  JOB_CANCEL_ACTION_CONTRACT,
  JOB_SELECT_ACTION_CONTRACT,
} from "./job-history-contracts";
import { APP_ROUTER_NAVIGATE_CONTRACT } from "./app-router-contracts";
import {
  CRITERIA_SET_FIELDS_CONTRACT,
  CRITERIA_APPLY_CONTRACT,
  CRITERIA_SUBMIT_CONTRACT,
  CRITERIA_RUN_CONTRACT,
  CRITERIA_VALIDATE_CONTRACT,
  CRITERIA_READ_CONTRACT,
  CRITERIA_SCHEMA_CONTRACT,
} from "./criteria-form-contracts";
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
  GRID_ANALYZE_CONTRACT,
  GRID_VISUALIZE_CONTRACT,
} from "./result-grid-contracts";
import { pluginRegistry } from "@/lib/plugins/yula-plugins";
import { guardReadOnlySelect } from "@/lib/sql-guard";
import { uiEventBus } from "@my-agent/core";

export * from "./dispatch-types";
import {
  type DispatchActionParams,
  isJobFamily,
  parseComponentId,
} from "./dispatch-types";

/**
 * Headless React UI-Agent standart eylem yürütücüsü (`dispatch_component_action`).
 * Ekranda mount olan bileşen ailesine göre ilgili istemci aracını tetikler.
 */
export async function executeDispatchComponentAction({
  component_id,
  action,
  payload = {},
}: DispatchActionParams): Promise<unknown> {
  const { family, subId } = parseComponentId(component_id);
  const args = { ...payload };

  // 1. Kriter Formu Eylemleri
  if (family === "criteria_form") {
    if (subId && !args.report) {
      args.report = subId;
    }
    switch (action) {
      case "SET_FIELDS": {
        const parsed = CRITERIA_SET_FIELDS_CONTRACT.inputSchema.safeParse(args);
        return applyCriteriaTool(parsed.success ? { ...args, ...parsed.data } : args);
      }
      case "APPLY": {
        const parsed = CRITERIA_APPLY_CONTRACT.inputSchema.safeParse(args);
        return applyCriteriaTool(parsed.success ? { ...args, ...parsed.data } : args);
      }
      case "SUBMIT": {
        const parsed = CRITERIA_SUBMIT_CONTRACT.inputSchema.safeParse(args);
        return runJobTool(parsed.success ? { ...args, ...parsed.data } : args);
      }
      case "RUN": {
        const parsed = CRITERIA_RUN_CONTRACT.inputSchema.safeParse(args);
        return runJobTool(parsed.success ? { ...args, ...parsed.data } : args);
      }
      case "VALIDATE": {
        const parsed = CRITERIA_VALIDATE_CONTRACT.inputSchema.safeParse(args);
        return validateCriteriaInputTool(parsed.success ? { ...args, ...parsed.data } : args);
      }
      case "READ": {
        const parsed = CRITERIA_READ_CONTRACT.inputSchema.safeParse(args);
        return getCurrentCriteriaTool(parsed.success ? { ...args, ...parsed.data } : args);
      }
      case "SCHEMA": {
        const parsed = CRITERIA_SCHEMA_CONTRACT.inputSchema.safeParse(args);
        const report = parsed.success && parsed.data.report ? parsed.data.report : (typeof args.report === "string" ? args.report : undefined);
        return getReportSchema(report);
      }
      default:
        return { status: "unknown-action", component_id, action };
    }
  }

  // 2. Sonuç Izgarası (Virtual Spreadsheet / Grid) Eylemleri
  if (family === "result_grid") {
    switch (action) {
      case "RUN_SQL":
      case "SQL": {
        const parsed = GRID_RUN_SQL_CONTRACT.inputSchema.safeParse(args);
        return runExpertSql(parsed.success ? parsed.data : args);
      }
      case "QUERY": {
        const parsed = GRID_QUERY_CONTRACT.inputSchema.safeParse(args);
        return setGridQuery(parsed.success ? parsed.data : args);
      }
      case "FILTER": {
        const parsed = GRID_FILTER_CONTRACT.inputSchema.safeParse(args);
        if (parsed.success) {
          return applyFilter(parsed.data.field, String(parsed.data.value ?? ""), parsed.data.op || "eq");
        }
        const field = String(args.field ?? "");
        const value = String(args.value ?? "");
        const op = String(args.op ?? "eq");
        return applyFilter(field, value, op);
      }
      case "APPLY_FILTERS": {
        const parsed = GRID_APPLY_FILTERS_CONTRACT.inputSchema.safeParse(args);
        if (parsed.success) {
          return applyGridFiltersMulti(parsed.data.filters as Record<string, string>, parsed.data.clearOthers);
        }
        const filters = (args.filters ?? {}) as Record<string, string>;
        const clearOthers = Boolean(args.clearOthers);
        return applyGridFiltersMulti(filters, clearOthers);
      }
      case "SORT": {
        const parsed = GRID_SORT_CONTRACT.inputSchema.safeParse(args);
        if (parsed.success) {
          return sortCurrentGrid(parsed.data.column, parsed.data.direction);
        }
        const column = String(args.column ?? "");
        const direction = String(args.direction ?? "asc") as "asc" | "desc" | "none";
        return sortCurrentGrid(column, direction);
      }
      case "COLUMNS": {
        const parsed = GRID_COLUMNS_CONTRACT.inputSchema.safeParse(args);
        if (parsed.success) {
          return configureGridColumns(parsed.data);
        }
        return configureGridColumns({
          visibleColumns: Array.isArray(args.visibleColumns) ? (args.visibleColumns as string[]) : undefined,
          hiddenColumns: Array.isArray(args.hiddenColumns) ? (args.hiddenColumns as string[]) : undefined,
          order: Array.isArray(args.order) ? (args.order as string[]) : undefined,
        });
      }
      case "PIN": {
        const parsed = GRID_PIN_CONTRACT.inputSchema.safeParse(args);
        if (parsed.success) {
          return pinGridColumns(parsed.data.columns);
        }
        const columns = Array.isArray(args.columns) ? (args.columns as string[]) : [];
        return pinGridColumns(columns);
      }
      case "RESET_LAYOUT": {
        const parsed = GRID_RESET_LAYOUT_CONTRACT.inputSchema.safeParse(args);
        if (parsed.success) {
          return resetGridLayout(parsed.data);
        }
        return resetGridLayout({
          resetFilters: args.resetFilters !== false,
          resetSort: args.resetSort !== false,
          resetColumns: args.resetColumns !== false,
        });
      }
      case "EXPORT": {
        const parsed = GRID_EXPORT_CONTRACT.inputSchema.safeParse(args);
        const format = parsed.success && parsed.data.format ? parsed.data.format : (String(args.format ?? "xlsx") as "xlsx" | "parquet" | "csv" | "gz");
        return exportGridData(format);
      }
      case "VISUALIZE":
      case "CHART": {
        const parsed = GRID_VISUALIZE_CONTRACT.inputSchema.safeParse(args);
        return visualizeGrid(parsed.success ? parsed.data : args);
      }
      case "ANALYZE": {
        const parsed = GRID_ANALYZE_CONTRACT.inputSchema.safeParse(args);
        return analyzeGrid(parsed.success ? parsed.data : args);
      }
      case "PROFILE":
        return profileGrid();
      default:
        return { status: "unknown-action", component_id, action };
    }
  }

  // 3. Sayfa Yönlendirme (App Router)
  if (family === "app_router" || component_id === "app_router") {
    const parsed = APP_ROUTER_NAVIGATE_CONTRACT.inputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        status: "error",
        error: parsed.error.issues.map((i) => i.message).join(", "),
      };
    }
    try {
      uiEventBus.dispatch("app_router", "NAVIGATE", parsed.data);
    } catch {
      // ignore
    }
    return navigateToPageTool(parsed.data);
  }

  // 4. Arrow Job (Tekil İş) ve Arrow Job Manager / İş Geçmişi (Katalog)
  if (isJobFamily(family)) {
    if (subId && !args.report) {
      args.report = subId;
    }
    switch (action) {
      case "OPEN_LAST": {
        const parsed = JOB_OPEN_LAST_ACTION_CONTRACT.inputSchema.safeParse(args);
        return openLastReportTool(parsed.success ? parsed.data : args);
      }
      case "GET_STATUS":
      case "STATUS":
      case "GET_SUMMARY":
      case "GET_DETAIL":
      case "DETAIL": {
        const parsed = JOB_DETAIL_ACTION_CONTRACT.inputSchema.safeParse(args);
        return getJobDetailTool(parsed.success ? parsed.data : args);
      }
      case "LIST": {
        const parsed = JOB_LIST_ACTION_CONTRACT.inputSchema.safeParse(args);
        return listReportExecutionsTool(parsed.success ? parsed.data : args);
      }
      case "FIND": {
        const parsed = JOB_FIND_ACTION_CONTRACT.inputSchema.safeParse(args);
        if (!parsed.success) {
          return {
            status: "error",
            error: parsed.error.issues.map((i) => i.message).join(", "),
          };
        }
        return findMatchingReportTool(parsed.data);
      }
      case "CANCEL": {
        const parsed = JOB_CANCEL_ACTION_CONTRACT.inputSchema.safeParse(args);
        if (!parsed.success) {
          return {
            status: "error",
            error: parsed.error.issues.map((i) => i.message).join(", "),
          };
        }
        return cancelJobTool(parsed.data);
      }
      case "SELECT": {
        const parsed = JOB_SELECT_ACTION_CONTRACT.inputSchema.safeParse(args);
        if (!parsed.success) {
          return {
            status: "error",
            error: parsed.error.issues.map((i) => i.message).join(", "),
          };
        }
        return { status: "ok", selectedJobId: parsed.data.jobId };
      }
      case "REFRESH":
        return { status: "ok", message: "Execution history refreshed" };
      default:
        return { status: "unknown-action", component_id, action };
    }
  }

  // 5. Eklenti (Plugin) Araçları
  if (family === "plugin") {
    const customTools = pluginRegistry.getCustomTools();
    const tool = customTools[action] || (subId ? customTools[subId] : undefined);
    if (tool && typeof tool.execute === "function") {
      return tool.execute(args);
    }
    return { status: "unknown-plugin-tool", component_id, action };
  }

  // 6. Master Data / Varlık Formları (Entity Forms)
  if (family === "entity_form") {
    return {
      status: "unhandled-entity-form",
      component_id,
      action,
      message: `Entity form action ${action} for ${subId} must be handled by the mounted UI component.`,
    };
  }

  // 7. Wasm SQL Engine (Headless Browser-Side WebAssembly SQL Engine)
  if (family === "wasm_sql_engine" || component_id === "wasm_sql_engine") {
    switch (action) {
      case "RUN_SQL":
      case "SQL":
      case "QUERY": {
        const rawSql =
          typeof args.query === "string" && args.query.trim().length > 0
            ? args.query
            : typeof args.sql === "string"
              ? args.sql
              : "";
        const guard = guardReadOnlySelect(rawSql);
        if (!guard.ok) {
          return { status: "error", error: guard.error, hint: guard.hint };
        }
        try {
          const { wasmSqlClient } = await import("@/services/wasmsql");
          const limit = typeof args.limit === "number" && args.limit > 0 ? args.limit : 100;
          const rows = await wasmSqlClient.executeCustomSql(guard.sql);
          const truncated = rows.length > limit;
          const resultRows = truncated ? rows.slice(0, limit) : rows;
          const columns = resultRows.length > 0 ? Object.keys(resultRows[0]) : [];
          return {
            status: "ok",
            rowCount: resultRows.length,
            columns,
            rows: resultRows,
            truncated,
          };
        } catch (err) {
          return {
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      case "DESCRIBE_TABLE":
      case "DESCRIBE": {
        try {
          const target =
            typeof args.tableOrView === "string" && args.tableOrView.trim().length > 0
              ? args.tableOrView.trim()
              : "active_view";
          const safeTarget = target.replace(/[^a-zA-Z0-9_]/g, "");
          const { wasmSqlClient } = await import("@/services/wasmsql");
          const columns = await wasmSqlClient.describeTable(safeTarget);
          return {
            status: "ok",
            tableOrView: target,
            columns,
          };
        } catch (err) {
          return {
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      case "LIST_TABLES": {
        try {
          const { wasmSqlClient } = await import("@/services/wasmsql");
          const rows = await wasmSqlClient.executeCustomSql("SHOW TABLES;");
          const tables = rows.map((r: Record<string, unknown>) => String(Object.values(r)[0] ?? ""));
          return {
            status: "ok",
            tables,
          };
        } catch (err) {
          return {
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      default:
        return { status: "unknown-action", component_id, action };
    }
  }

  return { status: "unknown-component", component_id, action };
}
