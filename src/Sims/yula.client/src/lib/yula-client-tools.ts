import {
  analyzeGrid,
  profileGrid,
  getReportSchema,
  runExpertSql,
  setGridQuery,
  visualizeGrid,
} from "./client-tools/grid-sql-tools";
import {
  applyFilter,
  sortCurrentGrid,
  configureGridColumns,
  pinGridColumns,
  applyGridFiltersMulti,
  resetGridLayout,
  exportGridData,
} from "./client-tools/grid-ui-tools";
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
} from "./client-tools/job-lifecycle-tools";
import {
  askUserQuestionTool,
  suggestNextStepsTool,
  runUserSkillTool,
  readUserFileTool,
} from "./client-tools/interactive-tools";

export { resetGridCustomView } from "./client-tools/dataset";

/**
 * İstemci tarafı araç yürütücüleri — kullanıcının etkileşimiyle ya da
 * modelin dynamic-tool çağrısıyla çalışır, çıktı akışa geri verilir.
 *
 * İnce dispatcher: her araç gövdesi kendi katman modülünde yaşar —
 * Layer 1 (`grid-ui-tools`), Layer 2 (`grid-sql-tools`), Layer 3
 * (`job-lifecycle-tools`), etkileşimli (`interactive-tools`).
 * Dış API (`executeClientTool`, `resetGridCustomView`) değişmedi.
 */

export async function executeClientTool(
  toolName: string,
  input: unknown,
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "run_job":
      return runJobTool(args);
    case "apply_criteria":
      return applyCriteriaTool(args);
    case "navigate_to_page":
      return navigateToPageTool(args);
    case "open_last_report":
      return openLastReportTool(args);
    case "analyze_grid_data":
      return analyzeGrid(args);
    case "profile_grid_table":
      return profileGrid();
    case "run_expert_sql":
      return runExpertSql(args);
    case "get_report_schema":
      return getReportSchema(typeof args.report === "string" ? args.report : undefined);
    case "visualize_grid_data":
      return visualizeGrid(args);
    case "set_grid_query":
      return setGridQuery(args);
    case "request_user_confirmation":
      return {
        confirmed: false,
        message: "Waiting for user confirmation response.",
      };
    case "ask_user_question":
      return askUserQuestionTool(args);
    case "suggest_next_steps":
      return suggestNextStepsTool(args);
    case "run_user_skill":
      return runUserSkillTool(args);
    case "read_user_file":
      return readUserFileTool(args);
    case "filter_current_grid": {
      const field = String(args.field ?? "");
      const value = String(args.value ?? "");
      return await applyFilter(field, value, String(args.op ?? "eq"));
    }
    case "set_grid_sort": {
      const column = String(args.column ?? "");
      const direction = String(args.direction ?? "asc") as "asc" | "desc" | "none";
      return await sortCurrentGrid(column, direction);
    }
    case "configure_grid_columns": {
      return await configureGridColumns({
        visibleColumns: Array.isArray(args.visibleColumns)
          ? (args.visibleColumns as string[])
          : undefined,
        hiddenColumns: Array.isArray(args.hiddenColumns)
          ? (args.hiddenColumns as string[])
          : undefined,
        order: Array.isArray(args.order)
          ? (args.order as string[])
          : undefined,
      });
    }
    case "pin_grid_columns": {
      const columns = Array.isArray(args.columns)
        ? (args.columns as string[])
        : [];
      return await pinGridColumns(columns);
    }
    case "apply_grid_filters": {
      const filters = (args.filters ?? {}) as Record<string, string>;
      const clearOthers = Boolean(args.clearOthers);
      return await applyGridFiltersMulti(filters, clearOthers);
    }
    case "reset_grid_layout": {
      return await resetGridLayout({
        resetFilters: args.resetFilters !== false,
        resetSort: args.resetSort !== false,
        resetColumns: args.resetColumns !== false,
      });
    }
    case "export_grid_data": {
      const format = String(args.format ?? "xlsx") as "xlsx" | "parquet" | "csv" | "gz";
      return await exportGridData(format);
    }
    case "validate_criteria_input":
      return validateCriteriaInputTool(args);
    case "get_current_criteria":
      return getCurrentCriteriaTool(args);
    case "find_matching_report":
      return findMatchingReportTool(args);
    case "list_report_executions":
      return listReportExecutionsTool(args);
    case "cancel_job":
      return cancelJobTool(args);
    default:
      return { status: "unknown-tool", toolName };
  }
}
