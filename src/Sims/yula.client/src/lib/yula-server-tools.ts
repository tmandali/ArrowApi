import {
  dynamicTool,
  jsonSchema,
  tool,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import { looksLikeIdentifierValues } from "@/lib/grid-column-values";

export interface YulaGridToolContext {
  tableName: string;
  columns: string[];
  rowCount?: number | null;
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/şemasından; LLM şema grounding'i */
  columnTypes?: Record<string, string>;
  /** Düşük kardinaliteli kolon değerleri — benzersiz kimlik kolonlarını ayıklamak için */
  columnValues?: Record<string, string[]>;
}

/**
 * Tam SDK uyumu (cookbook: call-tools):
 *  - Statik araçlar **zod** ile tanımlanır → `tool-<ad>` tipli UI parçaları
 *    ve `InferUITools` üzerinden uçtan uca tip güvenliği.
 *  - Çalışma anı kolon enum'ı gerektiren grid araçları resmi `dynamicTool()`
 *    ile bildirilir → `dynamic-tool` parçaları.
 *  - execute YOKTUR: yürütme tarayıcıdadır (DuckDB/OPFS istemcide yaşar);
 *    çıktı `addToolOutput` ile geri verilir, `sendAutomaticallyWhen` akışı sürer.
 */

/**
 * get_report_schema — aktif raporun JSON şemasını (kriter alanları, tipler,
 * seçenekler, kolon tanımları) döndürür. Yürütme istemcidedir (yula-client-tools).
 */
const reportSchemaTool = tool({
  description: [
    "Return the active report's JSON schema: criteria fields (name, type, required, options),",
    "column definitions (owner descriptions) and report metadata.",
    "Call when the user asks about schema, available criteria, report definition, or column meanings.",
    "Summarize the output as a markdown table; use criteria field names verbatim in run_job criteria.",
  ].join(" "),
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.string(),
    report: z
      .object({
        scope: z.string(),
        title: z.string(),
        pagePath: z.string().optional(),
        mode: z.string().optional(),
        isViewingResults: z.boolean().optional(),
      })
      .optional(),
    activeGrid: z
      .object({
        tableName: z.string().optional(),
        title: z.string().optional(),
        columns: z.array(z.string()).optional(),
        rowCount: z.number().nullable().optional(),
        columnTypes: z.record(z.string(), z.string()).optional(),
        sampleRows: z.array(z.record(z.string(), z.unknown())).optional(),
        columnValues: z.record(z.string(), z.array(z.string())).optional(),
      })
      .optional(),
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
      .optional(),
    columnDescriptions: z.record(z.string(), z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    directive: z.string().optional(),
    error: z.string().optional(),
    hint: z.string().optional(),
  }),
})

/** Per-request tool context (SDK: description functions + toolsContext).
 *  Resolved in the chat route from the active screen/report scope. */
export const reportToolContextSchema = z.object({
  reportScope: z.string(),
  reportTitle: z.string(),
  requiredFields: z.array(z.string()),
  availableReports: z.string(),
});

export type ReportToolContext = z.infer<typeof reportToolContextSchema>;

const FALLBACK_TOOL_CONTEXT: ReportToolContext = {
  reportScope: "stock-balance",
  reportTitle: "report",
  requiredFields: [],
  availableReports: "",
};

function toolContextOf(options?: {
  context?: ReportToolContext | unknown;
}): ReportToolContext {
  const c = options?.context as Partial<ReportToolContext> | undefined;
  return {
    reportScope:
      typeof c?.reportScope === "string" && c.reportScope
        ? c.reportScope
        : FALLBACK_TOOL_CONTEXT.reportScope,
    reportTitle:
      typeof c?.reportTitle === "string" && c.reportTitle
        ? c.reportTitle
        : FALLBACK_TOOL_CONTEXT.reportTitle,
    requiredFields: Array.isArray(c?.requiredFields)
      ? (c.requiredFields as string[])
      : [],
    availableReports:
      typeof c?.availableReports === "string" ? c.availableReports : "",
  };
}

/**
 * ask_user_question — human-in-the-loop structured questions with options.
 * Client executes headlessly (yula-client-tools); the question card renders
 * in the chat turn (YulaQuestionnaireCard). Answers arrive as a new user
 * message. Shared between STATIC_TOOLS and grid tools so questions can be
 * asked in both criteria and results phases.
 */
