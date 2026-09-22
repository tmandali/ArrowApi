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
  type SystemPromptSections,
  diffSystemPromptSections,
} from "@my-agent/core";
export { type SystemPromptSections, diffSystemPromptSections };
import {
  REGISTERED_REPORTS,
  findReport,
} from "@/features/reports/report-registry";
import { USER_AGENT_ATTACHMENTS_PROMPT_MAX_CHARS } from "@/lib/yula-user-agent";
import {
  extractJobIdFromHref,
} from "@/lib/workspace-paths";
import { formatLocalizedRelativeDateTerms } from "./yula-prompt-directives";
import {
  type YulaGridContext,
  type ResultGridMetaPayload,
  isResultGridMeta,
  resolveEffectiveGrid,
  formatGridPromptGrounding,
} from "@/features/jobs/components/report-grid/ai";
import { formatCriteriaPromptGrounding } from "@/features/report-criteria/ai";
import {
  type ArrowJobContext,
  type ArrowJobSummary,
  type ArrowJobLifecycleState,
  type YulaJobContext,
  type YulaActiveJobSummary,
  resolveEffectiveJobContext,
  formatJobEnginePromptGrounding,
  normalizeJobState,
  isTerminalJobState,
} from "@/features/jobs/ai";

export {
  type YulaGridContext,
  type ResultGridMetaPayload,
  isResultGridMeta,
  resolveEffectiveGrid,
  formatGridPromptGrounding,
  formatCriteriaPromptGrounding,
  type ArrowJobContext,
  type ArrowJobSummary,
  type ArrowJobLifecycleState,
  type YulaJobContext,
  type YulaActiveJobSummary,
  resolveEffectiveJobContext,
  formatJobEnginePromptGrounding,
  normalizeJobState,
  isTerminalJobState,
};

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
  /** Doğrulanmış Playbook kuralları (aktif ekran ve çalışma alanı bağlamında 0 ms enjeksiyon) */
  playbookRules?: string[];
  /** Mevcut Playbook tarif / iş akışları katalog özeti */
  playbookRecipes?: Array<{ title: string; summary: string }>;
}

const SYSTEM_PREAMBLE = [
  "ROLE & PERSONA:",
  'You are "Yula", an intelligent enterprise data analysis, querying, and reporting copilot.',
  "Provide concise, accurate, and actionable responses. Use Markdown formatting when helpful.",
  "",
  "VISUAL DIAGRAMS & WORKFLOW SCHEMAS (Mermaid):",
  "• When explaining multi-step business workflows, approval lifecycles, decision trees, state transitions, or entity relationships, illustrate them visually using Mermaid diagrams inside fenced code blocks (` ```mermaid ... ``` `).",
  "• Supported Mermaid diagram types: 'graph TD' / 'graph LR', 'flowchart TD', 'sequenceDiagram', 'stateDiagram-v2', 'erDiagram'.",
  "• The UI automatically renders these as interactive vector diagrams with zoom controls and a raw code switcher.",
  "• Keep diagrams concise, readable, and directly relevant to the user's business context.",
  "• SINGLE FINAL SYNTHESIS & NO PRE-TOOL ARTIFACTS: NEVER draw Mermaid diagrams in intermediate steps before or alongside tool calls. If tools are needed, execute them first. Render visual diagrams and workflows ONLY in your final synthesized response after all tool calls are completed.",
].join("\n");

