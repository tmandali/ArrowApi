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

export interface DispatchActionParams {
  component_id: string;
  action: string;
  payload?: Record<string, unknown>;
}

/**
 * Headless React UI-Agent standart eylem yürütücüsü (`dispatch_component_action`).
 * Ekranda mount olan bileşen ailesine göre ilgili istemci aracını tetikler.
 */
export async function executeDispatchComponentAction({
  component_id,
  action,
  payload = {},
}: DispatchActionParams): Promise<unknown> {
  const [family, subId] = component_id.split(":");
  const args = { ...payload };

  // 1. Kriter Formu Eylemleri
  if (family === "criteria_form") {
    if (subId && !args.report) {
      args.report = subId;
    }
    switch (action) {
      case "SET_FIELDS":
      case "APPLY":
        return applyCriteriaTool(args);
      case "SUBMIT":
      case "RUN":
        return runJobTool(args);
      case "VALIDATE":
        return validateCriteriaInputTool(args);
      case "READ":
        return getCurrentCriteriaTool(args);
      case "SCHEMA":
        return getReportSchema(typeof args.report === "string" ? args.report : undefined);
      default:
        return { status: "unknown-action", component_id, action };
    }
  }

  // 2. Sonuç Izgarası (Virtual Spreadsheet / Grid) Eylemleri
  if (family === "result_grid") {
    switch (action) {
      case "RUN_SQL":
      case "SQL":
        return runExpertSql(args);
      case "QUERY":
        return setGridQuery(args);
      case "FILTER": {
        const field = String(args.field ?? "");
        const value = String(args.value ?? "");
        const op = String(args.op ?? "eq");
        return applyFilter(field, value, op);
      }
      case "APPLY_FILTERS": {
        const filters = (args.filters ?? {}) as Record<string, string>;
        const clearOthers = Boolean(args.clearOthers);
        return applyGridFiltersMulti(filters, clearOthers);
      }
      case "SORT": {
        const column = String(args.column ?? "");
        const direction = String(args.direction ?? "asc") as "asc" | "desc" | "none";
        return sortCurrentGrid(column, direction);
      }
      case "COLUMNS": {
        return configureGridColumns({
          visibleColumns: Array.isArray(args.visibleColumns) ? (args.visibleColumns as string[]) : undefined,
          hiddenColumns: Array.isArray(args.hiddenColumns) ? (args.hiddenColumns as string[]) : undefined,
          order: Array.isArray(args.order) ? (args.order as string[]) : undefined,
        });
      }
      case "PIN": {
        const columns = Array.isArray(args.columns) ? (args.columns as string[]) : [];
        return pinGridColumns(columns);
      }
      case "RESET_LAYOUT": {
        return resetGridLayout({
          resetFilters: args.resetFilters !== false,
          resetSort: args.resetSort !== false,
          resetColumns: args.resetColumns !== false,
        });
      }
      case "EXPORT": {
        const format = String(args.format ?? "xlsx") as "xlsx" | "parquet" | "csv" | "gz";
        return exportGridData(format);
      }
      case "VISUALIZE":
      case "CHART":
        return visualizeGrid(args);
      case "ANALYZE":
        return analyzeGrid(args);
      case "PROFILE":
        return profileGrid();
      default:
        return { status: "unknown-action", component_id, action };
    }
  }

  // 3. Sayfa Yönlendirme (App Router)
  if (family === "app_router" || component_id === "app_router") {
    return navigateToPageTool(args);
  }

  // 4. İş Geçmişi / Rapor Yönetimi
  if (family === "job_history") {
    switch (action) {
      case "OPEN_LAST":
        return openLastReportTool(args);
      case "LIST":
        return listReportExecutionsTool(args);
      case "FIND":
        return findMatchingReportTool(args);
      case "CANCEL":
        return cancelJobTool(args);
      default:
        return { status: "unknown-action", component_id, action };
    }
  }

  return { status: "unknown-component", component_id, action };
}
