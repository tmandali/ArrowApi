/**
 * Yula agent sistem promptu — Headless React UI-Agent (@my-agent/core) mimarisi.
 * Ekran tanıma işlemi yapay/statik kurallar yerine `formatActiveComponentsPrompt`
 * ve `skillsManager.formatSkillsPrompt` ile dinamik bileşen ve beceri bazlı çalışır.
 */
import {
  formatActiveComponentsPrompt,
  skillsManager,
  type ComponentSchema,
  type UIContextSnapshot,
} from "@my-agent/core";
import {
  REGISTERED_REPORTS,
  findReport,
} from "@/features/reports/report-registry";
import { USER_AGENT_ATTACHMENTS_PROMPT_MAX_CHARS } from "@/lib/yula-user-agent";
import {
  extractJobIdFromHref,
} from "@/lib/workspace-paths";
import { formatLocalizedRelativeDateTerms } from "./yula-prompt-directives";

export interface YulaGridContext {
  tableName: string;
  columns: string[];
  rowCount?: number | null;
  /** Aktif UYGULANMIŞ filtreler — model gerçek tablo durumunu görsün */
  filters?: Record<string, string>;
  /** Modelin aktif özel SQL sorgusu; setliyken gruplanmış/türetilmiş görünüm aktiftir */
  customQuerySql?: string | null;
  /** Özel SQL görünümünün kullanıcı dostu ad etiketi */
  customQueryTitle?: string | null;
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/şemasından (şema grounding) */
  columnTypes?: Record<string, string>;
  /** İlk örnek satırlar — model değerleri gerçek veri dokusuyla eşlesin (few-shot grounding) */
  sampleRows?: Array<Record<string, unknown>>;
  /** Düşük kardinaliteli kolonların gerçek değerleri (DISTINCT) — değer uydurma savunması */
  columnValues?: Record<string, string[]>;
  /** Kolon → yetkili semantik tanım (rapor şeması x-ai.columnDescriptions) */
  columnDescriptions?: Record<string, string>;
  /** DuckDB'de aktif süzülmüş/canlı görünümün SQL VIEW adı (varsayılan: "active_view") */
  activeViewName?: string;
  /** DuckDB'de kayıtlı özel görünümlerin listesi (view_xxx adıyla erişilebilir) */
  savedViews?: Array<{ name: string; title: string; sql: string }>;
}

export type YulaScreenPhase =
  /** İşin SONUÇ tablosu görüntüleniyor (grid hazır) */
  | "results"
  /** Sonuç ekranı açıldı ama tablo henüz yükleniyor */
  | "results-loading"
  /** Form/ana ekran: rapor kriterleri ve çalıştırma akışı mevcut */
  | "workspace";

export interface YulaRagContextItem {
  scope: string;
  content: string;
  metadata?: Record<string, unknown>;
  distance?: number;
}

export interface YulaScreenContext {
  pathname?: string;
  mode?: "main" | "dock";
  workspaceId?: string;
  workspaceLabel?: string;
  phase?: YulaScreenPhase;
  /** Sonuç ekranındaki job GUID — geçmiş ve analiz bağlamı */
  jobId?: string;
  grid?: YulaGridContext | null;
  screen?: import("@/lib/stores/grid").YulaScreenRegistration | null;
  /** Headless React UI-Agent (@my-agent/core) istemci canlı bileşen bağlamı */
  uiContext?: UIContextSnapshot | null;
  /** WASM + All-MiniLM RAG Vektör arama sonuçları */
  ragContext?: YulaRagContextItem[];
  /** Ekran-bazlı durum sözlüğü: state alanı → anlamı (ekran kendini tarif eder) */
  stateLegend?: Record<string, string>;
  /** Kullanıcının cihaz-içi skill envanteri */
  userSkills?: Array<{ slash: string; label: string; description: string }>;
  /** Seçili kullanıcı ajanı (persona) */
  agent?: {
    name: string;
    instructions: string;
    tools: string[];
    skills: string[];
    scope?: string;
    provider?: string;
    model?: string;
    effort?: string;
    attachments?: Array<{ name: string; content: string }>;
  } | null;
}

