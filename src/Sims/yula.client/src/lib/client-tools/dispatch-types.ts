/**
 * Standard Component Family and Action contracts for Headless React UI-Agent dispatch.
 * Actions are colocated with their respective component contracts and aggregated here.
 */

import type { CriteriaFormAction } from "./criteria-form-contracts";
import type { ResultGridAction } from "./result-grid-contracts";
import type { AppRouterAction } from "./app-router-contracts";
import type { JobHistoryAction, JobAction } from "./job-history-contracts";
import type { WasmSqlAction } from "@/services/wasmsql/ai/wasm-sql-contracts";
import type { Gate } from "@my-agent/core";

export type {
  CriteriaFormAction,
  ResultGridAction,
  AppRouterAction,
  JobHistoryAction,
  JobAction,
  WasmSqlAction,
};

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

/**
 * Aggregated union of all supported component actions.
 */
export type ComponentAction =
  | JobHistoryAction
  | CriteriaFormAction
  | ResultGridAction
  | WasmSqlAction
  | AppRouterAction
  | (string & {});

/**
 * Family-to-Action mapping guaranteeing typesafe actions per component family.
 */
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
  /** Optional cooperative Effect Gate from @my-agent/core for async cancellation */
  gate?: Gate;
  /** Optional standard AbortSignal */
  signal?: AbortSignal;
}
