/**
 * Grid (sonuç tablosu) niyet tespiti ve hızlı yönlendirme.
 * Hem sendPrompt hızlı router'ı hem de sidecar tool_call düzeltmesi aynı
 * anahtar kelime setini bu modül üzerinden kullanır (tek kaynak).
 */
import {
  extractCleanFilterValue,
  matchExplicitColumn,
  synthesizeBcFilter,
  unwrapQuotedValue,
} from "@/lib/bc-filter-synthesizer";
import {
  resolveColumnCandidates,
  resolveGridColumn,
  stripColumnTokensFromValue,
} from "@/lib/grid-filter-resolver";
import type { ScreenContext } from "./types";
import intentsJson from "./intents.tr.json";

/** Türkçe diyakritikleri sadeleştirir — sözlük anahtarları aksan-sade tutulduğu için zorunlu. */
const FOLD_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
};
export function foldTr(s: string): string {
  return s.replace(/[çğıöşüÇĞİIÖŞÜ]/g, (ch) => FOLD_MAP[ch] ?? ch);
}

/** Tek kaynak: intents.tr.json (sidecar ile aynı dosya paylaşılır). */
const INTENTS = intentsJson as unknown as Record<string, string[]>;

function hasAny(foldedPrompt: string, key: string): boolean {
  return (INTENTS[key] || []).some((keyword) => foldedPrompt.includes(keyword));
}

/**
 * Tek kelimelik anahtarlar için kelime sınırı eşleşmesi ("kac" → "kaçak" ile
 * eşleşmesin). Çok kelimelik ifadelerde düz includes yeterli.
 */
function hasAnyBoundary(foldedPrompt: string, key: string): boolean {
  return (INTENTS[key] || []).some((keyword) =>
    keyword.includes(" ")
      ? foldedPrompt.includes(keyword)
      : new RegExp(`\\b${keyword}\\b`).test(foldedPrompt)
  );
}

/** Kullanıcı yeni bir rapor ekranı mı istiyor? */
export function isAskingNewReport(promptLower: string): boolean {
  return hasAny(foldTr(promptLower), "newReport");
}

/** Bağlamdaki kolon adları + etiketlerinden tekil açık-kolon aday listesi üretir. */
function buildKnownColumnNames(summary?: Record<string, any>): string[] {
  const names = Array.isArray(summary?.columns) ? (summary.columns as string[]) : [];
  const labels = (summary?.columnLabels || {}) as Record<string, string>;
  const set = new Set<string>();
  for (const n of names) {
    if (labels[n]) set.add(labels[n]);
    set.add(n);
  }
  return [...set];
}

/**
 * Pozitif kanıt sözleşmesi: filter_active_grid çalıştırmak için promptta VEYA
 * model çıktısında en az bir VERİ EYLEMİ kanıtı aranır. Kanıt yoksa prompt
 * konuşma/rehber yoluna düşer — ifade sözlüğü tutulmaz, yeni kalıplar otomatik
 * doğru tarafa ayrışır.
 */
export function hasGridFilterEvidence(
  promptText: string,
  effectiveScreen: ScreenContext,
  toolArgs?: Record<string, any>
): boolean {
  const summaryAny = effectiveScreen.activeDataSummary as Record<string, any> | undefined;
  const knownColumns = buildKnownColumnNames(summaryAny);

  // 1. BC operatörü / şekil kodu / tırnaklı literal / GERÇEK kolon adı (şemadan)
  if (
    hasDirectGridFilterSignal(
      promptText,
      knownColumns,
      (summaryAny?.columnTypes as Record<string, string>) || undefined
    )
  )
    return true;
  // 2. Net grid niyeti (temizle / sayım / özet / anomali)
  if (detectGridIntent(promptText) !== null) return true;

  // 3. Kolon ipucu (açık kolon adı, bileşik nitelik) veya tırnaklı literal
  const clean = extractCleanFilterValue(promptText, knownColumns);
  if (clean.columnHint || clean.quoted) return true;

  // 4. Model ham promptu kopyalamak yerine gerçek bir değer çıkardı mı?
  const q = String(toolArgs?.query ?? "").trim();
  if (
    q.length >= 2 &&
    q.toLowerCase() !== promptText.trim().toLowerCase() &&
    !isFullSentenceQuery(q)
  ) {
    return true;
  }

  // 5. Örnek-set/şekil kanıtıyla aday kolon bulunuyor mu?
  const colNames = Array.isArray(summaryAny?.columns)
    ? (summaryAny.columns as string[])
    : [];
  if (
    colNames.length > 0 &&
    resolveColumnCandidates(
      clean.columnHint,
      colNames.map((n) => ({ name: n })),
      clean.value,
      summaryAny?.sampleRows
    ).length > 0
  ) {
    return true;
  }

  return false;
}

