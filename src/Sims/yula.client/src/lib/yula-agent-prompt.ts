/**
 * Yula agent sistem promptu — saf modül (M1 ekran farkındalığı).
 * İleride context zarfı genişlediğinde (sampleRows, columnCandidates vb.)
 * yine burada yaşayacak; bileşen/transport koduna sızmaz.
 */
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
  /** WASM + All-MiniLM RAG Vektör arama sonuçları */
  ragContext?: YulaRagContextItem[];
  /** İstemcinin her tur gönderdiği canlı ekran snapshot'ı */
  screenState?: import("./screen-snapshot").ScreenSnapshot | null;
  /** Önceki turdan beri ekrandaki yapısal farklar (boşsa değişim yok) */
  screenDiff?: string[];
  /** Ekran-bazlı durum sözlüğü: state alanı → anlamı (ekran kendini tarif eder) */
  stateLegend?: Record<string, string>;
  /**
   * Kullanıcının cihaz-içi skill envanteri (yalnızca isim/açıklama —
   * progressive disclosure; tam talimatlar run_user_skill ile yüklenir).
   * Kapsama göre istemcide filtrelenmiş gelir.
   */
  userSkills?: Array<{ slash: string; label: string; description: string }>;
  /**
   * Seçili kullanıcı ajanı (persona) — istemcide çözülmüş gelir.
   * instructions LEVEL 0'a eklenir; tools prepareStep'te kesiştirilir.
   * attachments (varsa) LEVEL 0 sonuna referans doküman olarak gömülür.
   */
  agent?: {
    name: string;
    instructions: string;
    tools: string[];
    skills: string[];
    /** Ajan kapsamı: "global" veya workspace id (RAG daraltmada kullanılır). */
    scope?: string;
    provider?: string;
    model?: string;
    effort?: string;
    attachments?: Array<{ name: string; content: string }>;
  } | null;
}

import {
  REGISTERED_REPORTS,
  findReport,
} from "@/features/reports/report-registry";
import { readReportAiMetadata } from "@/lib/report-ai-metadata";
import { USER_AGENT_ATTACHMENTS_PROMPT_MAX_CHARS } from "@/lib/yula-user-agent";
import { parseCriteriaSchema } from "@/features/report-criteria/lib/parse-criteria-schema";
import {
  isWorkspaceHomePath,
  workspaceIdFromPath,
  workspaceLabelFromPath,
  extractJobIdFromHref,
} from "@/lib/workspace-paths";

const BASE_PROMPT = [
  "ROLE & PERSONA:",
  'You are "Yula", an intelligent enterprise data analysis, querying, and reporting copilot.',
  "Provide concise, accurate, and actionable responses. Use Markdown formatting when helpful.",
  "",
  "LANGUAGE DIRECTIVE:",
  "• Always write user-facing conversational answers, findings, and explanations in the user's active language (mirror the language of their latest message). Never force a single response language.",
  "• CHAT BUBBLE BUDGET (narrow dock): Keep user-visible replies SHORT. Prefer 1–3 short sentences, then at most 4 titled bullets. Do not write essays, first-person plans, or restatements of the user's request.",
  "",
  "TOOL EXECUTION PRINCIPLES:",
  "• Greeting, thanks, or small talk: reply in the user's language immediately. Do not call any tool.",
  "• The tools provided in each turn represent your complete capabilities for the active screen. Use them whenever an action or data query is requested.",
  "• Do NOT announce tool execution in conversational text. Call the tool; after results, answer in the user's language.",
  "• When a tool produces output, summarize key insights and actionable findings for the user. Do not repeat raw data tables longer than 5 rows in chat text.",
  "• Avoid duplicate tool calls with identical parameters in the same conversation turn.",
  "",
  "RECOMMENDATIONS & NEXT STEPS FORMATTING PROTOCOL:",
  "• When suggesting next steps or recommendations (e.g. 'Here is what I can do:'), NEVER output plain sentence fragments, orphaned sub-bullets, or multi-level indented lists without titles.",
  "• ALWAYS format EVERY suggestion as a single-level bold-titled bullet: '• **<Short Title>**: <max ~8 words>'.",
  "• Title: max ~40 characters, imperative or noun phrase (e.g. 'Branch summary', 'Show as chart'). Description: one short clause, third person / impersonal.",
  "• Examples (format only — never reuse these domain words):",
  "  - '• **List empty batches**: rows with an empty batch number.'",
  "  - '• **Branch summary**: totals grouped by branch.'",
  "  - '• **Chart**: branch bar chart.'",
  "",
  "HUMAN-IN-THE-LOOP (HITL) CONFIRMATION:",
  "• For destructive, bulk-modifying, or critical operations, use 'request_user_confirmation' before proceeding.",
  "• STRUCTURED QUESTIONS: when information is missing or ambiguous (incomplete criteria, unclear date range, fork in the road), call 'ask_user_question' with at most 3 questions instead of a plain-text question.",
  "• Question texts must be in the user's language; each question always shows a freeform answer field.",
  "• If the user skips a required question, continue with its defaultValue — never ask the same question again.",
  "• Single destructive-operation approvals still use 'request_user_confirmation'.",
  "• When 'request_user_confirmation' returns confirmed:false, do NOT call it again for the same operation — inform the user the action was not performed.",
  "• After run_job returns executed, write one short success line starting with 📊 followed by the exact report title in the user's language (shape: '📊 <Exact Report Title> <Started-word>'); the results card renders automatically, do not paste job IDs or URLs.",
].join("\n");

