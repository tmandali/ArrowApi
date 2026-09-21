import { z } from "zod";
import type { ActionContract } from "@my-agent/core";

/**
 * Action Contract for `criteria_form.actions.SET_FIELDS`.
 */
export const CRITERIA_SET_FIELDS_CONTRACT = {
  description:
    "Primary action to mutate criteria form fields without executing the report ({ criteria }).",
  inputSchema: z.object({
    criteria: z
      .record(z.string(), z.any())
      .describe("Key-value mapping of criteria form fields to populate (e.g. { sirketKod: 'TRLC', hareketTarihi: '2026-09-01..2026-09-15' })"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether fields were updated successfully"),
    updatedFields: z.array(z.string()).optional().describe("List of field keys updated"),
    error: z.string().optional().describe("Error message if mutation failed"),
  }),
  whenToCall:
    "When the user specifies store, date, or filter parameters to fill into the form.",
  whenNotToCall:
    "When the user explicitly wants to run or submit the report (call SUBMIT or RUN).",
} satisfies ActionContract;

/**
 * Action Contract for `criteria_form.actions.APPLY` (Alias for SET_FIELDS).
 */
export const CRITERIA_APPLY_CONTRACT = {
  description:
    "Alias for SET_FIELDS: Populates criteria form fields and routes to target report if called headlessly ({ criteria }).",
  inputSchema: z.object({
    criteria: z
      .record(z.string(), z.any())
      .describe("Criteria field parameters to populate"),
    report: z.string().optional().describe("Target report scope name"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether criteria were applied"),
    navigatedTo: z.string().optional().describe("Target URL routed to"),
    error: z.string().optional().describe("Error message if failed"),
  }),
  whenToCall:
    "When the user prepares or updates criteria parameters.",
  whenNotToCall:
    "When the user commands to run the report directly.",
} satisfies ActionContract;

/**
 * Action Contract for `criteria_form.actions.SUBMIT`.
 */
export const CRITERIA_SUBMIT_CONTRACT = {
  description:
    "Primary action to submit criteria and execute the report job ({ criteria?, report? }).",
  inputSchema: z.object({
    criteria: z
      .record(z.string(), z.any())
      .optional()
      .describe("Optional inline criteria to populate immediately before execution"),
    report: z
      .string()
      .optional()
      .describe("Target report scope name (defaults to active screen report)"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether job was queued or executed successfully"),
    jobId: z.string().optional().describe("GUID of the newly created report execution"),
    queued: z.boolean().optional().describe("Whether execution was queued in the background"),
    navigateTo: z.string().optional().describe("Target URL to view execution results"),
    error: z.string().optional().describe("Error message if execution failed"),
  }),
  whenToCall:
    "When the user explicitly asks to run, start, fetch, or execute the report.",
  whenNotToCall:
    "When required fields are missing or user is only drafting parameters.",
} satisfies ActionContract;

/**
 * Action Contract for `criteria_form.actions.RUN` (Alias for SUBMIT).
 */
export const CRITERIA_RUN_CONTRACT = {
  description:
    "Alias for SUBMIT: Submits criteria and executes the report ({ criteria?, report? }).",
  inputSchema: z.object({
    criteria: z
      .record(z.string(), z.any())
      .optional()
      .describe("Optional inline criteria to populate immediately before execution"),
    report: z
      .string()
      .optional()
      .describe("Target report scope name (defaults to active screen report)"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether job was submitted"),
    jobId: z.string().optional().describe("GUID of the created report job"),
    navigatedTo: z.string().optional().describe("Target URL to view report results"),
    error: z.string().optional().describe("Error message if failed"),
  }),
  whenToCall:
    "When the user explicitly asks to run, start, fetch, or execute the report.",
  whenNotToCall:
    "When required fields are missing or user is only drafting parameters.",
} satisfies ActionContract;

/**
 * Action Contract for `criteria_form.actions.VALIDATE`.
 */
export const CRITERIA_VALIDATE_CONTRACT = {
  description:
    "Validates criteria parameters against schema rules ({ criteria }).",
  inputSchema: z.object({
    criteria: z
      .record(z.string(), z.any())
      .describe("Criteria values to validate against schema rules"),
    report: z.string().optional().describe("Target report scope name"),
  }),
  outputSchema: z.object({
    valid: z.boolean().describe("Whether criteria satisfy schema requirements"),
    errors: z.array(z.string()).optional().describe("List of validation violation messages"),
    error: z.string().optional().describe("General error if validation failed to run"),
  }),
  whenToCall:
    "When checking whether parameters satisfy schema constraints before submission.",
  whenNotToCall:
    "When the user directly commands execution.",
} satisfies ActionContract;

/**
 * Action Contract for `criteria_form.actions.READ`.
 */
export const CRITERIA_READ_CONTRACT = {
  description:
    "Reads current draft criteria values from the active form.",
  inputSchema: z.object({
    report: z.string().optional().describe("Optional target report scope name"),
  }),
  outputSchema: z.object({
    criteria: z.record(z.string(), z.any()).describe("Current draft criteria values"),
    status: z.string().optional(),
    error: z.string().optional(),
  }),
  whenToCall:
    "To inspect current form state or merge with new values.",
  whenNotToCall:
    "When assigning or overwriting new values (use SET_FIELDS).",
} satisfies ActionContract;

/**
 * Action Contract for `criteria_form.actions.SCHEMA`.
 */
export const CRITERIA_SCHEMA_CONTRACT = {
  description:
    "Inspects report criteria schema and accepted parameter definitions.",
  inputSchema: z.object({
    report: z.string().optional().describe("Target report scope to query schema for"),
  }),
  outputSchema: z.object({
    status: z.string(),
    report: z
      .object({
        scope: z.string(),
        title: z.string(),
        pagePath: z.string(),
        mode: z.string().optional(),
        isViewingResults: z.boolean().optional(),
      })
      .optional()
      .describe("Report identity and display mode"),
    criteria: z
      .array(
        z.object({
          name: z.string(),
          title: z.string().optional(),
          type: z.string().optional(),
          required: z.boolean().optional(),
          options: z.array(z.string()).optional(),
          description: z.string().optional(),
          dateBehavior: z.string().optional(),
        }),
      )
      .optional()
      .describe("Accepted criteria parameter fields"),
    schema: z.any().optional().describe("Full JSON schema definition"),
    properties: z.record(z.string(), z.any()).optional().describe("Accepted schema properties"),
    error: z.string().optional(),
  }),
  whenToCall:
    "To discover parameter names, data types, and accepted formats.",
  whenNotToCall:
    "When the criteria schema is already known.",
} satisfies ActionContract;

export type CriteriaFormAction =
  | "SET_FIELDS"
  | "APPLY"
  | "SUBMIT"
  | "RUN"
  | "VALIDATE"
  | "READ"
  | "SCHEMA";