/** Serbest cümle koruması: ≥4 kelime ve BC operatörü içermeyen değer. */
function isFullSentenceQuery(q: string): boolean {
  return q.includes("?") || (q.split(/\s+/).length >= 4 && !/[><=..|&!]/.test(q));
}

export type GridIntent = "anomaly" | "count" | "summary" | "clear" | null;

/** Serbest metinden grid aksiyon niyetini yakalar. */
export function detectGridIntent(promptLower: string): GridIntent {
  // Savunmacı: çağıranlar zaten lowercase geçirir; yine de içeride garanti edilir.
  const folded = foldTr((promptLower || "").toLowerCase());
  // "kaç kayıt var" gibi sorular filtre değil, sayım/KPI niyetidir — önce kontrol edilir.
  if (hasAnyBoundary(folded, "count")) return "count";
  if (hasAny(folded, "anomaly")) return "anomaly";
  if (hasAny(folded, "summary")) return "summary";
  if (hasAny(folded, "clear")) return "clear";
  return null;
}

/** analyze_grid_data için grafik tipi çıkarımı. */
export function inferChartType(promptLower: string): "pie" | "kpi" | "bar" {
  if (promptLower.includes("pasta") || promptLower.includes("pie") || promptLower.includes("oran")) {
    return "pie";
  }
  if (promptLower.includes("kpi") || promptLower.includes("toplam") || promptLower.includes("metrik")) {
    return "kpi";
  }
  return "bar";
}

/** Doğrudan grid filtre sinyali — TAMAMI şema/şekil türevli, kavram sözlüğü YOKTUR:
 *  1. Herhangi bir kelime + karşılaştırma operatörü ("unit price > 100", "qty<50")
 *  2. Harf-ayraç-rakam şekli ("SKU-001", "WH-01") — kavramdan bağımsız yapı sinyali
 *  3. Tırnaklı literal
 *  4. Prompt, Arrow şemasından gelen GERÇEK kolon adı/etiketi içeriyor (knownColumns)
 */
