/**
 * Yula Modüler UI Becerileri (@my-agent/core skillsManager).
 * Bileşenler mount edildiğinde ilgili beceriler otomatik devreye girer.
 */
import { skillsManager } from "@my-agent/core";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import {
  formatLocalizedRelativeDateTerms,
} from "../yula-prompt-directives";

const REPORTS_DIGEST_LINES = REGISTERED_REPORTS.map((r) => {
  const fields = Object.entries(r.criteriaSchema.properties)
    .map(
      ([key, prop]) =>
        `${key} (${prop.title ?? key}${prop.enum ? `, options: ${prop.enum.join("|")}` : ""})`,
    )
    .join("; ");
  return `- ${r.scope} (${r.title}) [route: ${r.pagePath}]: ${fields}`;
}).join("\n");

export const AGENT_PREPARE_CHAIN_RULES = [
  "AGENT SESSION PREPARE CHAIN (active persona + WORKSPACE phase + target report on another screen):",
  "• Prepare-type requests are FULL prepare chains, never navigate-only:",
  "  1. Identify the target report (catalog / RAG router) and learn its fields via dispatch_component_action (component_id='criteria_form:<scope>', action='SCHEMA').",
  `  2. Extract criteria from the request and automatically expand relative dates (${formatLocalizedRelativeDateTerms()}) to exact ISO ranges without asking choice questions. Read draft with action='READ', merge, then call dispatch_component_action with component_id='criteria_form:<scope>', action='SET_FIELDS' (apply_criteria) with the COMPLETE set for the target scope BEFORE navigating.`,
  "  3. Open the target route via dispatch_component_action with component_id='app_router', action='NAVIGATE' (navigate_to_page) (payload: { path: '/...' }) in the SAME turn. Include the report link in your reply.",
  "  4. Reply with what was filled (field names + values in the user's language). If user intent is preparation/workflow consultation (not explicit execution), invoke 'ask_user_choice' to offer interactive choice cards to run the report or adjust filters (with label, description, and rationale). NEVER format text as fake clickable bullets.",
  "• Preparing ≠ running: If user intent is preparation or workflow consultation, do NOT call action='SUBMIT' directly; present the plan/criteria and invoke 'ask_user_choice'. In DIRECT_EXECUTION mode (explicit run intent), directly execute action='SUBMIT' (chaining action='SET_FIELDS' if specific criteria were provided in the request).",
].join("\n");

export function registerYulaSkills(): void {
  if (!skillsManager.getSkill("report-catalog-navigation")) {
    skillsManager.registerSkill({
      name: "report-catalog-navigation",
      description: "Rapor Kataloğu ve Gezinme Kılavuzu (REPORT CATALOG & NAVIGATION)",
      applicableComponents: ["app_router", "job_history"],
      instructions: [
        "REPORT CATALOG & NAVIGATION (via dispatch_component_action):",
        "• To prepare or fill criteria: dispatch_component_action with component_id='criteria_form:<scope>', action='SET_FIELDS', payload: { criteria, report: '<scope>' }.",
        "• Only execute on explicit run request: dispatch_component_action with component_id='criteria_form:<scope>', action='SUBMIT', payload: { criteria, report: '<scope>' }.",
        "• To navigate to another page/report: dispatch_component_action with component_id='app_router', action='NAVIGATE', payload: { path: '/...' }.",
        "• To view past reports: dispatch_component_action with component_id='job_history', action='OPEN_LAST' or action='LIST'.",
        "• To ask interactive choices/clarifications: call 'ask_user_choice' with question and options.",
        "• Available reports in catalog:",
        REPORTS_DIGEST_LINES,
      ].join("\n"),
    });
  }

  if (!skillsManager.getSkill("active-table-grid-operations")) {
    skillsManager.registerSkill({
      name: "active-table-grid-operations",
      description: "Canlı Tablo ve DuckDB SQL Kılavuzu (ACTIVE TABLE & GRID OPERATIONS)",
      applicableComponents: ["result_grid:active"],
      instructions: [
        "ACTIVE TABLE & GRID OPERATIONS (via dispatch_component_action on 'result_grid:active'):",
        "• DUCKDB VIEWS GROUNDING: The current screen view (with active filters, sorting, and selected query) is automatically synchronized as a DuckDB VIEW named 'active_view'.",
        "• When the user asks questions about the current screen/view: write SQL queries directly targeting 'active_view' via action='RUN_SQL' (payload: { query: 'SELECT ... FROM active_view ...' }).",
        "• Query the base table name only when unfiltered raw data is requested.",
        "• Sorting: action='SORT' (payload: { column, direction: 'asc'|'desc'|'none' }).",
        "• Filtering: action='FILTER' (payload: { field, value, op }) or action='APPLY_FILTERS' (payload: { filters, clearOthers }).",
        "• Columns: action='COLUMNS' (payload: { visibleColumns, hiddenColumns, order }) or action='PIN'.",
        "• Reset: action='RESET_LAYOUT'.",
        "• Export: action='EXPORT' (payload: { format: 'xlsx'|'parquet'|'csv'|'gz' }).",
        "• Charts & Analytics: action='VISUALIZE' (payload: { type, dimension, metric }) or action='ANALYZE' or action='PROFILE'.",
      ].join("\n"),
    });
  }
}