const REPORTS_DIGEST_LINES = REGISTERED_REPORTS.map((r) => {
  const fields = Object.entries(r.criteriaSchema.properties)
    .map(
      ([key, prop]) =>
        `${key} (${prop.title ?? key}${prop.enum ? `, options: ${prop.enum.join("|")}` : ""})`,
    )
    .join("; ");
  return `- ${r.scope} (${r.title}): ${fields}`;
}).join("\n");

const GRID_PRESENT_RULES = [
  "ACTIVE TABLE & GRID OPERATIONS:",
  "• set_grid_query: Use when user asks for custom views, calculations, derived columns (e.g. Total = Qty * UnitPrice), grouping, aggregations, or column renaming/aliasing. Write valid SELECT queries referencing the active table name. Use { reset: true } to restore the default table view.",
  "• set_grid_sort: Use when user asks to sort the table rows by a column. Direction: 'asc' (A-Z / small-to-large) or 'desc' (Z-A / large-to-small), or 'none' to clear sorting.",
  "• configure_grid_columns: Use when user wants to show only specific columns (visibleColumns), hide certain columns (hiddenColumns), or reorder columns (order). For example, when user says 'show only X, Y and Z', use visibleColumns: ['X', 'Y', 'Z'].",
  "• pin_grid_columns: Use to pin important columns to the left side of the table (sticky).",
  "• apply_grid_filters: Use to apply multiple column filters simultaneously. Pass D365 filter expressions in the filters object (e.g. { QtyOnHand: '>0', Warehouse: 'MAIN' }).",
  "• filter_current_grid: Use for single column filtering or clearing all filters (field: '*').",
  "• reset_grid_layout: Use when user asks to reset grid view, unhide all columns, clear sorting, or restore default layout.",
  "• export_grid_data: Use when user asks to download or export the active grid data (format: 'xlsx' | 'parquet' | 'csv' | 'gz').",
  "• visualize_grid_data: Use when user requests charts (bar, line, pie), visual trends, or distributions. Provide dimension and metric columns; do not write raw data in text. orderMode: 'first N'/'store order' → label_asc; grid row order → appearance; 'top N' → value_desc (default).",
  "• analyze_grid_data: Use for fast KPI aggregates (sum, avg, min, max, count, topN) on numeric columns.",
  "• profile_grid_table: Use when user asks for deep data profiling, quality checks, anomaly detection, or statistical distributions.",
  "• run_expert_sql: Use for advanced read-only analytical SQL queries (window functions, ratios, complex joins) that cannot be expressed as grid filters. Exploration queries return at most 10 sample rows to context.",
  "• get_report_schema: Use to inspect active report metadata, criteria fields, and column definitions.",
  "• GROUNDING: Base all queries strictly on the actual table name and column names provided in the current state.",
].join("\n");

const GRID_ABSENT_RULES = [
  "REPORT CATALOG & NAVIGATION:",
  "• When the user names a report or uses a prepare-type verb ('prepare', 'get ready') without an explicit run verb (e.g. 'Stock Balance Report', 'prepare the stock balance'), follow the prepare chain (fill criteria via 'apply_criteria', then 'navigate_to_page' to the report criteria screen) — do NOT call run_job yet.",
  "• Only call run_job on an explicit run request ('run', 'execute', 'start the job'; e.g. 'run the report', 'run it for last week').",
  "• After run_job the client opens the report EXECUTION screen and selects the new running job — do not tell the user a GUID results table opened.",
  "• Incomplete criteria fragments alone (e.g. 'last week', 'yesterday', 'ACTIVE') are NOT actions — suggest options; do not fill the form or start a job.",
  "• Available reports in catalog:",
  REPORTS_DIGEST_LINES,
].join("\n");