export function hasDirectGridFilterSignal(
  promptText: string,
  knownColumns?: string[],
  /** Arrow/DuckDB kolon tipleri — sayısal eşik sinyali için gerekli */
  columnTypes?: Record<string, string>
): boolean {
  const p = promptText.trim();
  return Boolean(
    /(?:^|\s)[a-zA-ZçğıöşüÇĞİÖŞÜ0-9_]+\s*(?:>=|<=|<>|!=|=|>|<|\.\.)\s*\S/.test(p) ||
      /\b[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,}[-_]\d+\b/.test(p) ||
      /["“'«].+["”'»]/.test(p) ||
      // Sayısal eşik niyeti (şema-türevli): promptta SAYI varsa ve aktif
      // Arrow şemasında numeric kolon bulunuyorsa filtre adayıdır.
      (/\b\d+(?:[.,]\d+)?\b/.test(p) &&
       Object.values(columnTypes ?? {}).some((v) => v === "number")) ||
      (matchExplicitColumn(p, knownColumns ?? []) !== undefined)
  );
}

export interface GridRouteDecision {
  /** Kesin bir grid aksiyonu mu çıkarıldı? */
  matched: boolean;
  toolName: string;
  args: Record<string, any>;
}

/**
 * Prompt'tan deterministik grid aksiyonu çıkarır.
 * Sıra: anomali → özet/grafik → temizle → BC sentezi → temiz filtre değeri.
 */
export function resolveGridFastRoute(
  promptText: string,
  effectiveScreen: ScreenContext,
  hasActiveGridTool: boolean
): GridRouteDecision {
  const promptLower = promptText.toLowerCase();
  const isViewingResults = Boolean(effectiveScreen.activeDataSummary?.isViewingResults);
  // Kullanıcı gerçek kolon adı/etiketini yazdıysa ("unit price 25") açık öncelik
  const summaryAny = effectiveScreen.activeDataSummary as Record<string, any> | undefined;
  const knownColumns = buildKnownColumnNames(summaryAny);
  const hasDirectGridFilter = hasDirectGridFilterSignal(
    promptText,
    knownColumns,
    (summaryAny?.columnTypes as Record<string, string>) || undefined
  );

  const gate =
    (isViewingResults || (hasActiveGridTool && hasDirectGridFilter)) && !isAskingNewReport(promptLower);
  if (!gate) {
    return { matched: false, toolName: "filter_active_grid", args: {} };
  }

  const intent = detectGridIntent(promptLower);
  const args: Record<string, any> = {};

  if (intent === "anomaly") {
    return { matched: true, toolName: "detect_grid_anomalies", args };
  }
  // "kaç kayıt var" → filtre değil, KPI kayıt sayısı kartı
  if (intent === "count") {
    return { matched: true, toolName: "analyze_grid_data", args: { chartType: "kpi" } };
  }
  if (intent === "summary") {
    args.chartType = inferChartType(promptLower);
    return { matched: true, toolName: "analyze_grid_data", args };
  }
  if (intent === "clear") {
    return { matched: true, toolName: "clear_grid_filters", args };
  }

  // Doğrudan filtre: önce Business Central sözdizimi, sonra temiz değer
  const clean = extractCleanFilterValue(promptText, knownColumns);
  const bc = synthesizeBcFilter(promptText, effectiveScreen.activeDataSummary?.columns || []);
  if (bc.hasBcFilter) {
    args.query = bc.filterExpression;
    args.column = bc.targetColumnHint;
    return { matched: true, toolName: "filter_active_grid", args };
  }
  if (clean.value && clean.value.length >= 2) {
    const cols = ((effectiveScreen.activeDataSummary?.columns || []) as string[]).map((column) => ({
      name: column,
      label: column,
    }));
    const sampleRows = effectiveScreen.activeDataSummary?.sampleRows || [];
    // Literal sözleşmesi: tırnaklı değerin İÇERİĞİYLE kolon çöz, sorguyu tırnaklı taşı
    const unwrapped = unwrapQuotedValue(clean.value);
    const resolvedCol = resolveGridColumn(clean.columnHint, cols, unwrapped.content, sampleRows);
    // Kolon ÇÖZÜLDÜYSE uygula. Yalnızca hint var ama kolon yoksa EŞLEŞME SAYMA:
    // anlamsal eşleme (örn. "pasif"→IsActive) Needle/Gemma katmanının işidir;
    // çözülemeyen hint'i grid'e göndermek hataya mahkumdur.
    if (resolvedCol) {
      args.query = unwrapped.quoted
        ? clean.value
        : stripColumnTokensFromValue(clean.value, resolvedCol, clean.columnHint);
      args.column = resolvedCol;
      return { matched: true, toolName: "filter_active_grid", args };
    }
    // Tırnaklı literal: kolon belirsiz olsa da grid literal yolunda denenir.
    if (unwrapped.quoted && clean.value) {
      args.query = clean.value;
      args.column = clean.columnHint;
      return { matched: true, toolName: "filter_active_grid", args };
    }
  }

  return { matched: false, toolName: "filter_active_grid", args };
}