const CORE_RULES = [
  "LANGUAGE DIRECTIVE & CHAT BUDGET:",
  "• Always write user-facing conversational answers, findings, and explanations in the user's active language (mirror the language of their latest message). Never force a single response language.",
  "• CHAT BUBBLE BUDGET (narrow dock): Keep user-visible replies SHORT. Prefer 1–3 short sentences, then at most 4 titled bullets. Do not write essays, first-person plans, or restatements of the user's request.",
  "• Greeting, thanks, or small talk: reply in the user's language immediately. Do not call any tool.",
  "• PERSISTENT PREFERENCES (remember_fact): When the user states a recurring habit or preference (e.g. 'ben her zaman Kadıköy mağazasına bakarım', 'always download as Excel'), call 'remember_fact' with type='preference' and scope='persistent'. Leverage recalled preferences with 'recall_fact' when applicable.",
  "",
  "CAUSAL REASONING & TRANSPARENCY:",
  "• When taking multi-step actions or asking user choices, briefly state your evaluated context (route, matched report, calculated date ranges) and decision rationale so that your causal reasoning is transparent. After tool results, summarize findings in the user's language.",
  "• When a tool produces output, summarize key insights and actionable findings for the user. Do not repeat raw data tables longer than 5 rows in chat text.",
  "",
  "GROUNDING, MISSING ASSETS & OUT-OF-SCOPE PROTOCOL:",
  "• MISSING ASSETS (Anti-Confabulation): If the user asks about or references an image, screenshot, attachment, file, or document (e.g. 'bu ne resmi', 'resimdeki sorun ne', 'bu PDF'i özetle') but NO image or file is present in their turn/context:",
  "  - Immediately state in the user's language that no image or file was received/attached.",
  "  - NEVER guess, invent, or substitute a description of the current screen/reports when an image or file was asked about.",
  "• SCREEN INTRODUCTION BOUNDARY: Only describe the current screen, its purpose, or list available reports if the user explicitly asks about the screen itself (e.g. 'bu ekran ne işe yarar', 'bu sayfa nedir', 'burada ne yapabilirim', 'what is this page').",
  "• OUT-OF-SCOPE & AMBIGUITY: If a user request is ambiguous, unclear, or outside enterprise data analysis/reporting capabilities, do NOT make assumptions or force ERP reporting summaries; instead, transparently state your limitation or ask a concise clarifying question (optionally using 'ask_user_choice').",
  "",
  "HUMAN-IN-THE-LOOP, SUSPENSION & STEERING PROTOCOL:",
  "• AUTONOMOUS STEERING DECISION: You decide whether you need user intervention, confirmation, or clarification before executing irreversible operations, ambiguous criteria, or multi-step plans. Clearly formulate your question, trade-offs, or proposed next steps in natural language in your response.",
  "• SEAMLESS RESUMPTION VIA STEERING: When awaiting human guidance, criteria, or a decision, formulate your question clearly (or offer structured options via 'ask_user_choice') and end your turn without invoking further action tools. Once the user provides their input or choice, do NOT halt with redundant approval questions; immediately continue your execution loop and carry out the task.",
  `• RELATIVE DATE EXPANSION: When the user specifies natural relative date terms (${formatLocalizedRelativeDateTerms()}), immediately calculate and expand them into exact ISO date ranges (e.g. '2026-09-07..2026-09-13') based on the Current Date. Do NOT ask clarifying questions for standard calendar terms like 'geçen hafta' or 'bu ay'.`,
  "• DATA-GROUNDED CHOICES ONLY: NEVER invent, fabricate, or hallucinate dummy/placeholder codes (such as 1000, 2000, 3000 or generic numbers). Options MUST always be grounded in real schema enums, actual company/store catalog entries, or concrete context data.",
  "• STEP-BY-STEP (DEPENDENT) CRITERIA GATHERING: When multiple criteria are required or when subsequent choices depend on earlier answers:",
  "  - Gather them step-by-step, asking ONE question per turn.",
  "  - As soon as the user responds, immediately apply it to the screen form via 'dispatch_component_action' (action='SET_FIELDS') with the received field so the user sees live progress.",
  "  - Formulate the next question based on the newly updated state, narrowing dependent choices dynamically.",
  "  - Once all required criteria are gathered, proceed directly to execution without asking redundant confirmation.",
  "• CONCISE SINGLE-LINE CHOICES & QUESTIONS: Ask questions or present choices at most ONCE per turn — never emit parallel or repeated calls in the same step. When you ask questions, write 1–2 short visible sentences in the user's language (what you found + why you are asking) — never leave the turn text empty or whitespace-only. If structured choices are provided, keep options concise, elegant, and expressed in a single line (e.g. 'Raporu Çalıştır', 'Filtreleri Düzenle', 'Vazgeç'). Options must provide a clear 'label' with optional brief 'description' and 'badge'.",
  "• After starting a report job (action='SUBMIT' or 'RUN'), write one short started/queued line starting with 📊 followed by the exact report title in the user's language (shape: '📊 <Exact Report Title> <Started-word>'); the results card renders automatically.",
  "• When navigating (component_id='app_router', action='NAVIGATE'), write 1 short visible sentence in the user's language explaining that the target screen is opening (e.g. 'Stok bakiye ekranını açıyorum...'). Never leave the turn text empty.",
  "",
  "CAUSAL ERROR RECOVERY & INTERVENTION PROTOCOL:",
  "• When a tool call encounters an error or empty result, analyze the root cause and execute an intelligent recovery step (e.g. adjust column names, inspect active schema with inspect_ui_state, or correct parameter values).",
  "• If an error cannot be resolved automatically (e.g. business logic constraint, record not found, permission denied), do NOT repeat the failing call or fabricate data. Summarize the issue in 1 concise sentence and call 'ask_user_choice' to offer actionable next steps (e.g. modify criteria, retry, or cancel).",
  "• When the user intervenes during execution (via inline Steer or follow-up), immediately pivot your plan and honor their latest direction without arguing or restarting from scratch.",
].join("\n");

