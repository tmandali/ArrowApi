"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
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
// eslint-disable-next-line react/only-export-components -- yardımcı + bileşen aynı dosyada; Fast Refresh dışı saf fonksiyon
export function dispatchLiveStatus(
  input: unknown,
  t?: (key: string) => string,
  lang?: YulaUiLang,
): string | null {
  const action =
    input && typeof input === "object"
      ? (input as { action?: unknown }).action
      : undefined;
  if (t) {
    switch (action) {
      case "QUERY":
        return t("status_query");
      case "SORT":
        return t("status_sort");
      case "FILTER":
        return t("status_filter");
      case "COLUMNS":
      case "PIN":
        return t("status_columns");
      case "RESET_LAYOUT":
        return t("status_reset_layout");
      case "EXPORT":
        return t("status_export");
      case "RUN_SQL":
        return t("status_run_sql");
      case "ANALYZE":
        return t("status_analyze");
      case "PROFILE":
        return t("status_profile");
      case "VISUALIZE":
        return t("status_visualize");
      case "SET_FIELDS":
        return t("status_set_fields");
      case "SUBMIT":
        return t("status_submit");
      default:
        return null;
    }
  }
  const L = (tr: string, en: string) => pickLang(lang ?? "tr", tr, en);
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

// eslint-disable-next-line react/only-export-components -- yardımcı + bileşen aynı dosyada; saf format fonksiyonu
export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

// eslint-disable-next-line react/only-export-components -- yardımcı + bileşen aynı dosyada; saf etiket fonksiyonu
export function liveStatusLabel(
  toolParts: YulaToolPartInfo[],
  t?: (key: string) => string,
  lang?: YulaUiLang,
): string {
  const pending = toolParts.find(
    (i) => i.state === "input-available" || i.state === "input-streaming",
  );
  if (t) {
    if (pending?.toolName === "dispatch_component_action") {
      return dispatchLiveStatus(pending.input, t) ?? t("status_processing");
    }
    switch (pending?.toolName) {
      case "profile_grid_table":
        return t("status_profile");
      case "analyze_grid_data":
        return t("status_analyze");
      case "run_expert_sql":
        return t("status_run_sql");
      case "visualize_grid_data":
        return t("status_visualize");
      case "ask_user_choice":
        return t("status_options");
      case "ask_user_question":
        return t("status_questions");
      case "suggest_next_steps":
        return t("status_suggestions");
      case "filter_current_grid":
      case "apply_grid_filters":
        return t("status_filter");
      case "set_grid_sort":
        return t("status_sort");
      case "configure_grid_columns":
      case "pin_grid_columns":
        return t("status_columns");
      case "reset_grid_layout":
        return t("status_reset_layout");
      case "export_grid_data":
        return t("status_export");
      case "set_grid_query":
        return t("status_query");
      default:
        return pending ? t("status_processing") : t("status_preparing_reply");
    }
  }

  const L = (tr: string, en: string) => pickLang(lang ?? "tr", tr, en);
  if (pending?.toolName === "dispatch_component_action") {
    return dispatchLiveStatus(pending.input, undefined, lang) ?? L("İstek işleniyor — lütfen bekleyin…", "Processing request — please wait…");
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

export const INTERACTIVE_CARD_TOOLS = new Set([
  "ask_user_choice",
  "ask_user_question",
  "suggest_next_steps",
]);

/**
 * Tur içinde son kullanıcıya gösterilen zengin/etkileşimli bir kart
 * (seçenekler, anket, öneri çipleri, grafik veya yönlendirme kartı)
 * olup olmadığını belirler.
 */
// eslint-disable-next-line react/only-export-components -- yardımcı + bileşen aynı dosyada; saf fonksiyon
export function hasVisibleTurnCard(toolParts: YulaToolPartInfo[]): boolean {
  return toolParts.some((info) => {
    if (isFailedToolInfo(info)) return false;
    if (
      INTERACTIVE_CARD_TOOLS.has(info.toolName) &&
      (info.state === "output-available" || info.state === "input-available")
    ) {
      return true;
    }
    if (info.toolName === "visualize_grid_data" && info.state === "output-available") {
      return true;
    }
    if (
      (info.toolName === "run_job" ||
        (info.toolName === "dispatch_component_action" &&
          (info.input as { action?: string } | undefined)?.action === "RUN") ||
        (info.toolName === "dispatch_component_action" &&
          typeof info.output === "object" &&
          info.output !== null &&
          (info.output as { status?: unknown }).status === "executed")) &&
      info.state === "output-available" &&
      typeof info.output === "object" &&
      info.output !== null &&
      (info.output as { status?: unknown }).status === "executed" &&
      typeof (info.output as { navigateTo?: unknown }).navigateTo === "string"
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Ekran/ızgara/form üzerinde başarılı bir UI etkisi oluşturan araç çağrısı
 * olup olmadığını belirler.
 */
// eslint-disable-next-line react/only-export-components -- yardımcı + bileşen aynı dosyada; saf fonksiyon
export function hasScreenActionSuccess(toolParts: YulaToolPartInfo[]): boolean {
  return toolParts.some(
    (i) =>
      SCREEN_TOOLS.has(i.toolName) &&
      !isFailedToolInfo(i) &&
      i.state === "output-available",
  );
}

/**
 * Bu turda son kullanıcıya dönük görünür bir içerik (metin, kart, ekran etkisi
 * veya araç geri bildirimi) üretilip üretilmediğini belirler.
 */
// eslint-disable-next-line react/only-export-components -- yardımcı + bileşen aynı dosyada; saf fonksiyon
export function hasVisibleTurnContent({
  toolParts,
  assistantText,
  fallbackMessage,
}: {
  toolParts: YulaToolPartInfo[];
  assistantText?: string;
  fallbackMessage?: unknown;
}): boolean {
  if (assistantText && assistantText.trim().length > 0) return true;
  if (fallbackMessage) return true;
  if (hasVisibleTurnCard(toolParts)) return true;
  if (hasScreenActionSuccess(toolParts)) return true;
  return false;
}

export function SilentTurnFallback({
  toolParts,
  streamErrorText,
  recoveredToolCallIds,
  onRetry,
}: {
  toolParts: YulaToolPartInfo[];
  streamErrorText?: string;
  recoveredToolCallIds?: Set<string>;
  onRetry: () => void;
  lang?: YulaUiLang;
}) {
  const t = useTranslations("ChatTurn");
  const hasVisible = hasVisibleTurnContent({ toolParts });
  if (hasVisible && !streamErrorText) return null;

  const failed = toolParts.filter(
    (i) =>
      isFailedToolInfo(i) &&
      !isDedupeSkipOutput(i) &&
      !recoveredToolCallIds?.has(i.toolCallId),
  );

  const friendlyStreamError = describeYulaStreamError(streamErrorText);
  const hint = friendlyStreamError
    ? t("ai_provider_error", { error: friendlyStreamError })
    : failed.length > 0
      ? t("operation_failed", {
          detail:
            failed[0].errorText ||
            (typeof failed[0].output === "object" &&
            failed[0].output &&
            "error" in failed[0].output
              ? String((failed[0].output as { error?: unknown }).error)
              : t("tool_error_default")),
        })
      : t("no_visible_reply");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/35 bg-amber-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950 dark:text-amber-100">
      <p>
        {hint} {t("retry_hint")}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-fit text-[11px]"
        onClick={onRetry}
      >
        {t("retry_reply")}
      </Button>
    </div>
  );
}