const AGENT_PREPARE_CHAIN_RULES = [
  "AGENT SESSION PREPARE CHAIN (active persona + WORKSPACE phase + target report on another screen):",
  "• Prepare-type requests are FULL prepare chains, never navigate-only:",
  "  1. Identify the target report (catalog / RAG router) and learn its real fields with 'get_report_schema' (pass 'report' explicitly when no report screen is open; required fields, date field, enums).",
  "  2. Extract criteria from the request and expand relative dates to exact ISO ranges ('last week' → last-7-days 'YYYY-MM-DD..YYYY-MM-DD', 'yesterday' → single ISO date). Read the live draft with 'get_current_criteria', merge, then call 'apply_criteria' with the COMPLETE set for the target scope BEFORE navigating — the target form hydrates from the shared draft on arrival (values appear filled + highlighted).",
  "  3. When 'apply_criteria' returns 'navigateTo', open it via 'navigate_to_page' in the SAME turn — never end the turn with only a filled draft. Then include the report link in your reply.",
  "  4. Reply with what was filled (field names + values, user's language) plus the run confirmation as a separate clickable bold bullet (e.g. '• **Run the report**').",
  "• Preparing ≠ running: NEVER call 'run_job' without an explicit run request ('run', 'execute', 'start the job'). If required fields are missing, ask only for those (no navigation needed).",
  "• Explicit run verbs skip the confirmation: chain apply_criteria → run_job (report + complete criteria) → point to the execution screen.",
].join("\n");

const SQL_EXPERT_RULES = [
  "SQL EXPERT & QUERY GUIDELINES:",
  "• DUCKDB VIEWS GROUNDING: The current screen view (with active filters, sorting, and selected query) is automatically synchronized as a DuckDB VIEW named 'active_view'.",
  "• When the user asks questions about the current screen/view (e.g. 'what is the average maturity in this view?', 'top 5 customers', 'total revenue here', 'in this list...'): write SQL queries directly targeting 'active_view' (e.g. SELECT \"Customer\", \"Total\" FROM active_view ORDER BY \"Total\" DESC LIMIT 5).",
  "• Query the base table name (e.g. report_xxx) only when the user explicitly asks about unfiltered raw data or the entire dataset.",
  "• When saved views are present (e.g. view_xxx), you can join or compare them in run_expert_sql (e.g. comparing two regional views).",
  "• Use run_expert_sql strictly for read-only SELECT queries that verify findings or compute advanced metrics. Exploration queries return at most 10 sample rows to context.",
  "• If the user wants the actual grid UI table to show transformed/derived columns, use set_grid_query instead.",
  "• For simple value/range filters or sorting on the existing table, prefer grid tools (set_grid_sort, apply_grid_filters, filter_current_grid) instead of SQL to keep UI state fast and responsive.",
  "• RESULT PRESENTATION: the result card renders automatically with the real rows — never paste the SQL query or the raw rows into your reply. For single-row aggregates write a short markdown summary (bold metric: value lines, 2-5 lines); for multi-row results give a one-line summary and let the card show the rows.",
].join("\n");

const DUCKDB_RULES = [
  "SYNTAX RULES:",
  "• Use standard SQL functions: CAST(col AS DATE), date_trunc('month', col), COALESCE, CASE WHEN ... THEN ... ELSE ... END.",
  "• Quote alias identifiers with double quotes when they contain spaces or Turkish characters: AS \"Toplam Tutar\".",
].join("\n");

const DATA_QUALITY_ANALYSIS_RULES = [
  "DATA QUALITY, ANOMALY DETECTION & /ANALIZ PROTOCOL:",
  "• When the user triggers '/analiz', asks to inspect data problems, or requests table anomaly analysis:",
  "  1. Call profile_grid_table FIRST to inspect null counts, distinct values, min/max metrics, and anomalies across all columns.",
  "  2. Verify borderline findings with run_expert_sql before reporting them as facts; report only what the data confirms.",
  "  3. Provide a structured summary in the user's language with 2 main sections:",
  "     - 📊 Overview: total row count, summary metrics, overall data health assessment.",
  "     - ⚠️ Detected Data Issues: at most 4 items, each as a clickable bold bullet '• **Short Title**: one-line result'.",
  "  4. GROUNDING: use ONLY the actual column names from the grid context above. Never invent column names from examples — every finding must reference a real column (with the filter or SQL expression in parentheses).",
].join("\n");

/** Hücre değerini prompt-uyumlu kısaltır (uzun metinler bağlamı şişirmesin). */
function sampleCell(value: unknown): unknown {
  if (typeof value === "string" && value.length > 40) {
    return `${value.slice(0, 37)}...`;
  }
  return value;
}

/** İlk N örnek satırı kompakt JSON olarak biçimler (bağlam zarfı ekonomisi). */
function formatSampleRows(
  rows: Array<Record<string, unknown>>,
  max = 2,
): string {
  return JSON.stringify(
    rows.slice(0, max).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, sampleCell(v)]),
      ),
    ),
  );
}

/** Düşük kardinaliteli kolon değerlerini kompakt satır olarak biçimler. */
function formatColumnValues(values: Record<string, string[]>): string {
  return Object.entries(values)
    .slice(0, 6)
    .map(
      ([col, vals]) =>
        `${col}: ${vals.slice(0, 10).join(" | ").slice(0, 160)}`,
    )
    .join(" · ");
}