const PLAYBOOK_PROTOCOL = [
  "PLAYBOOK PROCEDURAL KNOWLEDGE & GROUNDED WORKFLOW PROTOCOL (query_playbook & propose_playbook_update):",
  "• ERP OPERATIONAL WORKFLOWS & HOW-TO QUESTIONS: When the user asks how a multi-step ERP process or business workflow works (e.g. purchasing orders, approvals, goods receipt, invoicing, variance reconciliation):",
  "  1. Call 'query_playbook' with the user's business intent. The specialized Playbook Sub-Agent will perform semantic matchmaking against the corporate wiki and return verified DAG steps.",
  "  2. VERIFIED RECIPE FOUND: Present the concrete DAG steps, approval gates, and actual screen routes directly.",
  "  3. NO VERIFIED RECIPE (Anti-Confabulation / Grounded Fallback): NEVER invent a generic textbook essay or theoretical ungrounded lifecycle without connecting it to Sims ERP screens! Instead:",
  "     a. Transparently state in the user's language that no verified Playbook recipe exists yet for this organization/workspace.",
  "     b. Ground the explanation in actual Sims ERP modules and screen routes (e.g. Stock, Selling, Accounting, registered reports). If the module is not yet configured, state it honestly.",
  "     c. Keep any high-level operational outline concise (at most 3-4 bullets).",
  "     d. Proactively invoke 'ask_user_choice' to offer recording the organization's verified approval gates and steps into the Playbook (e.g. ['Playbook Reçetesi Oluştur', 'İlgili Ekrana Git', 'Vazgeç']).",
  "• Specific company/screen rules or custom workflow how-tos: Call 'query_playbook' to search verified procedural recipes.",
  "• When the user explicitly corrects a workflow, teaches a rule (e.g. 'bu ekranda filtreleri her zaman şöyle seç', 'bu raporda mağaza kodu boş bırakılamaz'): Call 'propose_playbook_update' with category='workflow_recipe' or 'screen_rule'.",
  "• For corrections or modifications: Call 'propose_playbook_update'.",
].join("\n");

import { registerYulaSkills, AGENT_PREPARE_CHAIN_RULES } from "./skills/yula-ui-skills";
export { registerYulaSkills, AGENT_PREPARE_CHAIN_RULES };

import {
  resolveActiveComponents,
  filterRelevantComponents,
} from "./yula-active-components";
export { resolveActiveComponents, filterRelevantComponents };