const askUserQuestionTool = tool({
  description: [
    "Ask the user STRUCTURED QUESTIONS with options (human-in-the-loop) when information is missing or ambiguous.",
    "Call when criteria are incomplete, the intent is ambiguous, or there is a fork in the road (e.g. missing required fields, unclear date range, which follow-up analysis to run).",
    "Ask at most 3 questions per call; every question always offers a freeform answer field.",
    "If the user skips a required question, continue with its defaultValue — never ask the same question again.",
    "For single destructive-operation approvals use 'request_user_confirmation' instead.",
    "The user's answers arrive as a new user message; read them and continue the task.",
  ].join(" "),
  inputSchema: z.object({
    questions: z
      .array(
        z.object({
          id: z.string().describe("Stable question id (e.g. 'dateRange')"),
          prompt: z.string().describe("Question text in the user's language"),
          description: z.string().optional().describe("Optional helper text"),
          required: z.boolean().default(false),
          multiple: z.boolean().default(false).describe("Allow selecting more than one choice"),
          defaultValue: z.string().optional().describe("Value to continue with when the user skips this question"),
          choices: z
            .array(
              z.object({
                value: z.string(),
                label: z.string(),
                description: z.string().optional(),
              }),
            )
            .min(1)
            .describe("Fixed answer options"),
        }),
      )
      .min(1)
      .max(3)
      .describe("At most 3 questions per call"),
  }),
  outputSchema: z.object({
    status: z.literal("awaiting_user"),
    message: z.string(),
  }),
});

/**
 * run_user_skill — kullanıcının cihaz-içi skill'ini çalıştırır (cookbook:
 * agent-skills progressive disclosure). Envanter (isim/açıklama) sistem
 * prompt'undadır; tam talimat istemcide yüklenir ve çıktı olarak döner —
 * model talimatları araçlarıyla uygulamaya devam eder (terminal değildir).
 * STATIC_TOOLS ve grid araçlarında paylaşılır (ask_user_question deseni).
 */
const runUserSkillTool = tool({
  description: [
    "Run a USER-DEFINED on-device skill (slash command created by this user).",
    "Call when the user's request matches one of the USER SKILLS listed in the system prompt, or when they reference a skill by /name.",
    "The tool returns the skill's full instructions — follow them with your tools in the following steps.",
    "If the output lists attached files, read them with 'read_user_file' when the instructions reference them.",
    "Never invent skill names; use only the listed inventory.",
  ].join(" "),
  inputSchema: z.object({
    skill: z.string().describe("Skill slash name without '/' (e.g. 'haftalik-ozet')"),
    input: z.string().optional().describe("User's extra input appended to the skill prompt"),
  }),
  outputSchema: z.object({
    status: z.enum(["loaded", "not-found"]),
    skill: z.string().optional(),
    prompt: z.string().optional(),
    files: z
      .array(z.object({ name: z.string(), chars: z.number() }))
      .optional()
      .describe("Attached reference files (load via read_user_file)"),
    message: z.string(),
  }),
});

/**
 * run_skill_script — yerleşik SKILL BETİĞİNİ sunucu sandbox'ında koşturur.
 * İstemci araçlarından FARKLIDIR: `execute` sunucudadır (SDK çok-adımlı
 * döngüde otomatik koşar); istemci yürütme döngüsü SERVER_EXECUTED_TOOLS
 * ile dokunmaz. Betikler skills/<ad>/scripts/*.mjs altındadır, shell'siz
 * node ile koşar, tek satır JSON basar.
 */