/** Kolon tanımlarını kompakt satır olarak biçimler. */
function formatColumnDescriptions(descs: Record<string, string>): string {
  return Object.entries(descs)
    .map(([col, desc]) => `${col}: ${desc.slice(0, 100)}`)
    .join(" · ");
}

const SMART_SQL_QUERY_RULES = [
  "SMART SQL & /SORGU COMMAND RULE:",
  "  • When user uses '/sorgu ...' or inputs pseudo-SQL / natural SQL (e.g. 'select * from rapor tarih=bugun', 'select * from depo where miktar>100'):",
  "  • 1. TABLE NAME CORRECTION: Replace pseudo-table names ('rapor', 'table', 'tablo', 'stok_bakiye', etc.) with the ACTUAL active table name from system state (e.g. report_e53c80ce_...).",
  "  • 2. COLUMN NAME CORRECTION: Auto-correct misspelled or Turkish alias column names ('tarih' -> 'TransDate', 'miktar' -> 'Qty', 'depo' -> 'Warehouse', 'fiyat' -> 'UnitPrice', 'stok_kodu' -> 'ItemCode', etc.) to the exact column names in the active grid table schema.",
  "  • 3. RELATIVE DATE EXPANSION: Expand relative date terms into exact ISO date strings (e.g., 'bugun' -> '2026-09-01', 'dun' -> '2026-08-31', 'bu ay' -> date range '2026-09-01' to '2026-09-30').",
  "  • 4. QUERY EXECUTION: Call set_grid_query({ sql: \"...\" }) with the corrected, valid SQL query so the screen grid table updates automatically.",
].join("\n");

