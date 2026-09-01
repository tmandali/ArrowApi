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
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/DuckDB şemasından (şema grounding) */
  columnTypes?: Record<string, string>;
  /** İlk örnek satırlar — model değerleri gerçek veri dokusuyla eşlesin (few-shot grounding) */
  sampleRows?: Array<Record<string, unknown>>;
  /** Düşük kardinaliteli kolonların gerçek değerleri (DuckDB DISTINCT) — değer uydurma savunması */
  columnValues?: Record<string, string[]>;
  /** Kolon → yetkili semantik tanım (rapor şeması x-ai.columnDescriptions) */
  columnDescriptions?: Record<string, string>;
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
  grid?: YulaGridContext | null;
  /** DuckDB WASM + All-MiniLM RAG Vektör arama sonuçları */
  ragContext?: YulaRagContextItem[];
}

import { REGISTERED_REPORTS as DEMO_REPORTS } from "@/features/reports/report-registry";
import {
  isWorkspaceHomePath,
  workspaceIdFromPath,
  workspaceLabelFromPath,
} from "@/lib/workspace-paths";

const BASE_PROMPT = [
  "ROLE & PERSONA:",
  'You are "Yula", an intelligent enterprise data analysis, querying, and reporting copilot.',
  "Provide concise, accurate, and actionable responses. Use Markdown formatting when helpful.",
  "",
  "LANGUAGE DIRECTIVE:",
  "• You MUST write all user-facing conversational answers, findings, and explanations strictly in natural, professional TURKISH (Türkçe).",
  "• Internal reasoning inside <think>...</think> can be in English or Turkish.",
  "",
  "THINKING & REASONING PROTOCOL:",
  "• When thinking mode is enabled, ALWAYS begin your response with step-by-step internal reasoning enclosed in <think>...</think> tags.",
  "• In your thinking, analyze user intent, inspect active screen context, table schema, and plan the necessary tool calls or calculations.",
  "• Immediately after the closing </think> tag, execute the planned tool call(s) and/or provide the final user-facing Turkish response. Never get stuck in thoughts without triggering the planned tool.",
  "",
  "TOOL EXECUTION PRINCIPLES:",
  "• The tools provided in each turn represent your complete capabilities for the active screen. Use them whenever an action or data query is requested.",
  "• Do NOT announce tool execution in conversational text (e.g. avoid 'Starting query now...'). Execute the tool directly.",
  "• When a tool produces output, summarize key insights and actionable findings for the user. Do not repeat raw data tables longer than 5 rows in chat text.",
  "• Avoid duplicate tool calls with identical parameters in the same conversation turn.",
  "",
  "RECOMMENDATIONS & NEXT STEPS FORMATTING PROTOCOL:",
  "• When suggesting next steps or recommendations (e.g. 'İsterseniz şunları yapabilirim:'), NEVER output plain sentence fragments, orphaned sub-bullets, or multi-level indented lists without titles.",
  "• ALWAYS format EVERY suggestion as a single-level bold-titled bullet with a colon: '• **<Aksiyon Başlığı>**: <Kısa açıklama>'.",
  "• Examples:",
  "  - '• **Problemli Kayıtları Filtrele**: Boş parti numaralı satırları ekranda listeler.'",
  "  - '• **Depo Bazında Dağılım**: Depo stok toplamlarını gride yansıtır.'",
  "  - '• **Toplam Tutar Analizi**: Qty * UnitPrice hesaplanmış kolonunu tabloya ekler.'",
  "  - '• **Grafik ile Özetle**: Depo ve ürün bazında görsel dağılım kartı oluşturur.'",
  "",
  "HUMAN-IN-THE-LOOP (HITL) CONFIRMATION:",
  "• For destructive, bulk-modifying, or critical operations, use 'request_user_confirmation' before proceeding.",
].join("\n");

