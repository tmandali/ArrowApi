"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { pickLang, type YulaUiLang } from "@/lib/yula-lang";
import {
  isFailedToolInfo,
  isDedupeSkipOutput,
  type YulaToolPartInfo,
} from "@/lib/yula-tool-info";
import { describeYulaStreamError } from "@/lib/yula-stream-error";

export const SCREEN_TOOLS = new Set([
  "filter_current_grid",
  "apply_grid_filters",
  "set_grid_sort",
  "configure_grid_columns",
  "pin_grid_columns",
  "reset_grid_layout",
  "export_grid_data",
  "set_grid_query",
  "run_job",
  "apply_criteria",
  "navigate_to_page",
  "open_last_report",
  "find_matching_report",
  "visualize_grid_data",
  // Standart tool üzerinden gelen ekran etkili çağrılar
  "dispatch_component_action",
]);

/** dispatch_component_action girdisinden canlı durum etiketi. */
export function dispatchLiveStatus(input: unknown, lang: YulaUiLang): string | null {
  const L = (tr: string, en: string) => pickLang(lang, tr, en);
  const action =
    input && typeof input === "object"
      ? (input as { action?: unknown }).action
      : undefined;
  switch (action) {
    case "QUERY":
      return L("Tablo görünümü güncelleniyor…", "Updating table view…");
    case "SORT":
      return L("Tablo sıralanıyor…", "Sorting table…");
    case "FILTER":
      return L("Filtre uygulanıyor…", "Applying filter…");
    case "COLUMNS":
    case "PIN":
      return L("Kolonlar düzenleniyor…", "Arranging columns…");
    case "RESET_LAYOUT":
      return L("Görünüm sıfırlanıyor…", "Resetting view…");
    case "EXPORT":
      return L("Dosya dışa aktarılıyor…", "Exporting file…");
    case "RUN_SQL":
      return L("SQL sorgusu çalışıyor…", "Running SQL query…");
    case "ANALYZE":
      return L("Tablo özeti hesaplanıyor…", "Computing table summary…");
    case "PROFILE":
      return L("Tablo analiz ediliyor — lütfen bekleyin…", "Analyzing table — please wait…");
    case "VISUALIZE":
      return L("Grafik hazırlanıyor…", "Preparing chart…");
    case "SET_FIELDS":
      return L("Kriterler uygulanıyor…", "Applying criteria…");
    case "SUBMIT":
      return L("Rapor çalıştırılıyor…", "Running report…");
    default:
      return null;
  }
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function liveStatusLabel(toolParts: YulaToolPartInfo[], lang: YulaUiLang): string {
  const pending = toolParts.find(
    (i) => i.state === "input-available" || i.state === "input-streaming",
  );
  const L = (tr: string, en: string) => pickLang(lang, tr, en);
  if (pending?.toolName === "dispatch_component_action") {
    return dispatchLiveStatus(pending.input, lang) ?? L("İstek işleniyor — lütfen bekleyin…", "Processing request — please wait…");
  }
  switch (pending?.toolName) {
    case "profile_grid_table":
      return L("Tablo analiz ediliyor — lütfen bekleyin…", "Analyzing table — please wait…");
    case "analyze_grid_data":
      return L("Tablo özeti hesaplanıyor…", "Computing table summary…");
    case "run_expert_sql":
      return L("SQL sorgusu çalışıyor…", "Running SQL query…");
    case "visualize_grid_data":
      return L("Grafik hazırlanıyor…", "Preparing chart…");
    case "ask_user_choice":
      return L("Seçenekler hazırlanıyor…", "Preparing options…");
    case "ask_user_question":
      return L("Sorular hazırlanıyor…", "Preparing questions…");
    case "suggest_next_steps":
      return L("Öneriler hazırlanıyor…", "Preparing suggestions…");
    case "filter_current_grid":
    case "apply_grid_filters":
      return L("Filtre uygulanıyor…", "Applying filter…");
    case "set_grid_sort":
      return L("Tablo sıralanıyor…", "Sorting table…");
    case "configure_grid_columns":
    case "pin_grid_columns":
      return L("Kolonlar düzenleniyor…", "Arranging columns…");
    case "reset_grid_layout":
      return L("Görünüm sıfırlanıyor…", "Resetting view…");
    case "export_grid_data":
      return L("Dosya dışa aktarılıyor…", "Exporting file…");
    case "set_grid_query":
      return L("Tablo görünümü güncelleniyor…", "Updating table view…");
    default:
      return pending
        ? L("İstek işleniyor — lütfen bekleyin…", "Processing request — please wait…")
        : L("Yula yanıt hazırlıyor — lütfen bekleyin…", "Yula is preparing a reply — please wait…");
  }
}

export function SilentTurnFallback({
  toolParts,
  streamErrorText,
  onRetry,
  lang,
}: {
  toolParts: YulaToolPartInfo[];
  streamErrorText?: string;
  onRetry: () => void;
  lang: YulaUiLang;
}) {
  const failed = toolParts.filter(
    (i) => isFailedToolInfo(i) && !isDedupeSkipOutput(i),
  );
  const hasScreenOk = toolParts.some(
    (i) => SCREEN_TOOLS.has(i.toolName) && !isFailedToolInfo(i) && i.state === "output-available",
  );
  if (hasScreenOk && !streamErrorText) return null;

  const friendlyStreamError = describeYulaStreamError(streamErrorText);
  const hint = pickLang(
    lang,
    friendlyStreamError
      ? `AI sağlayıcısı hata döndürdü: ${friendlyStreamError}`
      : failed.length > 0
        ? `Analiz tamamlanamadı: ${failed[0].errorText || (typeof failed[0].output === "object" && failed[0].output && "error" in failed[0].output ? String((failed[0].output as { error?: unknown }).error) : "araç hatası")}.`
        : "Bu turda görünür bir yanıt yazılamadı (analiz takılmış veya model sessiz bitmiş olabilir).",
    friendlyStreamError
      ? `AI provider returned an error: ${friendlyStreamError}`
      : failed.length > 0
        ? `Analysis could not finish: ${failed[0].errorText || (typeof failed[0].output === "object" && failed[0].output && "error" in failed[0].output ? String((failed[0].output as { error?: unknown }).error) : "tool error")}.`
        : "No visible reply was produced in this turn (analysis may be stuck or the model ended silently).",
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/35 bg-amber-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950 dark:text-amber-100">
      <p>
        {hint}{" "}
        {pickLang(
          lang,
          "Yeni bir mesaj yazmadan önce yeniden deneyin.",
          "Please retry before writing a new message.",
        )}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-fit text-[11px]"
        onClick={onRetry}
      >
        {pickLang(lang, "Yanıtı yeniden dene", "Retry reply")}
      </Button>
    </div>
  );
}
