/**
 * Sidecar stdout olayları için protokol yardımcıları:
 * satır ayrıştırma, requestId süzgeci ve tool_call düzeltme (state-driven guard).
 */
import { detectGridIntent, inferChartType } from "./grid-intent";
import { synthesizeBcFilter, extractCleanFilterValue } from "@/lib/bc-filter-synthesizer";
import type { SidecarEvent } from "./types";

/** Satırı JSON olarak parse eder; başarısızsa null döner (raw log satırları). */
export function parseSidecarLine(line: string): SidecarEvent | null {
  try {
    return JSON.parse(line) as SidecarEvent;
  } catch {
    return null;
  }
}

/** Eski/yalancı requestId'li yanıtlar yok sayılır. */
export function isStaleEvent(evt: SidecarEvent, activeRequestId: string | null): boolean {
  return Boolean(evt.requestId && evt.requestId !== activeRequestId);
}

/**
 * State-Driven Guard: Kullanıcı sonuç tablosuna bakıyorsa ve açıkça yeni rapor istemiyorsa
 * tüm istekler aktif tablo araçlarına yönlendirilir. Aksi halde gelen araç adı korunur.
 */
export function applyViewingStateGuard(
  toolName: string,
  promptLower: string,
  isViewingResults: boolean,
  isAskingNewReportFlag: boolean
): string {
  if (!isViewingResults || isAskingNewReportFlag) return toolName;

  const intent = detectGridIntent(promptLower);
  if (intent === "anomaly") return "detect_grid_anomalies";
  // "kaç kayıt var" soruları filtre değil, KPI sayım aracıdır.
  if (intent === "count") return "analyze_grid_data";
  if (intent === "summary") return "analyze_grid_data";
  if (intent === "clear") return "clear_grid_filters";

  const isGridTool =
    toolName === "analyze_grid_data" ||
    toolName === "detect_grid_anomalies" ||
    toolName === "clear_grid_filters";
  return isGridTool ? toolName : "filter_active_grid";
}

/** filter_active_grid argümanlarını LLM halüsinasyonlarına karşı kesinleştirir. */
export function synthesizeGridFilterArgs(
  toolArgs: Record<string, any>,
  lastPrompt: string
): Record<string, any> {
  const args = { ...toolArgs };
  const synthesized = synthesizeBcFilter(lastPrompt);
  if (synthesized.hasBcFilter) {
    args.query = synthesized.filterExpression;
    args.column = synthesized.targetColumnHint || args.column;
  } else {
    const clean = extractCleanFilterValue(lastPrompt);
    args.query = clean.value || args.query;
    args.column = clean.columnHint || args.column;
  }
  return args;
}

/** analyze_grid_data için eksik chartType'ı prompttan çıkarır. */
export function ensureChartType(toolArgs: Record<string, any>, promptLower: string): Record<string, any> {
  const args = { ...toolArgs };
  if (!args.chartType) {
    args.chartType = inferChartType(promptLower);
  }
  return args;
}
