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
  buildSystemPromptSections,
  renderPromptSections,
  diffSystemPromptSections,
} from "@my-agent/core";
export {
  type SystemPromptSections,
  buildSystemPromptSections,
  renderPromptSections,
  diffSystemPromptSections,
};
import { USER_AGENT_ATTACHMENTS_PROMPT_MAX_CHARS } from "@/lib/yula-user-agent";
import {
  extractJobIdFromHref,
  formatPathnameLabel,
} from "@/lib/workspace-paths";
import { getAllWorkspaces } from "@/lib/workspace-registry";
import { formatLocalizedRelativeDateTerms } from "./yula-prompt-directives";
import {
  type YulaGridContext,
  type ResultGridMetaPayload,
  isResultGridMeta,
  resolveEffectiveGrid,
} from "@/features/jobs/components/report-grid/ai";
import {
  type ArrowJobContext,
  type ArrowJobSummary,
  type ArrowJobLifecycleState,
  type YulaJobContext,
  type YulaActiveJobSummary,
  resolveEffectiveJobContext,
  normalizeJobState,
  isTerminalJobState,
} from "@/features/jobs/ai";

export {
  type YulaGridContext,
  type ResultGridMetaPayload,
  isResultGridMeta,
  resolveEffectiveGrid,
  type ArrowJobContext,
  type ArrowJobSummary,
  type ArrowJobLifecycleState,
  type YulaJobContext,
  type YulaActiveJobSummary,
  resolveEffectiveJobContext,
  normalizeJobState,
  isTerminalJobState,
};

export function resolveScreenTitle(
  pathname: string,
  contextScreen?: { screenTitle?: string } | null,
): string {
  if (contextScreen?.screenTitle && contextScreen.screenTitle !== "screen") {
    return contextScreen.screenTitle;
  }
  return formatPathnameLabel(pathname) || pathname;
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
  /** Doğrulanmış Playbook kuralları (aktif ekran ve çalışma alanı bağlamında 0 ms enjeksiyon) */
  playbookRules?: string[];
  /** Mevcut Playbook tarif / iş akışları katalog özeti */
  playbookRecipes?: Array<{ title: string; summary: string }>;
  /** Kullanıcının oturum boyunca gezindiği ekranların kronolojik izi ve çıkış anlık görüntüleri */
  screenJourney?: import("@/lib/stores/screen-journey-store").ScreenJourneyEntry[];
}

const SYSTEM_PREAMBLE = [
  "ROLE & PERSONA:",
  'You are "Yula", an intelligent enterprise data analysis, querying, and reporting copilot.',
  "Provide concise, accurate, and actionable responses in the user's active language. Use Markdown formatting when helpful.",
  "",
  "VISUAL DIAGRAMS (Mermaid):",
  "• When explaining multi-step business workflows, approval lifecycles, or state transitions, illustrate them visually using Mermaid diagrams (` ```mermaid ... ``` `) in your final synthesized response.",
].join("\n");