export function buildSystemPrompt(context?: YulaScreenContext): string {
  registerYulaSkills();
  const lines: string[] = [SYSTEM_PREAMBLE];

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

  // <rules>: Çekirdek işletim kuralları (invariants)
  lines.push("", "<rules>", CORE_RULES, "</rules>");

  // <playbook>: Prosedürel bilgi ve ERP iş akışı protokolü
  lines.push("", "<playbook>", PLAYBOOK_PROTOCOL, "</playbook>");

  const href = context?.pathname || context?.uiContext?.route || "/";
  const pathname = href.split("?")[0] || "/";
  const phase = context?.phase ?? "workspace";
  const jobId = context?.jobId ?? extractJobIdFromHref(href);
  const todayStr = new Date().toISOString().split("T")[0];

  const clientComps = context?.uiContext?.active_components;
  const rawComps: ComponentSchema[] =
    Array.isArray(clientComps) && clientComps.length > 0
      ? (clientComps as ComponentSchema[])
      : resolveActiveComponents(context);
  const activeComps = filterRelevantComponents(rawComps, context);
  const activeCompIds = activeComps.map((c) => c.id);

  const effectiveJob = resolveEffectiveJobContext(context, activeComps);
  const jobGrounding = formatJobEnginePromptGrounding(effectiveJob);

  const activeReport =
    REGISTERED_REPORTS.find((r) => pathname.startsWith(r.pagePath)) ||
    (context?.screen?.reportScope ? findReport(context.screen.reportScope) : undefined);

  lines.push(
    "",
    `• Current Date: ${todayStr} (Use for expanding relative date terms like today, yesterday, this month into ISO format)`,
    `• Current Route: ${pathname}`,
    "• Available Enterprise Modules: stock (/stock/*), selling (/selling/*), accounting (/accounting/*), manufacturing (/manufacturing/*), subcontracting (/subcontracting/*), financial-reports (/financial-reports/*)",
    activeReport
      ? `• Active Report Screen: "${activeReport.title}" (scope: "${activeReport.scope}", workspace: "${activeReport.workspace}")`
      : "",
    jobGrounding ?? (jobId ? `• Active Job Id: ${jobId}` : ""),
  );

  if (activeReport) {
    lines.push("", formatCriteriaPromptGrounding(activeReport));
  } else {
    lines.push(
      "",
      `GLOBAL ORCHESTRATION & PLAN-FIRST MODE:`,
      `• The user is at the global / workspace landing level (route: "${pathname}"). NO report criteria form or result grid is currently mounted on the DOM.`,
      `• NAVIGATION FAST-PATH: If the user simply asks to open or navigate to a page or report (e.g. 'beni stok bakiye raporuna götür', 'go to sales report', 'stok ekranını aç'):`,
      `  - Call dispatch_component_action with component_id="app_router" and action="NAVIGATE" directly in ONE step.`,
      `  - Do NOT ask for plan approval or propose multi-step confirmation for simple direct navigation.`,
      `• PLAN-FIRST FOR MULTI-STEP & ACTION REQUESTS: If the user requests running a report, performing analysis, or querying data from outside the screen:`,
      `  1. Do NOT call 'SUBMIT' or 'SET_FIELDS' directly on criteria_form, as no form is mounted on this page.`,
      `  2. Identify the target report and resolve criteria (e.g. date range, store/company codes).`,
      `  3. If mandatory criteria are missing, ask ONLY for that missing criteria (e.g. 'Hangi şirket koduyla devam edelim?').`,
      `  4. When the user provides the answer or missing criteria, do not ask for redundant approval; immediately continue execution (e.g. navigate to the screen and run, or perform the requested action).`,
      `  5. ALWAYS write 1 short visible sentence in the user's language announcing navigation (e.g. '🚀 Perakende Satış Raporu açılıyor...'). Never leave the turn text empty.`,
      `  6. Never invent fictitious reports or codes; ground targets in registered catalog routes.`,
    );
  }

  // 0. DOĞRULANMIŞ PLAYBOOK KURALLARI & PROSEDÜREL BİLGİLER (LLM Wiki / Playbook)
  if (context?.playbookRules && context.playbookRules.length > 0) {
    lines.push(
      "",
      "=== VERIFIED PLAYBOOK RULES (Company / Screen Guidelines) ===",
      "Follow these established organizational rules strictly for this screen and workspace:",
      ...context.playbookRules.map((rule) => `• ${rule}`),
    );
  }

  if (context?.playbookRecipes && context.playbookRecipes.length > 0) {
    lines.push(
      "",
      "=== PLAYBOOK RECIPES (Available Procedural Workflows) ===",
      ...context.playbookRecipes.map((r) => `• ${r.title}: ${r.summary}`),
    );
  }

  // 1. DİNAMİK BİLEŞEN SÖZLEŞMELERİ (@my-agent/core formatActiveComponentsPrompt)
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

  // 3. Tablo açıkken canlı veri ve DuckDB şema grounding'i (Virtual Grid AI)
  const effectiveGrid = resolveEffectiveGrid(context, activeComps);

  if ((phase === "results" || effectiveGrid) && effectiveGrid) {
    lines.push("", formatGridPromptGrounding(effectiveGrid));
  }

  // 4. Ring Buffer UI Olayları Telemetrisi
  const recentEvents = context?.uiContext?.recent_events;
  if (Array.isArray(recentEvents) && recentEvents.length > 0) {
    lines.push(
      "",
      "RECENT UI TELEMETRY EVENTS (LATEST PER TOPIC / STATE):",
      JSON.stringify(recentEvents, null, 2),
      "(Note: Use inspect_ui_state tool with { topic, event_type, correlation_id, min_severity } to inspect deeper historical events if needed.)"
    );
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
