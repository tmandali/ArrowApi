import type { YulaToolPartInfo } from "@/lib/yula-tool-info";
import type { WorkedStepItem, WorkedStepsT } from "./yula-worked-steps";

type TranslationFn = (
  key: Parameters<WorkedStepsT>[0],
  values?: Parameters<WorkedStepsT>[1],
) => string;

export function mapGridToolInfoToWorkedSteps(
  info: YulaToolPartInfo,
  inputObj: Record<string, unknown>,
  isPending: boolean,
  isError: boolean,
  L: TranslationFn,
): WorkedStepItem[] | null {
  const steps: WorkedStepItem[] = [];

  switch (info.toolName) {
    case "get_report_schema": {
      steps.push({
        id: info.toolCallId,
        kind: "explored",
        label: "Explored report criteria & JSON schema",
        subLabel: isPending ? "Fetching report schema & criteria..." : "Schema prep",
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "profile_grid_table":
    case "analyze_grid_data": {
      steps.push({
        id: info.toolCallId,
        kind: "explored",
        label: "Explored 1 table, RAG schema",
        subLabel: isPending
          ? "Profiling table & analyzing RAG schema..."
          : typeof inputObj.operation === "string"
            ? inputObj.operation
            : "Data profile",
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "run_expert_sql": {
      const sql = typeof inputObj.sql === "string" ? inputObj.sql.replace(/\s+/g, " ").trim() : "";
      const shortSql = sql.length > 40 ? `${sql.slice(0, 40)}…` : sql;
      steps.push({
        id: info.toolCallId,
        kind: "ran",
        label: `Ran SQL: ${shortSql || "query"}`,
        subLabel: isPending ? "Executing SQL query..." : "query",
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "filter_current_grid": {
      const field = typeof inputObj.field === "string" ? inputObj.field : "";
      const val = typeof inputObj.value === "string" ? inputObj.value.trim() : "";
      const op = typeof inputObj.op === "string" ? inputObj.op : "";
      const isReset = field === "*" || inputObj.reset === true;

      let displayExpr = "";
      if (!isReset) {
        if (op === "empty") {
          displayExpr = L("filter_empty_values", { field });
        } else if (op === "notEmpty") {
          displayExpr = L("filter_filled_values", { field });
        } else if (op === "gt" || val.startsWith(">")) {
          const cleanVal = val.replace(/^>/, "").trim();
          displayExpr = `${field} > ${cleanVal}`;
        } else if (op === "lt" || val.startsWith("<")) {
          const cleanVal = val.replace(/^</, "").trim();
          displayExpr = `${field} < ${cleanVal}`;
        } else if (op === "contains") {
          displayExpr = `${field} ~ ${val}`;
        } else if (val) {
          displayExpr = `${field}${/^[<>=!]/.test(val) ? ` ${val}` : ` = ${val}`}`;
        } else {
          displayExpr = field;
        }
      }

      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label: isReset ? "Cleared grid filters" : `Filtered ${displayExpr}`,
        subLabel: isPending
          ? "Applying grid column filters..."
          : isReset
            ? "Reset filters"
            : val || undefined,
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "set_grid_sort": {
      const col = typeof inputObj.column === "string" ? inputObj.column : "";
      const dir = typeof inputObj.direction === "string" ? inputObj.direction : "asc";
      const dirText = dir === "none" ? L("sort_natural") : dir === "asc" ? L("sort_asc") : L("sort_desc");
      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label: dir === "none" ? L("sort_removed", { col }) : L("sort_applied", { col, dir: dirText }),
        subLabel: isPending ? L("sorting") : dirText,
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "configure_grid_columns": {
      const visible = Array.isArray(inputObj.visibleColumns) ? inputObj.visibleColumns : null;
      const hidden = Array.isArray(inputObj.hiddenColumns) ? inputObj.hiddenColumns : null;
      let label = L("cols_edited");
      if (visible) label = L("cols_shown", { count: visible.length });
      else if (hidden) label = L("cols_hidden", { count: hidden.length });
      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label,
        subLabel: isPending ? L("cols_setting") : undefined,
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "pin_grid_columns": {
      const cols = Array.isArray(inputObj.columns) ? inputObj.columns : [];
      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label: L("cols_pinned", { cols: cols.join(", ") }),
        subLabel: isPending ? L("cols_pinning") : "Sticky",
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "apply_grid_filters": {
      const filters = (inputObj.filters ?? {}) as Record<string, string>;
      const count = Object.keys(filters).length;
      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label: L("filters_applied", { count }),
        subLabel: isPending
          ? L("filters_applying")
          : Object.entries(filters)
              .map(([k, v]) => `${k}:${v}`)
              .join(", "),
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "reset_grid_layout": {
      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label: L("grid_reset"),
        subLabel: isPending ? L("grid_resetting") : L("default"),
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "export_grid_data": {
      const fmt = String(inputObj.format ?? "xlsx").toUpperCase();
      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label: L("exported", { fmt }),
        subLabel: isPending ? L("exporting") : L("exported_fmt", { fmt }),
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "set_grid_query": {
      const title = typeof inputObj.title === "string" ? inputObj.title.trim() : "";
      const sql = typeof inputObj.sql === "string" ? inputObj.sql.replace(/\s+/g, " ").trim() : "";
      const hasSql = Boolean(sql);
      const isReset = inputObj.reset === true && !hasSql;

      if (hasSql) {
        steps.push({
          id: `${info.toolCallId}-autocorrect`,
          kind: "explored",
          label: "Auto-corrected SQL query & grounded schema",
          subLabel: isPending
            ? "Correcting SQL & expanding dates..."
            : "Column mapping & relative date expansion",
          isLive: isPending,
          isError: false,
          info: {
            toolCallId: `${info.toolCallId}-autocorrect`,
            toolName: "sql_autocorrect",
            state: isPending ? "input-available" : "output-available",
            input: { note: L("sql_note") },
            output: {
              status: "ok",
              correctedSql: sql,
              note: L("sql_note_detail"),
            },
          },
        });
      }

      steps.push({
        id: info.toolCallId,
        kind: "edited",
        label: isReset ? "Reset grid view" : `Updated grid view query${title ? ` (${title})` : ""}`,
        subLabel: isPending
          ? "Refreshing grid view table..."
          : isReset
            ? "Base Table"
            : title || undefined,
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    case "visualize_grid_data": {
      const title = typeof inputObj.title === "string" ? inputObj.title.trim() : "";
      steps.push({
        id: info.toolCallId,
        kind: "ran",
        label: `Ran Chart: ${title || "Visualization"}`,
        subLabel: isPending ? "Generating chart visualization..." : "Chart visualization",
        isLive: isPending,
        isError,
        info,
      });
      return steps;
    }
    default:
      return null;
  }
}
