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
  isWorkspaceHomePath,
  workspaceIdFromPath,
  workspaceLabelFromPath,
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
  "INTERACTIVE QUESTIONS & CONFIRMATION PROTOCOL (ask_user_choice):",
  `• RELATIVE DATE EXPANSION: When the user specifies natural relative date terms (${formatLocalizedRelativeDateTerms()}), immediately calculate and expand them into exact ISO date ranges (e.g. '2026-09-07..2026-09-13') based on the Current Date. Do NOT ask clarifying questions or choices for standard calendar terms like 'geçen hafta' or 'bu ay'.`,
  "• ONLY call 'ask_user_choice' when mandatory criteria (such as required company or store code) are genuinely missing or when the user explicitly requests alternatives/confirmation.",
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
    meta: { description: "Sayfa ve Rota Yönlendirici" },
    actions: {
      NAVIGATE: {
        description: "Kullanıcıyı hedef sayfaya/rapora yönlendirir ({ path }).",
        whenToCall: "Kullanıcı başka bir rapor veya sayfaya gitmek istediğinde.",
        whenNotToCall: "Kullanıcı zaten o ekrandayken.",
      },
    },
  });

  comps.push({
    id: "job_history",
    capabilities: ["OPEN_LAST", "LIST", "FIND", "CANCEL"],
    meta: { description: "Rapor Çalışma Geçmişi ve İş Takibi" },
    actions: {
      OPEN_LAST: {
        description: "En son tamamlanan rapor sonucunu ekranda açar.",
        whenToCall: "Kullanıcı 'son raporu aç', 'en son sonucu göster' dediğinde.",
        whenNotToCall: "Yeni bir rapor çalıştırılmak istendiğinde.",
      },
      LIST: {
        description: "Geçmiş işleri listeler.",
        whenToCall: "Kullanıcı 'hangi raporlar çalıştı', 'geçmiş' dediğinde.",
        whenNotToCall: "Mevcut rapor incelenirken.",
      },
      CANCEL: {
        description: "Çalışmakta olan işi iptal eder ({ jobId }).",
        whenToCall: "Kullanıcı 'durdur', 'iptal et' dediğinde.",
        whenNotToCall: "İş zaten tamamlanmışken.",
      },
    },
  });

  // 2. RESULTS Evresi: Sonuç Tablosu Ekranda Mount Durumda
  if (phase === "results" && context?.grid) {
    comps.push({
      id: "result_grid:active",
      meta: {
        description: `Canlı Sonuç Tablosu (${context.grid.tableName || "active_view"}) - ${context.grid.rowCount ?? "?"} satır, Kolonlar: ${(context.grid.columns || []).join(", ")}`,
        tableName: context.grid.tableName,
        columns: context.grid.columns,
        filters: context.grid.filters,
      },
      actions: {
        RUN_SQL: {
          description: "DuckDB 'active_view' üzerinde salt-okunur SQL sorgusu çalıştırır ({ query }).",
          whenToCall: "Kullanıcı tablodaki verilerle ilgili hesaplama, top N, ortalama veya özel analiz istediğinde.",
          whenNotToCall: "Basit filtreleme veya sıralama için (FILTER veya SORT tercih edilmeli).",
        },
        QUERY: {
          description: "Grid görünümünü SQL ile günceller / türetilmiş görünüm açar ({ query }).",
          whenToCall: "Kullanıcı türetilmiş kolonlar veya gruplanmış tablo görünümü istediğinde.",
          whenNotToCall: "Sadece filtre veya sıralama değiştirilirken.",
        },
        FILTER: {
          description: "Kolona filtre uygular ({ field, value, op }).",
          whenToCall: "Kullanıcı tek bir kolonda değer süzmek istediğinde.",
          whenNotToCall: "Çoklu filtre uygulanırken (APPLY_FILTERS kullanılmalı).",
        },
        SORT: {
          description: "Kolonu artan veya azalan sırada sıralar ({ column, direction }).",
          whenToCall: "Kullanıcı sıralama istediğinde.",
          whenNotToCall: "Tablo henüz hazır değilken.",
        },
        EXPORT: {
          description: "Tabloyu dışa aktarır ({ format: 'xlsx'|'parquet'|'csv'|'gz' }).",
          whenToCall: "Kullanıcı 'indir', 'excel yap', 'csv al' dediğinde.",
          whenNotToCall: "Sadece veriyi ekranda görmek istediğinde.",
        },
        PROFILE: {
          description: "Tablo kolonlarının null sayıları, kardinalite ve anomalilerini analiz eder.",
          whenToCall: "Kullanıcı '/analiz' dediğinde veya veri anomalilerini incelemek istediğinde.",
          whenNotToCall: "Kullanıcı sadece belirli bir satırı ararken.",
        },
        VISUALIZE: {
          description: "Tablo verisini grafik olarak görselleştirir ({ type, dimension, metric }).",
          whenToCall: "Kullanıcı grafik veya çizelge istediğinde.",
          whenNotToCall: "Tabloda sayısal metrik yokken.",
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
    const reportTitle = activeReport?.title ?? "Rapor";

    comps.push({
      id: `criteria_form:${scope}`,
      meta: {
        description: `${reportTitle} Kriter Formu`,
        scope,
        criteriaDraft: (context as any)?.screenState?.criteria ?? (context?.uiContext as any)?.criteria,
      },
      actions: {
        SET_FIELDS: {
          description: "Kriter formuna değerleri yazar ve günceller ({ criteria }).",
          whenToCall: "Kullanıcı mağaza, tarih veya filtre kriteri belirtip doldurmak istediğinde.",
          whenNotToCall: "Kullanıcı doğrudan raporu çalıştırmak istediğinde (SUBMIT/RUN çağrılmalı).",
        },
        APPLY: {
          description: "Kriter formuna değerleri yazar ve günceller ({ criteria }).",
          whenToCall: "Kullanıcı mağaza, tarih veya filtre kriteri belirtip doldurmak/seçmek istediğinde.",
          whenNotToCall: "Kullanıcı doğrudan raporu çalıştırmak istediğinde (SUBMIT/RUN çağrılmalı).",
        },
        SUBMIT: {
          description: "Raporu kriterlerle çalıştırıp işi kuyruğa alır ({ criteria, report }).",
          whenToCall: "Kullanıcı açıkça 'çalıştır', 'başlat', 'al', 'raporu al', 'raporunu al', 'getir' dediğinde.",
          whenNotToCall: "Zorunlu alanlar eksikken veya kullanıcı sadece kriter taslağını düzenlerken.",
        },
        RUN: {
          description: "Raporu kriterlerle çalıştırıp işi kuyruğa alır ({ criteria, report }).",
          whenToCall: "Kullanıcı açıkça 'çalıştır', 'başlat', 'al', 'raporu al', 'raporunu al', 'getir' dediğinde.",
          whenNotToCall: "Zorunlu alanlar eksikken veya kullanıcı sadece kriter taslağını düzenlerken.",
        },
        VALIDATE: {
          description: "Girilen kriterlerin şemaya uygunluğunu doğrular ({ criteria }).",
          whenToCall: "Kullanıcı kriterlerin geçerli olup olmadığını sorduğunda.",
          whenNotToCall: "Kullanıcı doğrudan çalıştırmak istediğinde.",
        },
        READ: {
          description: "Formdaki mevcut kriter taslağını okur.",
          whenToCall: "Mevcut form durumunu öğrenmek veya değer birleştirmek (merge) gerektiğinde.",
          whenNotToCall: "Kullanıcı doğrudan rapor çalıştırma ('al', 'çalıştır', 'başlat') istediğinde veya yeni değer atarken.",
        },
        SCHEMA: {
          description: "Raporun alan tanımlarını ve şemasını okur.",
          whenToCall: "Form alanlarının tiplerini ve seçeneklerini öğrenmek gerektiğinde.",
          whenNotToCall: "Alanlar zaten biliniyorken.",
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
  const isMainHome = isWorkspaceHomePath(pathname);
  const mode = context?.mode ?? (isMainHome ? "main" : "dock");
  const wsId = context?.workspaceId ?? workspaceIdFromPath(pathname);
  const wsLabel = context?.workspaceLabel ?? workspaceLabelFromPath(pathname);
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