const CORE_RULES = [
  "LANGUAGE DIRECTIVE & CHAT BUDGET:",
  "• Always write user-facing conversational answers, findings, and explanations in the user's active language (mirror the language of their latest message). Never force a single response language.",
  "• CHAT BUBBLE BUDGET: Keep user-visible replies SHORT (prefer 1–3 short sentences, then at most 4 titled bullets). Greeting or small talk: reply in the user's language immediately without calling tools.",
  "• PERSISTENT PREFERENCES (remember_fact): When the user states a recurring habit or preference (e.g. 'ben her zaman Kadıköy mağazasına bakarım', 'always download as Excel'), call 'remember_fact' with type='preference' and scope='persistent'. Leverage recalled preferences with 'recall_fact'.",
  "",
  "GROUNDING, MISSING ASSETS & OUT-OF-SCOPE PROTOCOL:",
  "• LIVE UI STATE VS CONVERSATION HISTORY: Ground responses in the Current Route and mounted active components. When targeting unknown screens, call 'explore_context' to investigate contracts.",
  "• MISSING ASSETS (Anti-Confabulation): If an attachment, screenshot, or image was asked about but none is present, state in the user's language that no file was received; never hallucinate contents.",
  "• SCREEN INTRODUCTION BOUNDARY: Only describe the current screen, its purpose, or list available reports if the user explicitly asks about the screen itself.",
  "",
  "HUMAN-IN-THE-LOOP, SUSPENSION & STEERING PROTOCOL:",
  "• AUTONOMOUS STEERING DECISION & SEAMLESS RESUMPTION VIA STEERING: You decide whether you need user intervention. When awaiting human choices, input, or confirmation, invoke 'ask_user_choice' with structured single-line options to suspend the turn. In your turn text, write 1 short visible sentence explaining the context; never leave the turn text empty. DATA-GROUNDED CHOICES ONLY: NEVER invent dummy/placeholder codes (such as 1000, 2000, 3000).",
  `• RELATIVE DATE EXPANSION: When the user specifies natural relative date terms (${formatLocalizedRelativeDateTerms()}), expand them into exact ISO date ranges based on Current Date. Do NOT ask clarifying questions for standard calendar terms like 'geçen hafta' or 'bu ay'.`,
  "• STEP-BY-STEP (DEPENDENT) CRITERIA GATHERING: When multiple criteria are required, gather them step-by-step with ONE question per turn via 'ask_user_choice', narrowing dependent choices dynamically. Ask choices at most ONCE per turn.",
  "• When navigating, call 'app_router:NAVIGATE' with 1 short visible sentence announcing navigation; never leave the turn text empty.",
  "",
  "CAUSAL ERROR RECOVERY & INTERVENTION PROTOCOL:",
  "• On tool error, analyze the root cause and execute a recovery step, or summarize concisely and call 'ask_user_choice' for actionable next steps.",
].join("\n");

const PLAYBOOK_PROTOCOL = [
  "PLAYBOOK PROCEDURAL KNOWLEDGE & GROUNDED WORKFLOW PROTOCOL (query_playbook & propose_playbook_update):",
  "• ERP OPERATIONAL WORKFLOWS: When the user asks about multi-step ERP processes, query playbooks via 'query_playbook' to retrieve verified DAG steps.",
  "• NO VERIFIED RECIPE (Anti-Confabulation / Grounded Fallback): If no verified recipe exists, state it transparently; ground explanations in real Sims ERP modules and offer 'ask_user_choice' to record verified steps.",
  "• WORKFLOW CORRECTIONS: Propose lessons learned via 'propose_playbook_update' (category='workflow_recipe' or 'screen_rule').",
].join("\n");

import { registerYulaSkills, AGENT_PREPARE_CHAIN_RULES } from "./skills/yula-ui-skills";
export { registerYulaSkills, AGENT_PREPARE_CHAIN_RULES };

import {
  resolveActiveComponents,
  filterRelevantComponents,
} from "./yula-active-components";
export { resolveActiveComponents, filterRelevantComponents };

/**
 * Assembles structured, prefix-cache friendly prompt sections according to Pi specifications.
 */