const REPORTS_DIGEST_LINES = DEMO_REPORTS.map((r) => {
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
  "• set_grid_query: Use when user asks for custom views, calculations, derived columns (e.g. Total = Qty * UnitPrice), grouping, aggregations, or column renaming/aliasing. Write valid DuckDB SELECT queries referencing the active table name. Use { reset: true } to restore the default table view.",
  "• filter_current_grid: Use for row-level filtering by column values, thresholds, ranges, or empty/non-empty states. Pass D365 filter expressions as-is (e.g. '>50', '100..500', 'SKU*'). Use field: '*' to clear all filters.",
  "• visualize_grid_data: Use when user requests charts (bar, line, pie), visual trends, or distributions. Provide dimension and metric columns; do not write raw data in text.",
  "• analyze_grid_data: Use for fast KPI aggregates (sum, avg, min, max, count, topN) on numeric columns.",
  "• profile_grid_table: Use when user asks for deep data profiling, quality checks, anomaly detection, or statistical distributions.",
  "• run_expert_sql: Use for advanced read-only analytical SQL queries (window functions, ratios, complex joins) that cannot be expressed as grid filters.",
  "• get_report_schema: Use to inspect active report metadata, criteria fields, and column definitions.",
  "• GROUNDING: Base all queries strictly on the actual table name and column names provided in the current state.",
].join("\n");

const GRID_ABSENT_RULES = [
  "REPORT CATALOG & EXECUTION:",
  "• When user requests a report (e.g. 'Stok Bakiye Raporu', 'hazırla', 'çalıştır'), immediately call run_report with the appropriate scope and criteria.",
  "• Do not push back asking for dates or formats; relative dates (e.g. 'bugün', 'geçen hafta') are automatically resolved.",
  "• Available reports in catalog:",
  REPORTS_DIGEST_LINES,
].join("\n");

const SQL_EXPERT_RULES = [
  "SQL EXPERT & QUERY GUIDELINES:",
  "• Use run_expert_sql strictly for read-only SELECT queries that verify findings or compute advanced metrics.",
  "• If the user wants the actual grid UI table to show transformed/derived columns, use set_grid_query instead.",
  "• For simple value/range filters on the existing table, use filter_current_grid instead of SQL.",
].join("\n");

const DUCKDB_RULES = [
  "DUCKDB SYNTAX RULES:",
  "• Use standard DuckDB SQL functions: CAST(col AS DATE), date_trunc('month', col), COALESCE, CASE WHEN ... THEN ... ELSE ... END.",
  "• Quote alias identifiers with double quotes when they contain spaces or Turkish characters: AS \"Toplam Tutar\".",
].join("\n");

const DATA_QUALITY_ANALYSIS_RULES = [
  "DATA QUALITY, ANOMALY DETECTION & /ANALIZ PROTOCOL:",
  "• When the user triggers '/analiz', asks to inspect data problems, or requests table anomaly analysis:",
  "  1. Call profile_grid_table FIRST to inspect null counts, distinct values, min/max metrics, and anomalies across all columns.",
  "  2. Provide a structured, clean Turkish summary with 2 main sections:",
  "     - 📊 **Genel Tablo Özeti**: Toplam satır sayısı, özet metrikler ve genel veri sağlığı değerlendirmesi.",
  "     - ⚠️ **Tespit Edilen Veri Problemleri & Bulgular**: Her tespit edilen problemi '• **Başlık (KolonAdı Koşul)**: Açıklama' biçiminde maddeler halinde listele. Kullanıcı arayüzü bu başlıkları otomatik olarak tıklanabilir aksiyona dönüştürür (basit filtreler için filter_current_grid, gruplu/hesaplanmış/mükerrer büyük sorgular için set_grid_query çalışır).",
  "  3. Standard bulleted finding formats (simple filters & complex SQL-level anomalies):",
  "     - '• **Negatif Stok Miktarları (Quantity < 0)**: Tabloda 4 satırda negatif miktar tespit edildi.'",
  "     - '• **Boş Ambar Kodları (Warehouse boş)**: 12 satırda ambar tanımı eksik (NULL).'",
  "     - '• **Sıfır Birim Fiyatlı Kayıtlar (UnitPrice = 0)**: 5 satırda birim fiyat girilmemiş.'",
  "     - '• **Mükerrer Ürün Kayıtları (ItemCode tekrar edenler)**: Birden fazla ambarda aynı kodla mükerrer açılmış kayıtlar mevcut.'",
  "     - '• **Yüksek Değerli Stok Anomalileri (Quantity * UnitPrice > 100.000)**: Aşırı yüksek bakiye tutarına sahip uç kayıtlar.'",
  "     - '• **Depo Bazında Negatif Dağılım (Warehouse gruplu)**: Toplam miktarı eksiye düşen ambarlar tespit edildi.'",
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
  "  • 1. TABLE NAME CORRECTION: Replace pseudo-table names ('rapor', 'table', 'tablo', 'stok_bakiye', etc.) with the ACTUAL active DuckDB table name from system state (e.g. report_e53c80ce_...).",
  "  • 2. COLUMN NAME CORRECTION: Auto-correct misspelled or Turkish alias column names ('tarih' -> 'TransDate', 'miktar' -> 'Qty', 'depo' -> 'Warehouse', 'fiyat' -> 'UnitPrice', 'stok_kodu' -> 'ItemCode', etc.) to the exact column names in the active grid table schema.",
  "  • 3. RELATIVE DATE EXPANSION: Expand relative date terms into exact ISO date strings (e.g., 'bugun' -> '2026-09-01', 'dun' -> '2026-08-31', 'bu ay' -> date range '2026-09-01' to '2026-09-30').",
  "  • 4. QUERY EXECUTION: Call set_grid_query({ sql: \"...\" }) with the corrected, valid DuckDB SQL query so the screen grid table updates automatically, accompanied by a 1-sentence Turkish explanation of the corrections made.",
].join("\n");

export function buildSystemPrompt(context?: YulaScreenContext): string {
  const lines: string[] = [BASE_PROMPT];

  const pathname = context?.pathname ?? "/";
  const isMainHome = isWorkspaceHomePath(pathname);
  const mode = context?.mode ?? (isMainHome ? "main" : "dock");
  const wsId = context?.workspaceId ?? workspaceIdFromPath(pathname);
  const wsLabel = context?.workspaceLabel ?? workspaceLabelFromPath(pathname);
  const phase = context?.phase ?? "workspace";
  const todayStr = new Date().toISOString().split("T")[0];

  lines.push(
    "",
    "=== LEVEL 1: GLOBAL APPLICATION SCOPE ===",
    `• Current Local Date: ${todayStr} (Use for expanding relative date terms like bugün, dün, bu ay)`,
    `• Execution Mode: ${mode === "main" ? "MAIN SCREEN MODE (Full-Screen AI Workspace)" : "SIDE DOCK MODE (Page Copilot Panel)"}`,
    `• Main Mode Rule: In MAIN SCREEN MODE, Yula AI is the primary full-screen workspace interface. When the user asks for a report or workflow, ALWAYS execute or navigate immediately without conversational date/criteria pushback.`,
    `• Language Rule: Generate all conversational text strictly in natural TURKISH.`,
    "",
    "=== LEVEL 2: WORKSPACE SCOPE ===",
    `• Active Workspace: ${wsLabel} (ID: ${wsId})`,
    `• Cross-Workspace Rule: If the user requests a report or feature belonging to another workspace, navigate to the target report/page seamlessly while informing the user.`,
    "",
    "=== LEVEL 3: PAGE / SCREEN SCOPE ===",
    `• Current Page Path: ${pathname}`,
    `• Screen Phase: ${phase.toUpperCase()} (${phase === "results" ? "Active Job Data Table Open" : phase === "results-loading" ? "Table Loading" : "Criteria / Form / Home Workspace"})`,
  );

  if (phase === "results-loading") {
    lines.push(
      "• SCREEN PHASE NOTICE: Table data is not ready yet; filter/analysis tools are temporarily unavailable. Inform user to try again once table finishes loading.",
    );
  }

  if (context?.grid) {
    lines.push(GRID_PRESENT_RULES);
    lines.push(SQL_EXPERT_RULES);
    lines.push(DATA_QUALITY_ANALYSIS_RULES);
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

    const gridLines = [
      viewModeNotice,
      isCustomActive ? `ACTIVE CUSTOM QUERY SQL: ${context.grid.customQuerySql}` : null,
      `Active table: ${context.grid.tableName} · ${context.grid.rowCount ?? "?"} rows.`,
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
      "DO NOT answer analysis/filter requests without calling the appropriate tool first.",
    );
    lines.push(gridLines.join(" "));
  } else {
    lines.push(GRID_ABSENT_RULES);
  }

  if (context?.ragContext && context.ragContext.length > 0) {
    lines.push(
      "\nRELEVANT VECTOR RAG CONTEXT (Retrieved via DuckDB WASM + All-MiniLM Vector Search):",
      ...context.ragContext.map(
        (item) =>
          ` • ${item.content}${item.distance != null ? ` (distance: ${item.distance.toFixed(3)})` : ""}`,
      ),
    );
  }

  lines.push(
    "\nFINAL REMINDER: Write your final response text to the user strictly in natural TURKISH.",
  );

  return lines.join("\n");
}