const runSkillScriptTool = tool({
  description: [
    "Run a built-in SKILL SCRIPT (.mjs) inside the server sandbox for deterministic computations the model must not hand-calculate.",
    "Available scripts: 'ay-kapanis/scripts/month-range.mjs' converts month/week expressions to exact ISO date ranges (input args JSON: {month: 'YYYY-MM'} or {relative: 'last-month'|'this-month'|'last-week'|'this-week', today?: 'YYYY-MM-DD'}; returns {start, end, range, label}).",
    "Use the returned start..end range directly in criteria or SQL. Never invent script paths; use only the listed inventory.",
  ].join(" "),
  inputSchema: z.object({
    script: z
      .string()
      .describe(
        "Skill script path under skills/ (e.g. 'ay-kapanis/scripts/month-range.mjs')",
      ),
    args: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Arguments passed to the script as a single JSON object"),
  }),
  outputSchema: z.object({
    status: z.enum(["ok", "error"]),
    script: z.string().optional(),
    data: z.unknown().optional(),
    message: z.string(),
  }),
  execute: async ({ script, args }) => {
    const { createNodeSandbox } = await import("@/lib/skill-sandbox");
    const { default: path } = await import("node:path");
    const sandbox = createNodeSandbox(
      process.env.YULA_SKILLS_DIR ?? path.join(process.cwd(), "skills"),
    );
    try {
      const { stdout } = await sandbox.exec({
        script,
        args: [JSON.stringify(args ?? {})],
      });
      const data: unknown = JSON.parse(stdout);
      if (
        data &&
        typeof data === "object" &&
        (data as { status?: unknown }).status === "error"
      ) {
        return {
          status: "error" as const,
          script,
          message: String(
            (data as { message?: unknown }).message ?? "Betik hata döndürdü.",
          ),
        };
      }
      return {
        status: "ok" as const,
        script,
        data,
        message: "Betik tamamlandı.",
      };
    } catch (err) {
      return {
        status: "error" as const,
        script,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * read_skill_file — skill paketli REFERANS dosyasını sunucu sandbox'ından
 * okur (cookbook: agent-skills "Accessing Bundled Resources"). Uzun
 * playbook/dokümanlar skill gövdesine değil references/ altına konur;
 * model yalnızca gerektiğinde çeker (bağlam ekonomisi). run_skill_script
 * gibi server-executed'dır (istemci döngüsü dokunmaz), terminal değildir.
 */
const SKILL_READ_EXTENSIONS = new Set([".md", ".txt", ".json"]);
const SKILL_READ_MAX_CHARS = 64_000;

const readSkillFileTool = tool({
  description: [
    "Read a bundled SKILL REFERENCE file (long playbooks, checklists, SQL patterns shipped under skills/<skill>/references/).",
    "Call when a skill body points at a references file, or when you need detailed domain rules that don't fit the turn budget.",
    "Only .md/.txt/.json under skills/; paths outside the skills directory are rejected. Long files are truncated.",
  ].join(" "),
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "Reference path under skills/ (e.g. 'ay-kapanis/references/kapanis-kontrol-listesi.md')",
      ),
  }),
  outputSchema: z.object({
    status: z.enum(["ok", "error"]),
    path: z.string().optional(),
    content: z.string().optional(),
    truncated: z.boolean().optional(),
    message: z.string(),
  }),
  execute: async ({ path: relPath }) => {
    const { createNodeSandbox } = await import("@/lib/skill-sandbox");
    const { default: nodePath } = await import("node:path");
    const fail = (message: string) => ({
      status: "error" as const,
      path: relPath,
      message,
    });
    const ext = nodePath.extname(relPath).toLowerCase();
    if (!SKILL_READ_EXTENSIONS.has(ext)) {
      return fail(
        `Yalnızca ${[...SKILL_READ_EXTENSIONS].join(", ")} okunur.`,
      );
    }
    const sandbox = createNodeSandbox(
      process.env.YULA_SKILLS_DIR ?? nodePath.join(process.cwd(), "skills"),
    );
    try {
      const content = await sandbox.readFile(relPath, "utf-8");
      const truncated = content.length > SKILL_READ_MAX_CHARS;
      return {
        status: "ok" as const,
        path: relPath,
        content: truncated
          ? content.slice(0, SKILL_READ_MAX_CHARS)
          : content,
        truncated,
        message: truncated
          ? "Dosya 64K karakterde kesildi."
          : "Dosya okundu.",
      };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

/**
 * read_user_file — kullanıcı skill'ine ekli REFERANS dosyayı okur
 * (read_skill_file'ın cihaz-içi karşılığı). Betik YOKTUR: kullanıcı
 * skill'leri yalnızca doküman taşır. İstemcide yürütülür (localStorage),
 * terminal değildir.
 */
const readUserFileTool = tool({
  description: [
    "Read a USER SKILL reference file (long docs attached to an on-device skill).",
    "Call when a loaded skill lists attached files, or when skill instructions reference a document.",
    "User skills never contain scripts — only .md/.txt/.json references.",
  ].join(" "),
  inputSchema: z.object({
    skill: z.string().describe("Skill slash name without '/'"),
    file: z.string().describe("File name as listed in the skill load output"),
  }),
  outputSchema: z.object({
    status: z.enum(["ok", "not-found"]),
    skill: z.string().optional(),
    file: z.string().optional(),
    content: z.string().optional(),
    message: z.string(),
  }),
});

/** STATİK istemci-yürütülebilir araç seti (tipli parça üretir). */
export const STATIC_TOOLS = {
    get_report_schema: reportSchemaTool,
    run_job: tool({
      contextSchema: reportToolContextSchema,
      description: ({ context }) => {
        const ctx = toolContextOf({ context });
        const required =
          ctx.requiredFields.length > 0
            ? ` Required criteria for '${ctx.reportScope}': ${ctx.requiredFields.join(", ")}.`
            : "";
        return [
          `EXECUTE a report: start a backend job and select the new job as running on the execution screen. Active report: '${ctx.reportScope}'.`,
          ctx.availableReports ? `Available reports: ${ctx.availableReports}.` : undefined,
          "Call ONLY on an explicit run request: 'run the report', 'run', 'execute', 'start the job' (e.g. 'run for last week').",
          "Bare slots such as 'prepare', 'show', 'fetch' or a lone date/status ('last week' / 'yesterday') are NOT enough — do NOT call this tool; offer suggestions or wait for approval for apply_criteria.",
          "For existing-report checks ('prepare', 'any existing', 'same criteria') do NOT call this tool — use 'find_matching_report'.",
          "For VIEWING an existing job/results (e.g. 'open the last report', 'latest results', 'most recent job') do NOT call this tool — use 'open_last_report'.",
          `Use only for new report executions; never for filtering the open table.${required}`,
        ]
          .filter(Boolean)
          .join(" ");
      },
      inputSchema: z.object({
        report: z.enum(REGISTERED_REPORTS.map((r) => r.scope) as [string, ...string[]]).default("stock-balance").describe("Report scope"),
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
          ctx.requiredFields.length > 0
            ? ` Required fields for '${ctx.reportScope}': ${ctx.requiredFields.join(", ")}.`
            : "";
        return [
          "Apply the requested or suggested criteria (date ranges, filters, status, etc.) to the criteria form on the active screen; does NOT start a job.",
          "Call when the user wants to fill, edit, update, or adjust criteria (e.g. 'update criteria to last week', 'fill the form', 'set the date', 'apply suggestion 1', 'set yesterday').",
          `Always send the COMPLETE criteria set including all required schema fields: first read the live draft via 'get_current_criteria', preserve values the user already set, then apply the merged object. Never send a partial object that drops required fields.${required}`,
          "Do NOT call on bare values with no action verb (user typed only 'last week' or 'yesterday' alone); offer suggestion chips instead.",
          "The form is filled and highlighted on screen; the user can then run the report with the 'Run' button.",
        ].join(" ");
      },
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Report scope (e.g. stock-balance)"),
        criteria: z.record(z.string(), z.unknown()).describe("Criteria to fill into the form"),
        presetTitle: z.string().optional().describe("Applied suggestion title"),
      }),
      outputSchema: z.object({
        status: z.string(),
        updatedKeys: z.array(z.string()).optional(),
        missingRequired: z.array(z.string()).optional(),
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
          `This tool never starts a new job — it navigates to an existing job's result screen (active report: '${ctx.reportScope}'). Use run_job for new executions.`,
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
        "Checks date and number ranges ('..', '10..20', '2026-01-01..2026-08-31'), relative dates ('dün', 'bugün', 'geçen hafta'),",
        "options (enum) and required fields. Returns errors, warnings, and suggestions.",
        "Call when the user provides criteria, asks to validate them ('is this valid?', 'is this criteria correct?'), or before execution for verification.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Report scope (e.g. stock-balance)"),
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
        "Call when the user asks about the live form ('what is in the form?', 'current criteria?', 'is the current form valid?').",
        "Report the form's current values, missing required fields, and format errors.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Report scope (e.g. stock-balance)"),
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
        report: z.string().default("stock-balance").describe("Report scope (e.g. stock-balance)"),
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
          ctx.requiredFields.length > 0
            ? ` Required fields for '${ctx.reportScope}': ${ctx.requiredFields.join(", ")}.`
            : "";
        return [
          "Check whether a completed or running job with the SAME normalized criteria already exists; never starts a job.",
          "Call FIRST on prepare-type requests ('prepare the report', check existing, same criteria) — before filling any form or asking the user. Merge user-provided values with the live draft from 'get_current_criteria' so required fields are complete.",
          "If matched and completed, open it via returned navigateTo. If no match, fill the form via 'apply_criteria' and ask for confirmation before run_job.",
          `Use 'open_last_report' for latest job regardless of criteria, 'run_job' only for explicit new runs.${required}`,
        ].join(" ");
      },
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Report scope (e.g. stock-balance)"),
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

/** Grid bağlamına göre koşullu dinamik araçlar (runtime kolon enum'ları). */
function gridTools(grid: YulaGridToolContext): ToolSet {
  const cols = [...grid.columns];
  const numericCols = cols.filter(
    (c) => grid.columnTypes?.[c] === "number",
  );
  const measureHint = cols.filter((c) =>
    /quantity|balance|price|amount|total|count|qty|tutar|miktar|bakiye/i.test(c),
  );
  // Şema doğrusu (columnTypes) regex ipucunu ezer; ikisi de yoksa tüm kolonlar.
  const measureCols =
    numericCols.length > 0
      ? numericCols
      : measureHint.length > 0
        ? measureHint
        : cols;
  const categoryCols = cols.filter(
    (c) =>
      (grid.columnTypes?.[c] === "text" || grid.columnTypes?.[c] === "bool") &&
      // Id gibi benzersiz kimlik kolonları kategori olamaz (ilk değerleri düz sayı)
      !looksLikeIdentifierValues(grid.columnValues?.[c]),
  );

  return {
    get_report_schema: reportSchemaTool,
    ask_user_question: askUserQuestionTool,
    run_user_skill: runUserSkillTool,
    run_skill_script: runSkillScriptTool,
    read_skill_file: readSkillFileTool,
    read_user_file: readUserFileTool,
    analyze_grid_data: dynamicTool({
      description: [
        "Açık veri kümesinde analizi çalıştırır (KPI/toplam/grup).",
        "Sayı/sayaç/toplam sorularında ÇAĞIR. top için byColumn (kategori kolonu) ver; verilmezse sistem en uygun kategori kolonunu seçer (benzersiz kimlikler hariç).",
        "Kolon listesi ve tipleri sistem bağlamındadır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        operation: "count" | "sum" | "avg" | "min" | "max" | "top";
        column?: string;
        byColumn?: string;
        topN?: number;
      }>({
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["count", "sum", "avg", "min", "max", "top"],
            description:
              "top: byColumn'a göre column toplamının en yüksek N grubu",
          },
          column: {
            type: "string",
            enum: cols,
            description: "Analiz edilecek ölçü kolonu (count için gerekmez)",
          },
          byColumn: {
            type: "string",
            enum: cols,
            description: "top işlemi için grup kolonu",
          },
          topN: {
            type: "number",
            description: "top için grup sayısı (varsayılan 5, en fazla 10)",
          },
        },
        required: ["operation"],
      }),
    }),
    profile_grid_table: dynamicTool({
      description: [
        "Açık tabloyu PROFİLLER: satır sayısı, kolon tipleri, null, kardinalite, min/max/avg/sum, en sık değerler.",
        "'analiz et/profille/anomali/veri kalitesi' isteklerinde ÖNCE bunu çağır; bulguları run_expert_sql ile doğrula. Sayı/toplam için analyze_grid_data yeter.",
      ].join(" "),
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
    }),
    run_expert_sql: dynamicTool({
      description: [
        "SQL uzmanının yazdığı TEK salt-okunur SELECT'i çalıştırır; ilk 10 satırı MODELE döner (grid DEĞİŞTİRMEZ).",
        "KAPSAM: yalnız gridin ifade EDEMEYECEĞİ sorgular — aggregate, karşılaştırmalı kolonlar (Qty > UnitPrice), oran/hesap, window.",
        "DUCKDB VIEW: Ekrandaki süzülmüş/aktif görünümü sorgulamak için 'FROM active_view', ham tablonun tümünü sorgulamak için aktif tablo adını kullanabilirsiniz.",
        "Basit kolon filtreleri (değer/aralık/boş-dolu) için BU ARACI KULLANMA — filter_current_grid ile filtrele; aksi halde grid hücreleri ve tablo senkron dışı kalır.",
        "display: 'silent' = keşif/doğrulama sorgusu, ekrana tablo basılmaz (varsayılan keşiflerde BUNU kullan) · 'card' = kullanıcıdan 'göster/show' istenirse tablo kartı basılır.",
        "Sonuç satırları card modunda ekranda otomatik tablo olur; satırları metinde TEKRAR yazma — yalnız bulgu/yorum yaz.",
        "Guard hatası dönerse hint'i oku, sorguyu düzelt ve en fazla 2 kez yeniden dene.",
      ].join(" "),
      inputSchema: jsonSchema<{ sql: string; display?: "card" | "silent" }>({
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "Salt-okunur tek SELECT sorgusu (aktif süzülmüş liste için 'active_view', tüm ham veri için tablo adı)",
          },
          display: {
            type: "string",
            enum: ["card", "silent"],
            description:
              "silent: keşif/doğrulama sorgusu — ekrana tablo çizilmez · card: kullanıcıdan 'göster' istendiyse tablo kartı basılır",
          },
        },
        required: ["sql"],
      }),
    }),
    set_grid_query: dynamicTool({
      description: [
        "Kullanıcının AÇIK tablosunu yazdığın salt-okunur SELECT'in sonucuyla YENİDEN görüntüler (gruplama/toplam görünümleri).",
        "LIMIT ASLA YAZMA; aggregate kolonlara AS ile okunur takı adı ver; sorgu tabloya FROM/JOIN ile referans vermeli.",
        "TEK ÇAĞRI KURALI: sql ve reset'i BİRLİKTE gönderme — yeni görünüm için yalnız sql; temel görüne dönmek için yalnız {reset:true}.",
      ].join(" "),
      inputSchema: jsonSchema<{
        sql?: string;
        title?: string;
        reset?: boolean;
      }>({
        type: "object",
        properties: {
          sql: {
            type: "string",
            description:
              "Salt-okunur tek SELECT sorgusu (FROM/JOIN ile tablo adı yukarıda)",
          },
          title: {
            type: "string",
            description: "Yeni görünüm için kısa başlık (örn. 'Depo Bazlı Qty Toplamı')",
          },
          reset: {
            type: "boolean",
            description: "true ise özel sorgu kaldırılır ve temel tablo görünümüne dönülür",
          },
        },
      }),
    }),
    visualize_grid_data: dynamicTool({
      description: [
        "Açık tabloyu GRAFİK olarak görselleştirir; 'grafikle göster/pasta çiz/dağılımı göster' isteklerinde ÇAĞIR.",
        "Yalnız BOYUTLARI bildir: veri DuckDB'den hesaplanır, kart otomatik çizilir; satır verisini ASLA metinde yazma.",
        "bar yatay çizilir (kategori adı solda okunur). Id gibi benzersiz kimlik kolonları kategori OLAMAZ. title + takeaway mutlaka doldur.",
        "SIRALAMA: 'ilk N' / 'first N' / 'mağaza sırasında' / 'depo sırasında' → orderMode:'label_asc'. Grid satır sırasındaki ilk N → 'appearance'. 'en yüksek N' / 'top N' / 'en çok' → orderMode:'value_desc' (varsayılan). 'en düşük' → value_asc.",
      ].join(" "),
      inputSchema: jsonSchema<{
        title?: string;
        description?: string;
        takeaway?: string;
        chartType: "bar" | "line" | "pie";
        dimensionX: string;
        dimensionY: string[];
        aggregation?: "sum" | "avg" | "min" | "max" | "count";
        limit?: number;
        orderMode?:
          | "value_desc"
          | "value_asc"
          | "label_asc"
          | "label_desc"
          | "appearance";
      }>({
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Kısa grafik başlığı (örn. 'Depo Bazlı Toplam Miktar')",
          },
          description: {
            type: "string",
            description: "Grafik ne gösteriyor? Önce bunu yaz.",
          },
          takeaway: {
            type: "string",
            description: "Verinin ana çıkarımı/öne çıkan bulgu (tek cümle)",
          },
          chartType: {
            type: "string",
            enum: ["bar", "line", "pie"],
            description:
              "bar = yatay çubuk (uzun kategori adları için ideal) · pie = pay dağılımı · line = trend",
          },
          dimensionX: {
            type: "string",
            enum: categoryCols.length > 0 ? categoryCols : cols,
            description: "Kategori ekseni kolonu (X)",
          },
          dimensionY: {
            type: "array",
            items: {
              type: "string",
              enum: measureCols,
              description: "Sayısal ölçü kolonu",
            },
            minItems: 1,
            description: "Ölçü ekseni kolonları (Y)",
          },
          aggregation: {
            type: "string",
            enum: ["sum", "avg", "min", "max", "count"],
            description: "Ölçü kolonlarına uygulanacak agregasyon (varsayılan sum)",
          },
          limit: {
            type: "number",
            description: "Gösterilecek maksimum grup sayısı. Kullanıcı 'ilk N', 'en yüksek 5', 'top 10' gibi bir sınır belirttiğinde veya sohbet bağlamında N adet istendiyse limit: N parametresini MUTLAKA yaz (varsayılan 30'a bırakma).",
          },
          orderMode: {
            type: "string",
            enum: [
              "value_desc",
              "value_asc",
              "label_asc",
              "label_desc",
              "appearance",
            ],
            description:
              "Dilim/çubuk sırası. 'ilk 5 mağaza' / mağaza sırasında → label_asc. Grid sırası → appearance. 'en yüksek 5' → value_desc. Varsayılan value_desc.",
          },
        },
        required: ["chartType", "dimensionX", "dimensionY"],
      }),
    }),
    filter_current_grid: dynamicTool({
      description: [
        "Kullanıcının açık tablosunu filtreler; grid anında yenilenir.",
        "value'ya D365 ifadesini OLDUĞU GİBİ yaz: '>59' · '100..500' · 'SKU*' · '!A&!B' · 'A|B' · '@abc'.",
        "'boş olanlar' → op:'empty' · 'dolu olanlar' → op:'notEmpty' · value:\"\" yalnız filtre KALDIRIR · tümünü temizlemek için field:\"*\".",
        "eq = BİREBİR eşit (örn. tam kod: BATCH-003) · contains = içeren (kısmi arama) · gt/lt eşik.",
        "eq/contains/gt/lt yalnız basit ayrım; D365 karakterli value verildiğinde yok sayılır.",
        "Filtreler birbirine AND ile eklenir: çok koşullu isteklerde (örn. IsActive=false VE Qty>0) aracı koşul başına bir kez ardışık çağır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        field: string;
        op?: "eq" | "contains" | "gt" | "lt" | "empty" | "notEmpty";
        value: string;
      }>({
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["*", ...cols],
            description: 'Hedef kolon; TÜM filtreleri temizlemek için "*"',
          },
          op: {
            type: "string",
            enum: ["eq", "contains", "gt", "lt", "empty", "notEmpty"],
            description:
              'empty: NULL/boş metin kayıtlar · notEmpty: dolu kayıtlar · varsayılan eq · D365 karakterli value verildiğinde yok sayılır',
          },
          value: { type: "string", description: "D365 filtre ifadesi (raw); boş string \"\" = filtre kaldır" },
        },
        required: ["field", "value"],
      }),
    }),
    set_grid_sort: dynamicTool({
      description: [
        "Kullanıcının açık tablosunu belirtilen kolona göre sıralar (ASC/DESC/none).",
        "DuckDB seviyesinde pencereli ORDER BY çalışır, anında yenilenir.",
        "direction: 'asc' (küçükten büyüğe / A-Z) · 'desc' (büyükten küçüğe / Z-A) · 'none' (sıralamayı kaldır / doğal sıra).",
      ].join(" "),
      inputSchema: jsonSchema<{
        column: string;
        direction: "asc" | "desc" | "none";
      }>({
        type: "object",
        properties: {
          column: {
            type: "string",
            enum: cols,
            description: "Sıralanacak hedef kolon adı.",
          },
          direction: {
            type: "string",
            enum: ["asc", "desc", "none"],
            description: "asc: artan · desc: azalan · none: sıralamayı sıfırla",
          },
        },
        required: ["column", "direction"],
      }),
    }),
    configure_grid_columns: dynamicTool({
      description: [
        "Grid kolonlarının görünürlüğünü, gizliliğini ve sırasını düzenler.",
        "Kullanıcı 'sadece X, Y, Z kolonlarını göster' dediğinde visibleColumns ver (diğerleri gizlenir).",
        "Kullanıcı 'X ve Y kolonlarını gizle' dediğinde hiddenColumns ver.",
        "Kullanıcı kolon sırasını değiştirmek istediğinde order ver.",
      ].join(" "),
      inputSchema: jsonSchema<{
        visibleColumns?: string[];
        hiddenColumns?: string[];
        order?: string[];
      }>({
        type: "object",
        properties: {
          visibleColumns: {
            type: "array",
            items: { type: "string" },
            description: "Yalnızca bu kolonlar görünür kalır, diğer tüm kolonlar gizlenir.",
          },
          hiddenColumns: {
            type: "array",
            items: { type: "string" },
            description: "Gizlenecek kolon adları listesi.",
          },
          order: {
            type: "array",
            items: { type: "string" },
            description: "Kolonların soldan sağa gösterim sırası.",
          },
        },
      }),
    }),
    pin_grid_columns: dynamicTool({
      description: [
        "Grid kolonlarını tablonun soluna sabitler (sticky pinned columns).",
        "Kullanıcı tabloyu sağa kaydırırken bu kolonlar daima görünür kalır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        columns: string[];
      }>({
        type: "object",
        properties: {
          columns: {
            type: "array",
            items: { type: "string" },
            description: "Sola sabitlenecek kolon adları.",
          },
        },
        required: ["columns"],
      }),
    }),
    apply_grid_filters: dynamicTool({
      description: [
        "Grid tablosuna tek seferde birden fazla kolon filtresi uygular.",
        "filters: Kolon adı ve D365 ifadesi eşlemesi (örn: { 'InventLocationId': 'MERKEZ', 'QtyOnHand': '>10' }).",
        "clearOthers: true verilirse diğer aktif filtreleri temizleyip yalnız belirtilen filtreleri uygular.",
      ].join(" "),
      inputSchema: jsonSchema<{
        filters: Record<string, string>;
        clearOthers?: boolean;
      }>({
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: "Kolon adı -> D365 filtre değeri eşleme objesi (örn: { QtyOnHand: '>0', InventLocationId: 'MERKEZ' }).",
          },
          clearOthers: {
            type: "boolean",
            description: "Diğer mevcut filtreler temizlensin mi? (varsayılan: false — mevcutlarla birleştirir)",
          },
        },
        required: ["filters"],
      }),
    }),
    reset_grid_layout: dynamicTool({
      description: [
        "Grid görünümünü varsayılan ayarlara döndürür: gizli kolonları açar, sıralamayı sıfırlar, pinleri kaldırır ve/veya filtreleri temizler.",
        "Kullanıcı 'görünümü sıfırla', 'tüm kolonları geri getir', 'tabloyu eski haline getir' dediğinde kullanılır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        resetFilters?: boolean;
        resetSort?: boolean;
        resetColumns?: boolean;
      }>({
        type: "object",
        properties: {
          resetFilters: { type: "boolean", description: "Filtreler temizlensin mi (varsayılan true)" },
          resetSort: { type: "boolean", description: "Sıralama sıfırlansın mı (varsayılan true)" },
          resetColumns: { type: "boolean", description: "Gizli kolonlar açılıp sıra sıfırlansın mı (varsayılan true)" },
        },
      }),
    }),
    export_grid_data: dynamicTool({
      description: [
        "Açık grid verisini kullanıcının tarayıcısına doğrudan dosya olarak indirir (Excel, Parquet, GZIP CSV).",
        "Kullanıcı 'bu veriyi Excel/CSV/Parquet olarak indir / dışa aktar' dediğinde bu aracı çağır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        format: "xlsx" | "parquet" | "csv" | "gz";
      }>({
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["xlsx", "parquet", "csv", "gz"],
            description: "İndirme formatı: xlsx (Excel) · parquet · csv · gz (Sıkıştırılmış CSV.gz)",
          },
        },
        required: ["format"],
      }),
    }),
  };
}

/**
 * İstek başına birleşik set — **evre değişimi** (State-Driven Tool Swapping):
 *  - Grid açık (Sonuç evresi) → yalnız grid araçları; kriter/run araçları
 *    modelin eline hiç verilmez (yanlış evreye sapma imkânsızlaşır).
 *  - Grid yok (Kriter evresi) → yalnız rapor hazırlama/çalıştırma araçları.
 *
 * Overload'lar literal tool tiplerini korur; böylece AI SDK `toolsContext`
 * (contextSchema'lı araçlar) ve `prepareStep.activeTools` tip-güvenli kalır.
 */
export function buildServerTools(grid: YulaGridToolContext): ToolSet;
export function buildServerTools(grid?: null | undefined): typeof STATIC_TOOLS;
export function buildServerTools(
  grid?: YulaGridToolContext | null,
): typeof STATIC_TOOLS | ToolSet {
  if (!grid || grid.columns.length === 0) return STATIC_TOOLS;
  return gridTools(grid);
}