const BASE_PROMPT = [
  "ROLE & PERSONA:",
  'You are "Yula", an intelligent enterprise data analysis, querying, and reporting copilot.',
  "Provide concise, accurate, and actionable responses. Use Markdown formatting when helpful.",
  "",
  "LANGUAGE DIRECTIVE:",
  "• Always write user-facing conversational answers, findings, and explanations in the user's active language (mirror the language of their latest message). Never force a single response language.",
  "• CHAT BUBBLE BUDGET (narrow dock): Keep user-visible replies SHORT. Prefer 1–3 short sentences, then at most 4 titled bullets. Do not write essays, first-person plans, or restatements of the user's request.",
  "",
  "TOOL EXECUTION PRINCIPLES (Headless React UI-Agent Architecture):",
  "• Greeting, thanks, or small talk: reply in the user's language immediately. Do not call any tool.",
  "• The tools provided in each turn represent your complete capabilities for the active screen:",
  "  1. 'dispatch_component_action': To interact with active UI components (form criteria, result grid, routing, job history).",
  "  2. 'inspect_ui_state': To inspect current screen state, active components, and ring buffer telemetry events.",
  "  3. 'ask_user_choice': To present interactive choice chips or ask clarifying questions when input is ambiguous or confirmation is needed.",
  "  4. 'time_travel': To undo or redo state transitions when requested by user.",
  "  5. 'remember_fact' & 'recall_fact': To persist and retrieve session preferences and facts.",
  "• PERSISTENT PREFERENCES (remember_fact): When the user states a recurring habit or preference (e.g. 'ben her zaman Kadıköy mağazasına bakarım', 'always download as Excel'), call 'remember_fact' with type='preference' and scope='persistent'. Leverage recalled preferences with 'recall_fact' when applicable.",
  "• Do NOT announce tool execution in conversational text. Call the tool; after results, answer in the user's language.",
  "• When a tool produces output, summarize key insights and actionable findings for the user. Do not repeat raw data tables longer than 5 rows in chat text.",
  "• Avoid duplicate tool calls with identical parameters in the same conversation turn.",
  "",
  "GROUNDING, MISSING ASSETS & OUT-OF-SCOPE PROTOCOL:",
  "• MISSING ASSETS (Anti-Confabulation): If the user asks about or references an image, screenshot, attachment, file, or document (e.g. 'bu ne resmi', 'resimdeki sorun ne', 'bu PDF'i özetle') but NO image or file is present in their turn/context:",
  "  - Immediately state in the user's language that no image or file was received/attached.",
  "  - NEVER guess, invent, or substitute a description of the current screen/reports when an image or file was asked about.",
  "• SCREEN INTRODUCTION BOUNDARY: Only describe the current screen, its purpose, or list available reports if the user explicitly asks about the screen itself (e.g. 'bu ekran ne işe yarar', 'bu sayfa nedir', 'burada ne yapabilirim', 'what is this page').",
  "• OUT-OF-SCOPE & AMBIGUITY: If a user request is ambiguous, unclear, or outside enterprise data analysis/reporting capabilities, do NOT make assumptions or force ERP reporting summaries; instead, transparently state your limitation or ask a concise clarifying question (optionally using 'ask_user_choice').",
  "",
  "INTERACTIVE QUESTIONS & CONFIRMATION PROTOCOL (ask_user_choice):",
  `• RELATIVE DATE EXPANSION: When the user specifies natural relative date terms (${formatLocalizedRelativeDateTerms()}), immediately calculate and expand them into exact ISO date ranges (e.g. '2026-09-07..2026-09-13') based on the Current Date. Do NOT ask clarifying questions or choices for standard calendar terms like 'geçen hafta' or 'bu ay'.`,
  "• ONLY call 'ask_user_choice' when mandatory criteria (such as required company or store code) are genuinely missing, when input is ambiguous, or when the user explicitly requests alternatives/confirmation.",
  "• DATA-GROUNDED CHOICES ONLY: NEVER invent, fabricate, or hallucinate dummy/placeholder codes (such as 1000, 2000, 3000 or generic numbers). Options MUST always be grounded in real schema enums, actual company/store catalog entries, or concrete context data. If actual codes are not defined in the schema or catalog, do NOT propose fake numbers — ask the user to type their code or choose an option.",
  "• STEP-BY-STEP (DEPENDENT) CRITERIA GATHERING: When multiple criteria are required or when subsequent choices depend on earlier answers (e.g. Date -> Company -> Store/Branch -> Final Confirmation):",
  "  - Gather them step-by-step, asking ONE question per turn.",
  "  - As soon as the user selects or types an answer, immediately apply it to the screen form via 'dispatch_component_action' (action='SET_FIELDS') with the received field so the user sees live progress.",
  "  - Formulate the next question based on the newly updated state, narrowing dependent choices dynamically.",
  "  - Once all required criteria are gathered, present a concise summary and ask for final confirmation before running (or run directly if the user gave an explicit run command).",
  "• DYNAMIC INPUT WATERMARK & CONCRETE OPTIONS: When calling 'ask_user_choice', 'options' must ONLY contain concrete, directly selectable values (e.g. date presets or specific company/store codes). If custom user input is allowed (allow_custom !== false), pass a concise, informative watermark hint or example in 'custom_placeholder' in the user's language (e.g. expected format or example value). NEVER add options that merely signify the action of typing or custom entry (such as 'custom value', 'other', or typing intents); the inline text box handles free-form input automatically.",
  "• When calling 'ask_user_choice', provide at most 4 concise actionable options in the user's language.",
  "• Call 'ask_user_choice' at most ONCE per turn — never emit parallel or repeated question calls in the same step; if you already asked, end the turn.",
  "• When calling 'ask_user_choice', write 1 short visible sentence in the user's language (what is ready + what is needed) — never leave the turn text empty or whitespace-only; the interactive choice card renders automatically below.",
  "• Options must be in the user's language and formatted as direct actionable answers.",
  "• After starting a report job (action='SUBMIT' or 'RUN'), write one short started/queued line starting with 📊 followed by the exact report title in the user's language (shape: '📊 <Exact Report Title> <Started-word>'); the results card renders automatically.",
].join("\n");
import { registerYulaSkills, AGENT_PREPARE_CHAIN_RULES } from "./skills/yula-ui-skills";
export { registerYulaSkills, AGENT_PREPARE_CHAIN_RULES };

