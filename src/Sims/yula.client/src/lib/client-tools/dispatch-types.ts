/**
 * Standard Component Family and Action contracts for Headless React UI-Agent dispatch.
 */

/**
 * Arrow Job family identifiers.
 * - "arrow_job": Individual job runtime / cancel / status
 * - "arrow_job_manager": Central execution hub / status
 * - "job_history": Legacy catalog / report executions list
 */
export type JobComponentFamily = "arrow_job" | "arrow_job_manager" | "job_history";

/**
 * Standard UI component families mountable in Headless React UI-Agent.
 */
export type ComponentFamily =
  | "criteria_form"
  | "result_grid"
  | "app_router"
  | JobComponentFamily
  | "wasm_sql_engine"
  | "entity_form"
  | "plugin";

/**
 * Type guard checking whether a family string belongs to Arrow Job operations.
 */
export function isJobFamily(family: string | undefined | null): family is JobComponentFamily {
  return family === "job_history" || family === "arrow_job_manager" || family === "arrow_job";
}

/**
 * Type guard checking whether a family string is a known ComponentFamily.
 */
export function isComponentFamily(family: string | undefined | null): family is ComponentFamily {
  if (!family) return false;
  return (
    family === "criteria_form" ||
    family === "result_grid" ||
    family === "app_router" ||
    family === "wasm_sql_engine" ||
    family === "entity_form" ||
    family === "plugin" ||
    isJobFamily(family)
  );
}

/**
 * Parses component_id string into typed family and optional subId.
 * Example: 'criteria_form:retail-sales' -> { family: 'criteria_form', subId: 'retail-sales' }
 */
export function parseComponentId(componentId: string): {
  family: ComponentFamily | string;
  subId?: string;
} {
  const colonIndex = componentId.indexOf(":");
  if (colonIndex === -1) {
    return { family: componentId };
  }
  const family = componentId.slice(0, colonIndex);
  const subId = componentId.slice(colonIndex + 1);
  return { family, subId: subId || undefined };
}

/**
 * Standard component ID format supporting scoped identifiers (e.g., 'criteria_form:sales').
 */
export type ComponentId<F extends ComponentFamily = ComponentFamily> =
  | F
  | `${F}:${string}`;

export type JobHistoryAction =
  | "OPEN_LAST"
  | "GET_DETAIL"
  | "DETAIL"
  | "LIST"
  | "FIND"
  | "CANCEL"
  | "SELECT"
  | "REFRESH";

export type JobAction = JobHistoryAction;

export type CriteriaFormAction =
  | "SET_FIELDS"
  | "APPLY"
  | "SUBMIT"
  | "RUN"
  | "VALIDATE"
  | "READ"
  | "SCHEMA";

export type ResultGridAction =
  | "RUN_SQL"
  | "SQL"
  | "QUERY"
  | "FILTER"
  | "APPLY_FILTERS"
  | "SORT"
  | "COLUMNS"
  | "PIN"
  | "RESET_LAYOUT"
  | "EXPORT"
  | "VISUALIZE"
  | "CHART"
  | "ANALYZE"
  | "PROFILE";

export type AppRouterAction = "NAVIGATE";

export type WasmSqlAction =
  | "RUN_SQL"
  | "SQL"
  | "QUERY"
  | "DESCRIBE_TABLE"
  | "DESCRIBE"
  | "LIST_TABLES";

export type ComponentAction =
  | JobHistoryAction
  | CriteriaFormAction
  | ResultGridAction
  | WasmSqlAction
  | AppRouterAction
  | (string & {});

export type ComponentActionMap = {
  criteria_form: CriteriaFormAction;
  result_grid: ResultGridAction;
  app_router: AppRouterAction;
  arrow_job: JobHistoryAction;
  arrow_job_manager: JobHistoryAction;
  job_history: JobHistoryAction;
  wasm_sql_engine: WasmSqlAction;
  entity_form: string;
  plugin: string;
};

export interface DispatchActionParams {
  component_id: ComponentId | (string & {});
  action: ComponentAction;
  payload?: Record<string, unknown>;
}
