import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import {
  reportToolContextSchema,
  toolContextOf,
  activeReportLine,
} from "./tool-context";
import {
  reportSchemaTool,
  askUserQuestionTool,
  suggestNextStepsTool,
  runUserSkillTool,
  runSkillScriptTool,
  readSkillFileTool,
  readUserFileTool,
} from "./shared-tools";

/**
 * STATİK istemci-yürütülebilir araç seti — kriter evresi (workspace fazı).
 * Tanımlar `yula-server-tools.ts` ile birebirdir.
 */

/** STATİK istemci-yürütülebilir araç seti (tipli parça üretir). */
export const STATIC_TOOLS = {
    get_report_schema: reportSchemaTool,
    run_job: tool({
      contextSchema: reportToolContextSchema,
      description: ({ context }) => {
        const ctx = toolContextOf({ context });
        const required =
          ctx.reportScope && ctx.requiredFields.length > 0
            ? ` Required criteria for '${ctx.reportScope}': ${ctx.requiredFields.join(", ")}.`
            : "";
        return [
          `EXECUTE a report: start a backend job and select the new job as running on the execution screen. ${activeReportLine(ctx)}`,
          ctx.availableReports ? `Available reports: ${ctx.availableReports}.` : undefined,
          "Call ONLY on an explicit run request: 'run the report', 'run', 'execute', 'start the job' (e.g. 'run for last week').",
          "Bare slots such as 'prepare', 'show', 'fetch' or a lone date/status ('last week' / 'yesterday') are NOT enough — do NOT call this tool; offer suggestions or wait for approval for apply_criteria.",
          "For existing-report checks ('prepare', 'any existing', 'same criteria') do NOT call this tool — use 'find_matching_report'.",
          "For VIEWING an existing job/results (e.g. 'open the last report', 'latest results', 'most recent job') do NOT call this tool — use 'open_last_report'.",
          `Use only for new report executions; never for filtering the open table. Always pass 'report' explicitly (REQUIRED, never omit).${required}`,
        ]
          .filter(Boolean)
          .join(" ");
      },
      inputSchema: z.object({
        report: z.enum(REGISTERED_REPORTS.map((r) => r.scope) as [string, ...string[]]).describe("Report scope (REQUIRED — always pass explicitly)"),
        criteria: z.record(z.string(), z.unknown()).default({}).describe("Report criteria (e.g. kayitTarihi, durum)"),
        presetTitle: z.string().optional().describe("Executed suggestion / preset title"),
      }),
      // İstemci yürütür; çıktı tipi SDK zincirine buradan akar.
      outputSchema: z.discriminatedUnion("status", [
        z.object({
          status: z.literal("executed"),
          jobId: z.string(),
          jobStatus: z.string(),
          navigateTo: z.string(),
          presetTitle: z.string().optional(),
          message: z.string().optional(),
        }),
        z.object({
          status: z.literal("validation-error"),
          errors: z.array(z.string()),
          hint: z.string().optional(),
        }),
        z.object({
          status: z.literal("blocked"),
          reason: z.literal("incomplete-intent"),
          hint: z.string(),
          message: z.string().optional(),
        }),
        z.object({ status: z.literal("error"), error: z.string() }),
      ]),
    }),
    apply_criteria: tool({
      contextSchema: reportToolContextSchema,
      description: ({ context }) => {
        const ctx = toolContextOf({ context });
        const required =
          ctx.reportScope && ctx.requiredFields.length > 0
            ? ` Required fields for '${ctx.reportScope}': ${ctx.requiredFields.join(", ")}.`
            : "";
        return [
          "Apply the requested or suggested criteria (date ranges, filters, status, etc.) to the criteria form on the active screen; does NOT start a job.",
          "Call when the user wants to fill, edit, update, or adjust criteria (e.g. 'update criteria to last week', 'fill the form', 'set the date', 'apply suggestion 1', 'set yesterday').",
          `Always pass 'report' explicitly (REQUIRED, never omit) with the COMPLETE criteria set including all required schema fields: first read the live draft via 'get_current_criteria', preserve values the user already set, then apply the merged object. Never send a partial object that drops required fields. ${activeReportLine(ctx)}${required}`,
          "Do NOT call on bare values with no action verb (user typed only 'last week' or 'yesterday' alone); offer suggestion chips instead.",
          "The form is filled and highlighted on screen; the user can then run the report with the 'Run' button.",
        ].join(" ");
      },
      inputSchema: z.object({
        report: z.string().describe("Report scope (REQUIRED — always pass explicitly)"),
        criteria: z.record(z.string(), z.unknown()).describe("Criteria to fill into the form"),
        presetTitle: z.string().optional().describe("Applied suggestion title"),
      }),
      outputSchema: z.object({
        status: z.string(),
        updatedKeys: z.array(z.string()).optional(),
        missingRequired: z.array(z.string()).optional(),
        navigateTo: z.string().optional(),
        message: z.string().optional(),
        reason: z.string().optional(),
        hint: z.string().optional(),
      }),
    }),
    request_user_confirmation: tool({
      description: [
        "Ask the user for HUMAN APPROVAL (human-in-the-loop) before critical, high-cost, or data-changing operations.",
        "Call when the user asks for bulk updates, deletions, heavy queries, discount operations, stock adjustments, or the operation requires approval.",
        "Opens an interactive [Approve] / [Cancel] card. The operation does not execute until the user responds.",
        "If a previous call returned confirmed:false, do NOT call this tool again for the same operation.",
      ].join(" "),
      inputSchema: z.object({
        title: z.string().describe("Short card title (e.g. 'Bulk Discount Operation')"),
        message: z.string().describe("Detailed description of the operation and impact summary"),
        actionType: z.enum(["mutation", "heavy_query", "bulk_update", "general"]).default("general").describe("Operation severity and risk type"),
        details: z.record(z.string(), z.unknown()).optional().describe("Operation-specific detail parameters"),
      }),
      outputSchema: z.object({
        confirmed: z.boolean(),
        message: z.string(),
        userNote: z.string().optional(),
      }),
    }),
    ask_user_question: askUserQuestionTool,
    suggest_next_steps: suggestNextStepsTool,
    run_user_skill: runUserSkillTool,
    run_skill_script: runSkillScriptTool,
    read_skill_file: readSkillFileTool,
    read_user_file: readUserFileTool,
    navigate_to_page: tool({
      description: [
        "Navigate to a page, workspace, or report inside the app (in-app client navigation).",
        "Call when the user asks to open or go to a screen ('open the ... screen', 'go to ...', 'take me to the ... report') or requests a report/page outside the active screen.",
        "Available standard routes: '/stock/stock-balance' (stock balance report), '/stock/stock-analytics' (stock analytics report), '/stock' (stock module), '/accounting', '/selling', '/manufacturing'.",
      ].join(" "),
      inputSchema: z.object({
        path: z.string().describe("Target page path (e.g. '/stock/stock-balance', '/stock', '/accounting')"),
        title: z.string().optional().describe("Target page or report name"),
        reason: z.string().optional().describe("Navigation reason"),
      }),
      outputSchema: z.object({
        status: z.enum(["navigated", "already_on_page", "error"]),
        navigateTo: z.string().optional(),
        message: z.string(),
      }),
    }),
    open_last_report: tool({
      contextSchema: reportToolContextSchema,
      description: ({ context }) => {
        const ctx = toolContextOf({ context });
        return [
          "Open the user's MOST RECENT report job WITHOUT re-running it: locate the stored job and navigate to its result table.",
          "Call for requests like 'open the last report', 'show the latest report', 'last results', 'most recent job', 'previous report'.",
          `This tool never starts a new job — it navigates to an existing job's result screen. ${activeReportLine(ctx)} Use run_job for new executions.`,
        ].join(" ");
      },
      inputSchema: z.object({
        report: z.string().optional().describe("Report scope (e.g. stock-balance); selects the latest job when omitted"),
      }),
      outputSchema: z.discriminatedUnion("status", [
        z.object({
          status: z.literal("navigated"),
          jobId: z.string(),
          navigateTo: z.string(),
          message: z.string(),
        }),
        z.object({
          status: z.literal("not_found"),
          message: z.string(),
        }),
        z.object({ status: z.literal("error"), error: z.string() }),
      ]),
    }),
    validate_criteria_input: tool({
      description: [
        "Validate user-provided or form criteria against the schema and D365/BC rules (Criteria Input Engine).",
        "Checks date and number ranges ('..', '10..20', '2026-01-01..2026-08-31'), relative dates ('yesterday', 'today', 'last week'),",
        "options (enum) and required fields. Returns errors, warnings, and suggestions.",
        "Call when the user provides criteria, asks to validate them ('is this valid?', 'is this criteria correct?'), or before execution for verification.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().describe("Report scope (REQUIRED — always pass explicitly)"),
        criteria: z.record(z.string(), z.unknown()).default({}).describe("Criteria to validate"),
        partial: z.boolean().default(false).describe("Check only provided fields (do not treat missing required fields as errors)"),
      }),
      outputSchema: z.object({
        valid: z.boolean(),
        scope: z.string(),
        reportTitle: z.string(),
        summary: z.string(),
        sanitizedCriteria: z.record(z.string(), z.unknown()).optional(),
        errors: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            received: z.unknown().optional(),
          }),
        ),
        warnings: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            suggestion: z.string().optional(),
          }),
        ),
      }),
    }),
    get_current_criteria: tool({
      description: [
        "Read the live criteria form draft (current draft criteria) of the active report and return its validation state.",
        "Call when the user asks about the live form ('what is in the form?', 'current draft criteria?', 'is the current form valid?').",
        "Report the form's current values, missing required fields, and format errors.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().describe("Report scope (REQUIRED — always pass explicitly)"),
      }),
      outputSchema: z.object({
        status: z.string(),
        scope: z.string(),
        reportTitle: z.string(),
        valid: z.boolean(),
        summary: z.string(),
        instance: z.record(z.string(), z.unknown()),
        errors: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            received: z.unknown().optional(),
          }),
        ),
        warnings: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            suggestion: z.string().optional(),
          }),
        ),
      }),
    }),
    list_report_executions: tool({
      description: [
        "List past and running jobs (job execution history) of the active or specified report.",
        "Call when the user asks for past executions ('previous runs', 'running jobs', 'job list', 'which reports ran').",
        "Does not compare criteria; use 'find_matching_report' to check for an existing report with the same criteria.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().describe("Report scope (REQUIRED — always pass explicitly)"),
        limit: z.number().default(10).describe("Maximum number of jobs to list"),
      }),
      outputSchema: z.object({
        status: z.string(),
        executions: z.array(
          z.object({
            jobId: z.string(),
            status: z.string(),
            createdAt: z.string().optional(),
            rowCount: z.number().optional(),
            href: z.string().optional(),
          }),
        ),
        message: z.string().optional(),
      }),
    }),
    find_matching_report: tool({
      contextSchema: reportToolContextSchema,
      description: ({ context }) => {
        const ctx = toolContextOf({ context });
        const required =
          ctx.reportScope && ctx.requiredFields.length > 0
            ? ` Required fields for '${ctx.reportScope}': ${ctx.requiredFields.join(", ")}.`
            : "";
        return [
          "Check whether a completed or running job with the SAME normalized criteria already exists; never starts a job.",
          "Call FIRST on prepare-type requests ('prepare the report', check existing, same criteria) — before filling any form or asking the user. Merge user-provided values with the live draft from 'get_current_criteria' so required fields are complete.",
          "If matched and completed, open it via returned navigateTo. If no match, fill the form via 'apply_criteria' and ask for confirmation before run_job.",
          `Always pass 'report' explicitly (REQUIRED, never omit). Use 'open_last_report' for latest job regardless of criteria, 'run_job' only for explicit new runs. ${activeReportLine(ctx)}${required}`,
        ].join(" ");
      },
      inputSchema: z.object({
        report: z.string().describe("Report scope (REQUIRED — always pass explicitly)"),
        criteria: z
          .record(z.string(), z.unknown())
          .default({})
          .describe("Criteria to check (schema keys)"),
      }),
      outputSchema: z.discriminatedUnion("status", [
        z.object({
          status: z.literal("matched"),
          jobId: z.string(),
          jobStatus: z.string(),
          navigateTo: z.string(),
          message: z.string().optional(),
        }),
        z.object({
          status: z.literal("running"),
          jobId: z.string(),
          jobStatus: z.string(),
          navigateTo: z.string().optional(),
          message: z.string().optional(),
        }),
        z.object({
          status: z.literal("no_match"),
          suggestedCriteria: z.record(z.string(), z.unknown()).optional(),
          hint: z.string().optional(),
          message: z.string().optional(),
        }),
        z.object({
          status: z.literal("needs_criteria"),
          missing: z.array(z.string()).optional(),
          hint: z.string().optional(),
          message: z.string().optional(),
        }),
        z.object({ status: z.literal("error"), error: z.string() }),
      ]),
    }),
    cancel_job: tool({
      description: [
        "Cancel a running backend report job.",
        "Call when the user asks to stop a job ('stop the job', 'cancel', 'cancel the report').",
      ].join(" "),
      inputSchema: z.object({
        jobId: z.string().describe("GUID of the job to cancel"),
        report: z.string().optional().describe("Report scope"),
      }),
      outputSchema: z.object({
        status: z.string(),
        jobId: z.string(),
        message: z.string(),
      }),
    }),
  } satisfies ToolSet;

export type YulaStaticTools = typeof STATIC_TOOLS;