/**
 * Ekranda mount edilmiş bileşenleri ve Zod aksiyon sözleşmelerini çözer.
 */
export function resolveActiveComponents(context?: YulaScreenContext): ComponentSchema[] {
  const comps: ComponentSchema[] = [];
  const pathname = context?.pathname ?? "/";
  const phase = context?.phase ?? "workspace";

  // 1. Evrensel Yönlendirici ve İş Geçmişi Bileşenleri
  comps.push({
    id: "app_router",
    capabilities: ["NAVIGATE"],
    meta: { description: "Page and Route Navigator" },
    actions: {
      NAVIGATE: {
        description: "Navigates the user to a target page or report ({ path }).",
        whenToCall: "When the user wants to navigate to another report, workspace, or page.",
        whenNotToCall: "When the user is already on the target screen.",
      },
    },
  });

  comps.push({
    id: "job_history",
    capabilities: ["OPEN_LAST", "LIST", "FIND", "CANCEL"],
    meta: { description: "Report Execution History and Job Tracker" },
    actions: {
      OPEN_LAST: {
        description: "Opens the most recently completed report result on the screen.",
        whenToCall: "When the user asks to 'open last report', 'show latest result', etc.",
        whenNotToCall: "When the user intends to execute a new report.",
      },
      LIST: {
        description: "Lists past execution jobs.",
        whenToCall: "When the user asks 'which reports ran', 'show history', 'list past jobs', etc.",
        whenNotToCall: "When actively inspecting or filtering the current report.",
      },
      FIND: {
        description: "Searches past report executions or matching jobs ({ query }).",
        whenToCall: "When the user wants to find a specific job, execution, or report run.",
        whenNotToCall: "When requesting the entire list or running a new report.",
      },
      CANCEL: {
        description: "Cancels an active or running job ({ jobId }).",
        whenToCall: "When the user explicitly asks to 'stop', 'abort', or 'cancel' an execution.",
        whenNotToCall: "When the job is already finished or terminated.",
      },
    },
  });

  // 2. RESULTS Evresi: Sonuç Tablosu Ekranda Mount Durumda
  if (phase === "results" && context?.grid) {
    comps.push({
      id: "result_grid:active",
      meta: {
        description: `Active Result Grid (${context.grid.tableName || "active_view"}) - ${context.grid.rowCount ?? "?"} rows, Columns: ${(context.grid.columns || []).join(", ")}`,
        tableName: context.grid.tableName,
        columns: context.grid.columns,
        filters: context.grid.filters,
      },
      actions: {
        RUN_SQL: {
          description: "Executes a read-only DuckDB SQL query against 'active_view' ({ query }).",
          whenToCall: "When the user requests calculations, top N, aggregations, or custom SQL analysis on active table data.",
          whenNotToCall: "For simple column filtering or sorting (use FILTER or SORT instead).",
        },
        QUERY: {
          description: "Updates the grid view via SQL or opens a derived view ({ query }).",
          whenToCall: "When the user wants derived columns or grouped table views.",
          whenNotToCall: "When only changing simple filters or sorting.",
        },
        FILTER: {
          description: "Applies a filter to a single column ({ field, value, op }).",
          whenToCall: "When the user wants to filter records by a single column value.",
          whenNotToCall: "When applying multiple filters simultaneously (use APPLY_FILTERS instead).",
        },
        APPLY_FILTERS: {
          description: "Applies multiple filters to the table simultaneously ({ filters, clearOthers }).",
          whenToCall: "When multiple columns need to be filtered concurrently.",
          whenNotToCall: "When filtering only a single column.",
        },
        SORT: {
          description: "Sorts the column in ascending or descending order ({ column, direction }).",
          whenToCall: "When sorting is requested.",
          whenNotToCall: "When sorting is not requested.",
        },
        COLUMNS: {
          description: "Shows, hides, or reorders columns ({ visibleColumns, hiddenColumns, order }).",
          whenToCall: "When adjusting column visibility or display order.",
          whenNotToCall: "When filtering table data.",
        },
        PIN: {
          description: "Pins columns to the left or right ({ columns }).",
          whenToCall: "When column freezing or pinning is requested.",
          whenNotToCall: "When pinning is not requested.",
        },
        RESET_LAYOUT: {
          description: "Resets the grid to default layout and visibility.",
          whenToCall: "When the user wants to reset custom column arrangements.",
          whenNotToCall: "When keeping the current layout.",
        },
        EXPORT: {
          description: "Exports the table to file ({ format: 'xlsx'|'parquet'|'csv'|'gz' }).",
          whenToCall: "When the user requests exporting or downloading data to Excel, CSV, or Parquet.",
          whenNotToCall: "When only viewing data on screen.",
        },
        PROFILE: {
          description: "Analyzes column null counts, cardinality, and data quality anomalies.",
          whenToCall: "When the user requests data profiling or inspecting data quality anomalies.",
          whenNotToCall: "When the user is searching for specific rows.",
        },
        ANALYZE: {
          description: "Generates a statistical analysis summary of active data.",
          whenToCall: "When statistical summary or distribution analysis is requested.",
          whenNotToCall: "When statistical summary is not requested.",
        },
        VISUALIZE: {
          description: "Generates a visual chart or plot from table data ({ type, dimension, metric }).",
          whenToCall: "When the user requests a chart, plot, or graph visualization.",
          whenNotToCall: "When there are no numeric metrics in the table.",
        },
      },
    });
  }

  // 3. WORKSPACE Evresi: Kriter Formu Ekranda Mount Durumda
  if (phase === "workspace") {
    const activeReport =
      REGISTERED_REPORTS.find((r) => pathname.startsWith(r.pagePath)) ||
      (context?.screen?.reportScope ? findReport(context.screen.reportScope) : undefined);

    const scope = activeReport?.scope ?? (context?.screen?.reportScope || "report");
    const reportTitle = activeReport?.title ?? "Report";

    comps.push({
      id: `criteria_form:${scope}`,
      meta: {
        description: `${reportTitle} Criteria Form`,
        scope,
        criteriaDraft: (context as any)?.screenState?.criteria ?? (context?.uiContext as any)?.criteria,
      },
      actions: {
        SET_FIELDS: {
          description: "Populates criteria form fields without executing the report ({ criteria }).",
          whenToCall: "When the user specifies store, date, or filter parameters to fill in the form.",
          whenNotToCall: "When the user explicitly wants to run the report (call SUBMIT or RUN).",
        },
        APPLY: {
          description: "Populates criteria form fields and updates the form ({ criteria }).",
          whenToCall: "When the user prepares or updates criteria parameters.",
          whenNotToCall: "When the user commands to run the report directly.",
        },
        SUBMIT: {
          description: "Submits criteria, executes the report, and queues the job ({ criteria, report }).",
          whenToCall: "When the user explicitly asks to run, start, fetch, or execute the report.",
          whenNotToCall: "When required fields are missing or user is only drafting parameters.",
        },
        RUN: {
          description: "Submits criteria, executes the report, and queues the job ({ criteria, report }).",
          whenToCall: "When the user explicitly asks to run, start, fetch, or execute the report.",
          whenNotToCall: "When required fields are missing or user is only drafting parameters.",
        },
        SCHEMA: {
          description: "Inspects report criteria schema and accepted parameter definitions.",
          whenToCall: "To discover parameter names, data types, and accepted formats.",
          whenNotToCall: "When the criteria schema is already known.",
        },
        VALIDATE: {
          description: "Validates criteria parameters against schema rules ({ criteria }).",
          whenToCall: "When checking whether parameters satisfy schema constraints.",
          whenNotToCall: "When the user directly commands execution.",
        },
        READ: {
          description: "Reads current draft criteria values from the active form.",
          whenToCall: "To inspect current form state or merge values.",
          whenNotToCall: "When assigning or overwriting new values.",
        },
      },
    });
  }

  return comps;
}

