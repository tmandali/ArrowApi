import { z } from "zod";
import type { ActionContract } from "@my-agent/core";
export { JOB_DETAIL_ACTION_CONTRACT } from "./job-detail-tool";

/**
 * Action Contract for `job_history.actions.OPEN_LAST`.
 */
export const JOB_OPEN_LAST_ACTION_CONTRACT = {
  description:
    "Opens the most recently completed report result on the screen ({ report?: string }). Defaults to active report if omitted.",
  inputSchema: z.object({
    report: z
      .string()
      .optional()
      .describe("Target report scope name (e.g. 'retail-sales-report', 'stock-balance'). Defaults to active screen report."),
  }),
  outputSchema: z.object({
    status: z.string().describe("Navigation status ('navigated', 'not_found', 'error')"),
    jobId: z.string().optional().describe("GUID of the opened job"),
    navigateTo: z.string().optional().describe("URL path to navigate to"),
    message: z.string().optional().describe("Result explanation message"),
    error: z.string().optional().describe("Error message if failed"),
  }),
  whenToCall: "When the user asks to 'open last report', 'show latest result', etc.",
  whenNotToCall: "When the user intends to execute a new report.",
} satisfies ActionContract;

/**
 * Action Contract for `job_history.actions.LIST`.
 */
export const JOB_LIST_ACTION_CONTRACT = {
  description:
    "Lists past execution runs ({ report?: string, limit?: number }). If report is omitted, defaults to the active screen's report, or lists recent runs across all reports if not on a report screen.",
  inputSchema: z.object({
    report: z
      .string()
      .optional()
      .describe("Report scope to filter executions by. Omit to list runs of the active screen."),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of past runs to return (1-10, defaults to 10)."),
  }),
  outputSchema: z.object({
    status: z.string().describe("Listing status ('ok', 'error')"),
    report: z.string().optional().describe("Target report scope"),
    reportTitle: z.string().optional().describe("User-facing title of the report"),
    total: z.number().optional().describe("Total number of execution records found"),
    loadedCount: z.number().optional().describe("Number of executions loaded in panel"),
    executions: z.array(
      z.object({
        jobId: z.string().describe("Job execution GUID"),
        report: z.string().describe("Report scope"),
        reportTitle: z.string().optional(),
        status: z.string().describe("Job status (Running, Completed, Failed, Cancelled)"),
        createdAt: z.string().describe("Creation timestamp"),
        rowCount: z.number().optional().describe("Result row count if completed"),
        href: z.string().optional().describe("Navigation URL to the result"),
      }),
    ),
    message: z.string().optional().describe("Summary message"),
  }),
  whenToCall:
    "When the user asks 'how many reports ran' ('kaç rapor çalışmış'), 'which reports ran', 'show history', 'list past jobs', etc.",
  whenNotToCall:
    "When the user wants to execute a new report run (use SUBMIT or RUN).",
} satisfies ActionContract;

/**
 * Action Contract for `job_history.actions.FIND`.
 */
export const JOB_FIND_ACTION_CONTRACT = {
  description:
    "Searches past report executions or matching jobs ({ query, report?: string }). Defaults to active report if omitted.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Search term, status, date substring, or criteria value to match"),
    report: z
      .string()
      .optional()
      .describe("Target report scope (defaults to active screen report)"),
  }),
  outputSchema: z.object({
    status: z.string().describe("Search status ('ok', 'not_found', 'error')"),
    report: z.string().optional().describe("Scope searched"),
    total: z.number().optional().describe("Number of matching jobs found"),
    matches: z.array(
      z.object({
        jobId: z.string(),
        status: z.string(),
        createdAt: z.string(),
        rowCount: z.number().optional(),
        href: z.string().optional(),
      }),
    ),
    message: z.string().optional(),
  }),
  whenToCall:
    "When the user wants to find a specific past job, execution, or report run matching criteria or date.",
  whenNotToCall:
    "When requesting the entire list (use LIST) or running a new report.",
} satisfies ActionContract;

/**
 * Action Contract for `job_history.actions.CANCEL`.
 */
export const JOB_CANCEL_ACTION_CONTRACT = {
  description:
    "Cancels an active or running report execution ({ jobId }).",
  inputSchema: z.object({
    jobId: z
      .string()
      .describe("GUID of the active running execution job to cancel"),
  }),
  outputSchema: z.object({
    status: z.string().describe("Cancellation status ('ok', 'error')"),
    jobId: z.string().describe("GUID of the cancelled job"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error explanation if failed"),
  }),
  whenToCall:
    "When the user explicitly asks to 'stop', 'abort', or 'cancel' an execution.",
  whenNotToCall:
    "When the job is already finished or terminated.",
} satisfies ActionContract;

/**
 * Action Contract for `job_history.actions.SELECT`.
 */
export const JOB_SELECT_ACTION_CONTRACT = {
  description:
    "Selects a past execution in the panel to inspect its details ({ jobId }).",
  inputSchema: z.object({
    jobId: z
      .string()
      .describe("GUID of the past execution to select and highlight"),
  }),
  outputSchema: z.object({
    status: z.string().describe("Selection status ('ok', 'error')"),
    selectedJobId: z.string().optional().describe("GUID of the selected job"),
    error: z.string().optional(),
  }),
  whenToCall:
    "When the user wants to view or select a specific run in the executions panel.",
  whenNotToCall:
    "When the user is executing a new report or filtering.",
} satisfies ActionContract;

/**
 * Action Contract for `job_history.actions.REFRESH`.
 */
export const JOB_REFRESH_ACTION_CONTRACT = {
  description:
    "Refreshes the execution list from the server.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.string().describe("Refresh status ('ok', 'error')"),
    message: z.string().optional(),
  }),
  whenToCall:
    "When the user asks to reload or refresh past runs in the panel.",
  whenNotToCall:
    "When the current list is already up to date.",
} satisfies ActionContract;

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