export function buildYulaSystemPromptSections(context?: YulaScreenContext): SystemPromptSections {
  registerYulaSkills();

  // Preamble & Level 0 persona
  let preamble = SYSTEM_PREAMBLE;
  if (context?.agent) {
    const personaLines: string[] = [
      `=== LEVEL 0: ACTIVE AGENT PERSONA (${context.agent.name}) ===`,
      context.agent.instructions,
      "Precedence is limited to tone and task priorities: keep the persona's tone and priorities in EVERY reply — including greetings and small talk (greet as the persona, briefly state who you are and how you can help in your domain). Never fall back to a generic assistant voice. The safety rules below are NOT overridden by this persona: phase walls (RESULTS vs WORKSPACE separation, no unapproved execution [action='RUN']) and tool allowlists still bind every reply.",
    ];
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
      personaLines.push(
        "",
        "Agent reference documents (read-only context, follow when relevant):",
        ...parts,
      );
    }
    preamble = `${SYSTEM_PREAMBLE}\n\n${personaLines.join("\n")}`;
  }

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
  const activeJobId = effectiveJob?.activeJobId || jobId;

  const mountedScreenComp = activeComps.find(
    (c) =>
      c.id.startsWith("criteria_form:") ||
      c.id.startsWith("entity_form:") ||
      c.id.startsWith("screen_contract") ||
      Boolean(c.actions && ("SET_CRITERIA" in c.actions || "EXECUTE_REPORT" in c.actions || "SET_FIELDS" in c.actions))
  );

  const activeScope =
    context?.screen?.reportScope ||
    (mountedScreenComp?.id.startsWith("criteria_form:")
      ? mountedScreenComp.id.replace("criteria_form:", "")
      : undefined);

  const screenTitle =
    (mountedScreenComp?.meta?.screenTitle as string) ||
    context?.screen?.screenTitle ||
    resolveScreenTitle(pathname, context?.screen);

  const modulesSummary = getAllWorkspaces()
    .filter((ws) => ws.id !== "system")
    .map((ws) => `${ws.id} (${ws.rootPath}/*)`)
    .join(", ");

  const activeContextLines: string[] = [
    `• Current Date: ${todayStr} (Use for expanding relative date terms like today, yesterday, this month into ISO format)`,
    `• Current Route: ${pathname}`,
    modulesSummary ? `• Available Enterprise Modules: ${modulesSummary}` : "",
    activeScope
      ? `• Active Report Screen: "${screenTitle}" (scope: "${activeScope}"${context?.workspaceId ? `, workspace: "${context.workspaceId}"` : ""})`
      : `• Active Screen: "${screenTitle}" (route: "${pathname}")`,
    activeJobId ? `• Active Job Id: ${activeJobId}` : "",
  ].filter(Boolean);

  if (mountedScreenComp || activeScope) {
    const targetId = mountedScreenComp?.id || (activeScope ? `criteria_form:${activeScope}` : "criteria_form");
    activeContextLines.push(
      "",
      `ACTIVE SCREEN CONTEXT (${screenTitle}${activeScope ? ` — ${activeScope}` : ""}):`,
      `• The user is currently on "${screenTitle}"${activeScope ? ` (scope: "${activeScope}")` : ""}. NEVER ask which screen or report they mean.`,
      `• DIRECT EXECUTION MODE: The component "${targetId}" is active on the screen. Invoke component actions directly when criteria are ready.`,
    );
  } else {
    activeContextLines.push(
      "",
      `GLOBAL ORCHESTRATION & PLAN-FIRST MODE:`,
      `• The user is on "${screenTitle}" (route: "${pathname}"). NO report criteria form is mounted on the DOM.`,
      `• NAVIGATION FAST-PATH: If the user asks to open or navigate to a page or report, call dispatch_component_action with component_id="app_router" and action="NAVIGATE" directly in ONE step.`,
      `• PLAN-FIRST FOR MULTI-STEP: When requested to run reports from outside the screen, navigate to the target screen directly; the target screen mounts its own ScreenContract just-in-time.`,
    );
  }

  // Playbook rules & recipes
  const pbRules: string[] = [];
  if (context?.playbookRules && context.playbookRules.length > 0) {
    pbRules.push(
      "=== VERIFIED PLAYBOOK RULES (Company / Screen Guidelines) ===",
      "Follow these established organizational rules strictly for this screen and workspace:",
      ...context.playbookRules.map((rule) => `• ${rule}`),
    );
  }
  if (context?.playbookRecipes && context.playbookRecipes.length > 0) {
    pbRules.push(
      "",
      "=== PLAYBOOK RECIPES (Available Procedural Workflows) ===",
      ...context.playbookRecipes.map((r) => `• ${r.title}: ${r.summary}`),
    );
  }

  const customSections: Record<string, string> = {
    playbook: PLAYBOOK_PROTOCOL,
  };

  // 1. Ekran Kuralları (Active Screen Domain Guidelines)
  const screenGuidelines: string[] = [];
  for (const comp of activeComps) {
    const gl = comp.meta?.promptGuidelines;
    if (Array.isArray(gl) && gl.length > 0) {
      screenGuidelines.push(...gl);
    }
  }
  if (screenGuidelines.length > 0) {
    customSections.screen_guidelines = [
      "=== ACTIVE SCREEN DOMAIN GUIDELINES ===",
      "Strict domain rules for the currently active screen component:",
      ...screenGuidelines.map((g) => `• ${g}`),
    ].join("\n");
  }

  // 2. Çift Yönlü Canlı DOM Durum Aynalaması (Live Screen State Mirror)
  const liveStates: string[] = [];
  for (const comp of activeComps) {
    const rawState =
      comp.meta?.state && typeof comp.meta.state === "object"
        ? comp.meta.state
        : (comp.meta?.tableName || comp.meta?.jobId ? comp.meta : undefined);
    if (rawState && typeof rawState === "object") {
      liveStates.push(
        `• [${comp.id} (${(comp.meta?.screenTitle as string) || "Screen"})]: ${JSON.stringify(rawState)}`
      );
    }
  }
  if (liveStates.length > 0) {
    customSections.live_screen_state = [
      "=== LIVE SCREEN STATE (Real-time DOM State Mirror) ===",
      "The following state represents the exact, real-time values and selection currently mounted in the user's browser DOM:",
      ...liveStates,
    ].join("\n");
  }

  // 3. Çoklu Ekran Oturum Geçmişi (Session Screen Journey Breadcrumbs)
  const journeyComp = activeComps.find((c) => c.id === "session_journey");
  const journey = context?.screenJourney || (journeyComp?.meta?.trail as any);
  if (Array.isArray(journey) && journey.length > 0) {
    const trail = journey.map((visit: any) => {
      const duration = visit.exitedAt ? `${Math.round((visit.exitedAt - visit.enteredAt) / 1000)}s` : "active";
      const snapshot = visit.exitSnapshot ? ` - Exit Snapshot: ${JSON.stringify(visit.exitSnapshot)}` : "";
      return ` • [${visit.screenTitle || visit.route}] (visited for ${duration})${snapshot}`;
    });
    customSections.session_screen_journey = [
      "=== SESSION SCREEN JOURNEY (Previously Visited Screens & Historical Artifacts) ===",
      "The user previously visited these screens during this session. Note: previous DOM components are UNMOUNTED; only the Current Live Screen components can receive actions.",
      ...trail,
    ].join("\n");
  }

  // session_journey'yi araç bloklarından gizle; sadece semantik bağlam olarak kalsın
  const promptComps = activeComps.filter((c) => c.id !== "session_journey");
  const activeCompsPrompt = formatActiveComponentsPrompt(promptComps);
  if (activeCompsPrompt) {
    customSections.active_components = activeCompsPrompt;
  }

  const skillsPrompt = skillsManager.formatSkillsPrompt(pathname, activeCompIds);
  const prepareChain = context?.agent && phase === "workspace" ? AGENT_PREPARE_CHAIN_RULES : "";
  if (skillsPrompt || prepareChain) {
    customSections.skills = [skillsPrompt, prepareChain].filter(Boolean).join("\n\n");
  }

  const telemetryParts: string[] = [];
  const recentEvents = context?.uiContext?.recent_events;
  if (Array.isArray(recentEvents) && recentEvents.length > 0) {
    telemetryParts.push(
      "RECENT UI TELEMETRY EVENTS (LATEST PER TOPIC / STATE):",
      JSON.stringify(recentEvents, null, 2),
      "(Note: Use inspect_ui_state tool with { topic, event_type, correlation_id, min_severity } to inspect deeper historical events if needed.)",
    );
  }

  if (context?.ragContext && context.ragContext.length > 0) {
    telemetryParts.push(
      "\nRELEVANT VECTOR RAG CONTEXT:",
      ...context.ragContext.map(
        (item) => ` • ${item.content}${item.distance != null ? ` (distance: ${item.distance.toFixed(3)})` : ""}`,
      ),
    );
  }

  if (context?.userSkills && context.userSkills.length > 0) {
    telemetryParts.push(
      "\nUSER SKILLS (on-device slash commands defined by this user):",
      ...context.userSkills.map((s) => ` • /${s.slash}: ${s.description || s.label}`),
      "When the user types /<name> explicitly or selects a skill, its instructions arrive as their message. Follow those skill instructions using your active component actions.",
    );
  }
  if (telemetryParts.length > 0) {
    customSections.telemetry_context = telemetryParts.join("\n");
  }

  return buildSystemPromptSections({
    preamble,
    rules: [CORE_RULES],
    playbookRules: pbRules.length > 0 ? pbRules : undefined,
    activeContext: activeContextLines.join("\n"),
    customSections,
  });
}

export function buildSystemPrompt(context?: YulaScreenContext): string {
  const sections = buildYulaSystemPromptSections(context);
  return renderPromptSections(sections);
}