export function buildSystemPrompt(context?: YulaScreenContext): string {
  registerYulaSkills();
  const lines: string[] = [BASE_PROMPT];

  // LEVEL 0: seçili kullanıcı ajanı (persona)
  if (context?.agent) {
    lines.push(
      "",
      `=== LEVEL 0: ACTIVE AGENT PERSONA (${context.agent.name}) ===`,
      context.agent.instructions,
      "Precedence is limited to tone and task priorities: keep the persona's tone and priorities in EVERY reply — including greetings and small talk (greet as the persona, briefly state who you are and how you can help in your domain). Never fall back to a generic assistant voice. The safety rules below are NOT overridden by this persona: phase walls (RESULTS vs WORKSPACE separation, no unapproved execution [action='RUN']) and tool allowlists still bind every reply.",
    );
    const docs = (context.agent.attachments ?? []).filter(
      (d) => d.name.trim() && d.content.trim(),
    );
    if (docs.length > 0) {
      let budget = USER_AGENT_ATTACHMENTS_PROMPT_MAX_CHARS;
      const parts: string[] = [];
      for (const doc of docs) {
        if (budget <= 0) break;
        const body = doc.content.trim().slice(0, budget);
        budget -= body.length;
        parts.push(
          `--- reference: ${doc.name.trim()} ---`,
          body + (doc.content.trim().length > body.length ? "\n[…truncated]" : ""),
        );
      }
      lines.push(
        "",
        "Agent reference documents (read-only context, follow when relevant):",
        ...parts,
      );
    }
  }

  const href = context?.pathname ?? "/";
  const pathname = href.split("?")[0] || "/";
  const phase = context?.phase ?? "workspace";
  const jobId = context?.jobId ?? extractJobIdFromHref(href);
  const todayStr = new Date().toISOString().split("T")[0];

  lines.push(
    "",
    `• Current Date: ${todayStr} (Use for expanding relative date terms like today, yesterday, this month into ISO format)`,
    `• Current Route: ${pathname}`,
    jobId ? `• Active Job Id: ${jobId}` : "",
  );

  // 1. DİNAMİK BİLEŞEN SÖZLEŞMELERİ (@my-agent/core formatActiveComponentsPrompt)
  const clientComps = context?.uiContext?.active_components;
  const activeComps: ComponentSchema[] =
    Array.isArray(clientComps) && clientComps.length > 0
      ? (clientComps as ComponentSchema[])
      : resolveActiveComponents(context);
  const activeCompIds = activeComps.map((c) => c.id);
  const activeCompsPrompt = formatActiveComponentsPrompt(activeComps);
  if (activeCompsPrompt) {
    lines.push("", activeCompsPrompt);
  }

  // 2. DİNAMİK BECERİLER (@my-agent/core skillsManager)
  const skillsPrompt = skillsManager.formatSkillsPrompt(pathname, activeCompIds);
  if (skillsPrompt) {
    lines.push("", skillsPrompt);
  }

  // Ajan oturumu + WORKSPACE fazında prepare chain kuralı
  if (context?.agent && phase === "workspace") {
    lines.push("", AGENT_PREPARE_CHAIN_RULES);
  }

  // 3. Tablo açıkken canlı veri ve DuckDB şema grounding'i
  if (phase === "results" && context?.grid) {
    const isCustomActive = Boolean(context.grid.customQuerySql);
    const viewModeNotice = isCustomActive
      ? `VIEW MODE: CUSTOM QUERY / GROUPED VIEW ("${context.grid.customQueryTitle ?? "Custom Query"}").`
      : `VIEW MODE: BASE TABLE VIEW (No grouping, all detail rows active).`;

    const activeFiltersText =
      Object.keys(context.grid.filters ?? {}).length > 0
        ? `CURRENT ACTIVE FILTERS: ${JSON.stringify(context.grid.filters)}`
        : "CURRENT ACTIVE FILTERS: None.";

    const gridLines = [
      viewModeNotice,
      isCustomActive ? `ACTIVE CUSTOM QUERY SQL: ${context.grid.customQuerySql}` : null,
      `Active table: ${context.grid.tableName} · ${context.grid.rowCount ?? "?"} rows.`,
      `Active DuckDB View: "active_view" (Represents currently visible & filtered rows on screen).`,
      `Columns: ${context.grid.columns.join(", ")}.`,
      activeFiltersText,
    ].filter(Boolean);

    lines.push("", gridLines.join(" "));
  }

  // 4. Ring Buffer UI Olayları Telemetrisi
  const recentEvents = context?.uiContext?.recent_events;
  if (Array.isArray(recentEvents) && recentEvents.length > 0) {
    lines.push("", "RECENT UI TELEMETRY EVENTS:", JSON.stringify(recentEvents, null, 2));
  }

  // 5. RAG ve Kullanıcı Becerileri
  if (context?.ragContext && context.ragContext.length > 0) {
    lines.push(
      "\nRELEVANT VECTOR RAG CONTEXT:",
      ...context.ragContext.map(
        (item) => ` • ${item.content}${item.distance != null ? ` (distance: ${item.distance.toFixed(3)})` : ""}`,
      ),
    );
  }

  if (context?.userSkills && context.userSkills.length > 0) {
    lines.push(
      "\nUSER SKILLS (on-device slash commands defined by this user):",
      ...context.userSkills.map((s) => ` • /${s.slash}: ${s.description || s.label}`),
      "When the user types /<name> explicitly or selects a skill, its instructions arrive as their message. Follow those skill instructions using your active component actions.",
    );
  }

  lines.push(
    "\nFINAL REMINDER: Write your final response text to the user in the user's active language.",
  );

  return lines.join("\n");
}