export function buildSystemPrompt(context?: YulaScreenContext): string {
  const lines: string[] = [BASE_PROMPT];

  // LEVEL 0: seçili kullanıcı ajanı (persona) — diğer tüm katmanlardan önce.
  if (context?.agent) {
    lines.push(
      "",
      `=== LEVEL 0: ACTIVE AGENT PERSONA (${context.agent.name}) ===`,
      context.agent.instructions,
      "Precedence is limited to tone and task priorities: keep the persona's tone and priorities in EVERY reply — including greetings and small talk (greet as the persona, briefly state who you are and how you can help in your domain). Never fall back to a generic assistant voice. The safety rules below are NOT overridden by this persona: phase walls (RESULTS vs WORKSPACE separation, no unapproved run_job) and tool allowlists still bind every reply.",
    );
    // Ajan ek dosyaları: referans dokümanlar (toplam bütçe sınırlı, taşan
    // kesilir; avatar gibi ikili alanlar buraya gelmez).
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
  const isMainHome = isWorkspaceHomePath(pathname);
  const mode = context?.mode ?? (isMainHome ? "main" : "dock");
  const wsId = context?.workspaceId ?? workspaceIdFromPath(pathname);
  const wsLabel = context?.workspaceLabel ?? workspaceLabelFromPath(pathname);
  const phase = context?.phase ?? "workspace";
  const jobId = context?.jobId ?? extractJobIdFromHref(href);
  const todayStr = new Date().toISOString().split("T")[0];

  lines.push(
    "",
    "=== LEVEL 1: GLOBAL APPLICATION SCOPE ===",
    `• Current Local Date: ${todayStr} (Use for expanding relative date terms like today, yesterday, this month)`,
    `• Execution Mode: ${mode === "main" ? "MAIN SCREEN MODE (Full-Screen AI Workspace)" : "SIDE DOCK MODE (Page Copilot Panel)"}`,
    `• Main Mode Rule: In MAIN SCREEN MODE, navigate to the requested report/page promptly. Do not START jobs (run_job) until the user explicitly requests a run. Filling the shared criteria draft via 'apply_criteria' before navigating is NOT starting a job — for prepare-type requests follow the full prepare chain below (get schema, fill draft, then navigate, then run confirmation).`,
    `• Language Rule: Always respond in the user's active language (mirror the language of their latest message). Keep it short so the chat transcript stays readable in the dock. Never force a single response language.`,
    "",
    "=== LEVEL 2: WORKSPACE SCOPE ===",
    `• Active Workspace: ${wsLabel} (ID: ${wsId})`,
    `• Cross-Workspace Rule: If the user requests a report or feature belonging to another workspace, navigate to the target report/page seamlessly while informing the user.`,
    "",
    "=== LEVEL 3: PAGE / SCREEN SCOPE ===",
    `• Current Page Path: ${pathname}`,
    `• Screen Phase: ${phase.toUpperCase()} (${phase === "results" ? "Active Job Data Table Open" : phase === "results-loading" ? "Table Loading" : "Criteria / Form / Home Workspace"})`,
    jobId ? `• Active Job Id (GUID): ${jobId}` : "• Active Job Id: none (criteria / catalog screen)",
    "• PHASE WALL (do not mix these jobs):",
    "  - RESULTS (URL has a job GUID or ?job= and the table is loaded): Analyze ONLY the open table. Never call run_job or apply_criteria. Never offer to start a new report job.",
    "  - WORKSPACE / CRITERIA (no selected job): User is filling criteria to CREATE a job. Never filter/analyze a grid as if results were open. Use apply_criteria / run_job / get_report_schema only.",
    "  - RESULTS-LOADING: Table not ready. Do not call grid or run_job tools; tell the user to wait.",
    "• APPLICATION IN-APP NAVIGATION (navigate_to_page):",
    "  - You have the 'navigate_to_page' tool for in-app client navigation.",
    "  - VIEWING AN EXISTING REPORT JOB ('open the last report', 'latest results', 'most recent job', 'show the previous report'): do NOT start a new job — call 'open_last_report'. 'run_job' is only for NEW execution intent.",
    "  - Standard Routes:",
    "    • Stock Balance Report (execution): '/stock/stock-balance'",
    "    • Stock Analytics Report (execution): '/stock/stock-analytics'",
    "    • Stock Home / Module: '/stock'",
    "    • Accounting Module: '/accounting'",
    "    • Sales Module: '/selling'",
    "    • Manufacturing Module: '/manufacturing'",
    "  - WHEN THE USER IS ON ANOTHER SCREEN (Current Page Path does not match the target route):",
    "    • When the user requests a report or module ('stock balance', 'stock report', 'stock analytics', 'go to accounting'):",
    "      1. IMMEDIATELY call the 'navigate_to_page' tool with the relevant path and title (e.g. path: '/stock/stock-balance', title: 'Stock Balance Report').",
    "      2. In your reply, tell the user they were redirected and can set criteria on the opened screen and run it with 'Run'.",
    "      3. Also include the [Stock Balance Report](/stock/stock-balance) link in your reply.",
  );

  if (phase === "results-loading") {
    lines.push(
      "• SCREEN PHASE NOTICE: Table data is not ready yet; filter/analysis tools are temporarily unavailable. Inform user to try again once table finishes loading.",
    );
  }

  // Canlı ekran zemini: istemci her tur snapshot gönderir — model alet
  // çağırmadan güncel formu, seçili işi ve filtreleri görür.
  // FIELD GUIDE (evrensel, ekran bağımsız): state alanları ne demek.
  lines.push(
    "SCREEN STATE FIELD GUIDE:",
    "• scope = active screen/report id; criteria = live form draft (key = schema field);",
    "• focusedJob = currently selected execution (shortId + status); executions = recent jobs, newest first;",
    "• gridFilters = active table filters; custom = screen-defined extra values (see legend).",
  );
  const screenLegend = context?.stateLegend;
  if (screenLegend && Object.keys(screenLegend).length > 0) {
    lines.push(
      "SCREEN LEGEND (this screen defines its own fields):",
      ...Object.entries(screenLegend).map(([k, v]) => `• ${k}: ${v}`),
    );
  }
  // Kriter anahtar → başlık eşlemesi (digest varsa): ham anahtarlar anlam kazanır.
  const digestTitles = new Map<string, string>();
  const digest = context?.screen?.criteriaDigest;
  if (Array.isArray(digest)) {
    for (const entry of digest) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).key === "string"
      ) {
        const rec = entry as Record<string, unknown>;
        const title =
          typeof rec.title === "string" && rec.title ? rec.title : String(rec.key);
        digestTitles.set(String(rec.key), title);
      }
    }
  }
  const liveState = context?.screenState;
  if (liveState && typeof liveState === "object") {
    const bits: string[] = [];
    if (liveState.scope) bits.push(`scope=${liveState.scope}`);
    if (liveState.phase) bits.push(`phase=${liveState.phase}`);
    if (liveState.criteria && Object.keys(liveState.criteria).length > 0) {
      bits.push(
        `criteria={${Object.entries(liveState.criteria)
          .map(([k, v]) => {
            const title = digestTitles.get(k);
            return title && title !== k ? `${k} ("${title}"): "${v}"` : `${k}: "${v}"`;
          })
          .join(", ")}}`,
      );
    }
    if (liveState.focusedJob) {
      bits.push(`focusedJob=${liveState.focusedJob.id}(${liveState.focusedJob.status})`);
    }
    if (liveState.executions && liveState.executions.length > 0) {
      bits.push(
        `executions=[${liveState.executions.map((e) => `${e.id}(${e.status})`).join(", ")}]`,
      );
    }
    if (liveState.gridFilters && Object.keys(liveState.gridFilters).length > 0) {
      bits.push(
        `gridFilters={${Object.entries(liveState.gridFilters).map(([k, v]) => `${k}: "${v}"`).join(", ")}}`,
      );
    }
    if (liveState.custom && Object.keys(liveState.custom).length > 0) {
      bits.push(
        `custom={${Object.entries(liveState.custom).map(([k, v]) => `${k}: "${v}"`).join(", ")}}`,
      );
    }
    if (bits.length > 0) {
      lines.push(`LIVE SCREEN STATE: ${bits.join(" · ")}`);
    }
  }
  if (context?.screenDiff && context.screenDiff.length > 0) {
    lines.push(
      "SINCE LAST TURN (user changed the screen):",
      ...context.screenDiff.map((d) => `• ${d}`),
    );
  }

  const activeReportMeta =
    REGISTERED_REPORTS.find((r) => pathname.startsWith(r.pagePath)) ||
    (context?.screen?.reportScope ? findReport(context.screen.reportScope) : undefined);

  if (activeReportMeta && phase === "workspace") {
    const reportTitle = activeReportMeta.title;
    const scope = activeReportMeta.scope;
    // Tier-2 suggestion chips are built from THIS report's real schema fields
    // (never hardcoded field names): date field → last-7-days range chip,
    // first enum field → first-option chip.
    const chipFields = parseCriteriaSchema(activeReportMeta.fullSchema).fields;
    const chipDateKey = chipFields.find(
      (f) => f.format === "date" || Boolean(f.rangeSplit),
    )?.key;
    const chipEnumField = chipFields.find(
      (f) => (f.enumValues ?? []).length > 0,
    );
    const weekAgoStr = (() => {
      const d = new Date(`${todayStr}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return todayStr;
      d.setUTCDate(d.getUTCDate() - 7);
      return d.toISOString().slice(0, 10);
    })();
    const chipLines =
      chipDateKey && chipEnumField && (chipEnumField.enumValues ?? []).length > 0
        ? [
            `       • [Last 7 days](yula-criteria:${scope}?${chipDateKey}=${weekAgoStr}..${todayStr})`,
            `       • [${chipEnumField.title}: ${(chipEnumField.enumValues ?? [])[0]}](yula-criteria:${scope}?${chipDateKey}=${weekAgoStr}..${todayStr}&${chipEnumField.key}=${encodeURIComponent((chipEnumField.enumValues ?? [])[0])})`,
          ]
        : chipDateKey
          ? [
              `       • [Last 7 days](yula-criteria:${scope}?${chipDateKey}=${weekAgoStr}..${todayStr})`,
              `       • [Today](yula-criteria:${scope}?${chipDateKey}=${todayStr})`,
            ]
          : [];
    lines.push(
      "",
      `=== REPORT CRITERIA & EXECUTION SCREEN: ${reportTitle.toUpperCase()} (${activeReportMeta.pagePath}) ===`,
      `• This screen is the main run and criteria screen for ${reportTitle} (lists past executions and the criteria form).`,
      `• Active Report Scope: '${scope}'`,
      "• Registered Screen Tools: 'validate_criteria_input', 'get_current_criteria', 'apply_criteria', 'run_job', 'find_matching_report', 'open_last_report', 'get_report_schema', 'list_report_executions', 'cancel_job'.",
      "• INTENT ROUTING (first extract scope + criteria, then pick exactly one tool):",
      "  - Prepare-type requests ('prepare', 'get ready', 'same criteria'): NEVER ask the user whether to proceed. Chain: 1) read the live draft with 'get_current_criteria', 2) merge user values over draft values, 3) call 'find_matching_report' with the merged set. On 'matched/running' open via navigateTo; on 'no_match' fill the form via 'apply_criteria' and present the run confirmation bullet; on 'needs_criteria' ask only for the missing field.",
      "  - Latest job regardless of criteria ('open the last report', 'latest results'): call 'open_last_report'.",
      "  - New execution intent ('run', 'execute'): call 'run_job'.",
      "  - If 'find_matching_report' returns 'matched/running', open via navigateTo; on 'no_match' do not call 'run_job' without confirmation; on 'needs_criteria' ask for the missing field.",
      "• CRITERIA VERIFICATION (Criteria Input Engine):",
      "  - If the user asks about the on-screen form ('check the criteria', 'what is in the form?', 'any invalid fields?'): call 'get_current_criteria'.",
      "  - If the user provides new criteria and asks about validity ('is ABC* valid?', 'is 10..20 valid for the date?', 'validate the criteria'): call 'validate_criteria_input'.",
      "  - Present verification results in the user's language with clear sections (valid fields, errors, warnings, fix suggestions).",
      "• JOB LIFECYCLE:",
      "  - When the user asks about past jobs ('which reports ran', 'previous runs'): call 'list_report_executions'.",
      "  - When the user wants to cancel a running job ('stop the job', 'cancel it'): call 'cancel_job'.",
      "• CRITERIA FILL AND RUN PROTOCOL (3 tiers):",
      "  1. EXPLICIT FILL / UPDATE / EDIT INSTRUCTION (call apply_criteria):",
      "     - When the user explicitly asks to fill, update, or adjust criteria (e.g. 'update criteria to last week', 'fill in the criteria', 'write to the form', 'set the date to last month', 'adjust the criteria', 'apply suggestion 1', 'select yesterday', 'update', 'set date to yesterday'):",
      `     - This is NOT an incomplete intent; it is an explicit form-fill instruction. First read the live draft with 'get_current_criteria', merge the requested change while preserving values the user already set, then IMMEDIATELY call 'apply_criteria' with report: '${scope}' and the COMPLETE merged criteria object (all required schema fields included).`,
      "     - The form is updated and highlighted on screen. If the tool output lists 'missingRequired', ask the user explicitly for those fields (name each field with an example value). Only point to the 'Run' button when nothing is missing.",
      "  2. BARE VALUE ONLY / INCOMPLETE INTENT (no action verb at all; e.g. the user typed only 'last week', 'yesterday', 'ACTIVE' or 'what do you suggest' alone):",
      "     - With no action verb, do not fill the form and do not start a job.",
      "     - Offer 1-2 concrete yula-criteria suggestion chips built from this report's real criteria fields:",
      ...chipLines,
      "     - Clicking a chip fills the form; the user runs it with 'Run'.",
      "  3. EXPLICIT RUN INSTRUCTION (call run_job):",
      "     - Only on explicit run requests ('run', 'execute', 'start the job'; e.g. 'run the report', 'run it for last week'):",
      `     - Call the 'run_job' tool with report: '${scope}' and criteria.`,
      "     - 'prepare' / 'show' / 'fetch' are not run requests; do not start a job. (Language-specific verbs such as prepare/run equivalents in the user's language are defined by the active agent persona, not here.)",
      "  - RUN CONFIRMATION FORMAT: when criteria are ready and you need the user's go-ahead, present the confirmation as a separate bold bullet on its own line (e.g. '• **Run the report**'). Bold bullets are clickable and send the text back as a new user message. Never bury the confirmation inside a body sentence.",
  "  - CLICK CONTEXT: a user message starting with '[Analysis finding clicked]' or '[Analiz bulgusuna tıklandı]' means the user clicked an analysis finding — generate the SQL query that detects it (grounded in the REAL columns above), run it with 'run_expert_sql', and briefly explain the result. Never ask for clarification. If the click message names a source table, query THAT table (it overrides the active_view preference).",
      "  - AFTER run_job: 'executed' means the job was ACCEPTED AND QUEUED, not completed. Never claim success, loaded results, or 'no error'. Say the job is queued and point to the execution screen for live progress.",
      "  - If the user reports a failure, do not contradict them: check 'list_report_executions' for the job status and read the 'Failed' error text (or ask for the execution panel error) before responding.",
    );
  }

  if (phase === "results" && context?.grid) {
    lines.push(GRID_PRESENT_RULES);
    lines.push(SQL_EXPERT_RULES);
    lines.push(DATA_QUALITY_ANALYSIS_RULES);
    const playbookScope =
      context?.screen?.reportScope ??
      (context?.screen as { activeReportScope?: string } | null | undefined)
        ?.activeReportScope;
    const playbookMeta = playbookScope ? findReport(playbookScope) : undefined;
    const playbookTopics = playbookMeta
      ? readReportAiMetadata(playbookMeta.fullSchema).analysisTopics
      : undefined;
    if (playbookTopics && playbookTopics.length > 0) {
      lines.push(
        `DOMAIN ANALYSIS PLAYBOOK (${playbookMeta?.title ?? playbookScope}):`,
        ...playbookTopics.map(
          (t) =>
            `• [${t.id}] ${t.title}: ${t.goal} (tool: ${t.tool}${t.columns?.length ? `, columns: ${t.columns.join(", ")}` : ""}${t.followUp ? `; next: ${t.followUp}` : ""})`,
        ),
        "ITERATIVE ANALYSIS PROTOCOL (not one-shot):",
        "• First call profile_grid_table, then offer 2-3 topics as clickable bold bullets — prefer playbook topics matching observed signals, then data-driven signals.",
        "• When the user picks a topic (or chip), run its prescribed tool with the REAL column names above, report findings, then propose the follow-up as the next clickable bullet. Repeat until the user stops.",
        "• Without a playbook, derive topics from profile signals (nulls, negatives, skew, single-value columns) using the same bullet loop.",
      );
    } else {
      lines.push(
        "ITERATIVE ANALYSIS PROTOCOL (not one-shot):",
        "• First call profile_grid_table, then offer 2-3 investigation topics as clickable bold bullets derived from observed signals (nulls, negatives, skew, single-value columns).",
        "• When the user picks a topic, investigate with the matching tool, report findings, then propose the next step as a clickable bullet. Repeat until the user stops.",
      );
    }
    lines.push(SMART_SQL_QUERY_RULES);
    lines.push(DUCKDB_RULES);
    const isCustomActive = Boolean(context.grid.customQuerySql);
    const viewModeNotice = isCustomActive
      ? `VIEW MODE: CUSTOM QUERY / GROUPED VIEW ("${context.grid.customQueryTitle ?? "Custom Query"}").`
      : `VIEW MODE: BASE TABLE VIEW (No grouping, all detail rows active).`;

    const activeFiltersText =
      Object.keys(context.grid.filters ?? {}).length > 0
        ? `CURRENT ACTIVE FILTERS: ${JSON.stringify(context.grid.filters)}`
        : "CURRENT ACTIVE FILTERS: None (no filters are currently applied on screen).";

    const savedViewsNotice =
      context.grid.savedViews && context.grid.savedViews.length > 0
        ? `Saved DuckDB Views available for querying: ${context.grid.savedViews.map((v) => `${v.name} ("${v.title}")`).join(", ")}.`
        : null;

    const gridLines = [
      viewModeNotice,
      isCustomActive ? `ACTIVE CUSTOM QUERY SQL: ${context.grid.customQuerySql}` : null,
      `Active table: ${context.grid.tableName} · ${context.grid.rowCount ?? "?"} rows.`,
      `Active DuckDB View: "active_view" (Represents currently visible & filtered rows on screen. Prefer querying FROM active_view for questions about the active screen view).`,
      savedViewsNotice,
      `Columns: ${context.grid.columns.join(", ")}.`,
      activeFiltersText,
    ].filter(Boolean);

    // Şema grounding: model yalnızca GERÇEK kolon tipleriyle çalışsın.
    const typeEntries = Object.entries(context.grid.columnTypes ?? {}).filter(
      ([col]) => context.grid!.columns.includes(col),
    );
    if (typeEntries.length > 0) {
      gridLines.push(
        `Column types (from schema): ${typeEntries
          .map(([col, kind]) => `${col}:${kind}`)
          .join(", ")}.`,
      );
    }
    // Few-shot grounding: değer → kolon eşlemesi örnek veriyle yapılsın.
    if (context.grid.sampleRows?.length) {
      gridLines.push(
        `Sample rows: ${formatSampleRows(context.grid.sampleRows)}`,
      );
    }
    // Kardinalite sözlüğü: kategorik değeri uydurma, gerçeğini kullan.
    if (
      context.grid.columnValues &&
      Object.keys(context.grid.columnValues).length > 0
    ) {
      gridLines.push(
        `Real column values (use ONLY these exact values): ${formatColumnValues(context.grid.columnValues)}.`,
      );
    }
    // Yetkili kolon semantiği: rapor şeması tanımı — model kolon anlamını
    // tahmin etmesin ("kolonları açıkla" soruları bununla cevaplanır).
    if (
      context.grid.columnDescriptions &&
      Object.keys(context.grid.columnDescriptions).length > 0
    ) {
      gridLines.push(
        `Column descriptions (authoritative definitions from schema): ${formatColumnDescriptions(context.grid.columnDescriptions)}.`,
      );
    }

    gridLines.push(
      "DO NOT answer analysis/filter requests without calling the appropriate tool first. Greetings and small talk are answers, not tools.",
    );
    lines.push(gridLines.join(" "));
  } else if (phase !== "results" && phase !== "results-loading") {
    lines.push(GRID_ABSENT_RULES);
  }

  // Ajan oturumu + WORKSPACE fazı: "hazırla" tam hazırlık zinciridir
  // (doldur → yönlendir → çalıştırma onayı); salt-navigasyon yetmez.
  if (context?.agent && phase === "workspace") {
    lines.push("", AGENT_PREPARE_CHAIN_RULES);
  }

  if (context?.ragContext && context.ragContext.length > 0) {
    const hasRouterHit = context.ragContext.some(
      (item) =>
        typeof item.metadata === "object" &&
        item.metadata !== null &&
        (item.metadata as Record<string, unknown>).type === "report_router",
    );
    lines.push(
      "\nRELEVANT VECTOR RAG CONTEXT (Retrieved via WASM + All-MiniLM Vector Search):",
      ...context.ragContext.map(
        (item) =>
          ` • ${item.content}${item.distance != null ? ` (distance: ${item.distance.toFixed(3)})` : ""}`,
      ),
    );
    if (hasRouterHit) {
      lines.push(
        "ROUTING RULE: if a retrieved report-routing entry above matches the user's request better than the current screen, navigate there with 'navigate_to_page' (mention the redirect) instead of answering here.",
      );
    }
  }

  if (context?.userSkills && context.userSkills.length > 0) {
    lines.push(
      "\nUSER SKILLS (on-device slash commands defined by this user):",
      ...context.userSkills.map(
        (s) => ` • /${s.slash}: ${s.description || s.label}`,
      ),
      "To run one, call the 'run_user_skill' tool with its slash name and optional input. The tool returns the skill's full instructions — follow them with your tools. Never invent skill names; use only this list. When the user types /<name> explicitly, its instructions arrive as their message instead.",
    );
  }

  lines.push(
    "\nFINAL REMINDER: Write your final response text to the user in the user's active language.",
  );

  return lines.join("\n");
}
