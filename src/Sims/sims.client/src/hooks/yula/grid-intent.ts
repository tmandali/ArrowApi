/**
 * Grid (sonuç tablosu) niyet tespiti ve hızlı yönlendirme.
 * Hem sendPrompt hızlı router'ı hem de sidecar tool_call düzeltmesi aynı
 * anahtar kelime setini bu modül üzerinden kullanır (tek kaynak).
 */
import { extractCleanFilterValue, synthesizeBcFilter } from "@/lib/bc-filter-synthesizer";
import { resolveGridColumn } from "@/lib/grid-filter-resolver";
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

/** Doğrudan grid filtre sinyali var mı? (operatör / kod kalıbı) */
export function hasDirectGridFilterSignal(promptText: string): boolean {
  return Boolean(
    extractCleanFilterValue(promptText).value ||
      /\b(?:qty|quantity|bakiye|balance|stok|stock|miktar)\s*(?:>=|<=|<>|!=|>|<|=)/i.test(promptText) ||
      /\b(?:sku|item|ürün|malzeme)[-_ ]?\d+/i.test(promptText)
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
  const hasDirectGridFilter = hasDirectGridFilterSignal(promptText);

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
  const clean = extractCleanFilterValue(promptText);
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
    const resolvedCol = resolveGridColumn(clean.columnHint, cols, clean.value, sampleRows);
    if (resolvedCol || clean.columnHint || hasDirectGridFilter) {
      args.query = clean.value;
      args.column = resolvedCol || clean.columnHint;
      return { matched: true, toolName: "filter_active_grid", args };
    }
  }

  return { matched: false, toolName: "filter_active_grid", args };
}
