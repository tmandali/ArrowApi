import { tool } from "ai";
import { z } from "zod";

/**
 * Her iki evrede paylaşılan araç tanımları (STATIC_TOOLS + grid seti):
 * `reportSchemaTool`, `askUserQuestionTool`, `suggestNextStepsTool`,
 * `runUserSkillTool`, server-executed `runSkillScriptTool` /
 * `readSkillFileTool` ve `readUserFileTool`.
 * Yürütme gövdesi yoktur (execute YOKTUR): yürütme tarayıcıdadır
 * (yula-client-tools) ya da sunucu sandbox'ındadır; tanımlar birebirdir.
 */

/**
 * get_report_schema — aktif raporun JSON şemasını (kriter alanları, tipler,
 * seçenekler, kolon tanımları) döndürür. Yürütme istemcidedir (yula-client-tools).
 */
export const reportSchemaTool = tool({
  description: [
    "Return a report's JSON schema: criteria fields (name, type, required, options),",
    "column definitions (owner descriptions) and report metadata.",
    "Call when the user asks about schema, available criteria, report definition, or column meanings.",
    "When a report screen is open, omit 'report' to read the active report. When NO report screen is open",
    "(e.g. agent session), pass 'report' explicitly with the target scope from the RAG routing context",
    "or report catalog — without it the lookup fails.",
    "Summarize the output as a markdown table; use criteria field names verbatim in run_job criteria.",
  ].join(" "),
  inputSchema: z.object({
    report: z.string().optional().describe("Report scope — REQUIRED when no report screen is open; omit only to read the active report."),
  }),
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

/**
 * ask_user_question — human-in-the-loop structured questions with options.
 * Client executes headlessly (yula-client-tools); the question card renders
 * in the chat turn (YulaQuestionnaireCard). Answers arrive as a new user
 * message. Shared between STATIC_TOOLS and grid tools so questions can be
 * asked in both criteria and results phases.
 */
export const askUserQuestionTool = tool({
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
 * suggest_next_steps — yapılandırılmış öneri/bulgu çipleri (prose
 * heuristiğine alternatif). Model turu kapatırken somut sonraki adımları
 * (bulgu detayı, rapor ekranı, sayfa geçişi, takip analizi) bu tool ile
 * bildirir; istemci JSON'dan chip basar (YulaSuggestionChips). İstemcide
 * yürütülür (echo + present), terminaldir (ask_user_question deseni).
 * STATIC_TOOLS ve grid araçlarında paylaşılır (her iki evrede de öneri).
 */
const suggestionItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("finding"),
    title: z.string().describe("Short chip title in the user's language (max ~40 chars)"),
    prompt: z.string().describe("Full follow-up prompt sent when the chip is clicked (user's language)"),
  }),
  z.object({
    kind: z.literal("report"),
    title: z.string().describe("Short chip title in the user's language (max ~40 chars)"),
    scope: z.string().describe("Registered report scope (e.g. stock-balance) — the client resolves the screen"),
    prompt: z.string().optional().describe("Fallback prompt when the scope has no registered screen"),
  }),
  z.object({
    kind: z.literal("navigation"),
    title: z.string().describe("Short chip title in the user's language (max ~40 chars)"),
    path: z.string().describe("In-app target path (e.g. /stock, /system/agents)"),
  }),
  z.object({
    kind: z.literal("analysis"),
    title: z.string().describe("Short chip title in the user's language (max ~40 chars)"),
    prompt: z.string().describe("Full analysis prompt sent when the chip is clicked (user's language)"),
  }),
]);

export const suggestNextStepsTool = tool({
  description: [
    "Present STRUCTURED follow-up suggestion chips (findings, report screens, navigation, analyses) at the end of your turn.",
    "Call when you have concrete next steps for the user — instead of writing them ONLY as prose bullets.",
    "At most 10 suggestions per call; every title in the user's language.",
    "When you call this tool, keep visible prose to 1-2 short sentences and do NOT duplicate the same items as bold-titled bullets — the chips render automatically.",
    "The call ends your turn; the user's click arrives as a new user message (finding/analysis) or an in-app navigation (report/navigation).",
  ].join(" "),
  inputSchema: z.object({
    suggestions: z
      .array(suggestionItemSchema)
      .min(1)
      .max(10)
      .describe("At most 10 suggestion chips"),
  }),
  outputSchema: z.object({
    status: z.literal("presented"),
    count: z.number(),
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
export const runUserSkillTool = tool({
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
export const runSkillScriptTool = tool({
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

export const readSkillFileTool = tool({
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
export const readUserFileTool = tool({
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
