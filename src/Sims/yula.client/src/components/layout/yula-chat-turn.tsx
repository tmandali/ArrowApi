"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { YulaWorkedAccordion } from "@/components/layout/yula-worked-accordion";
import { AiChatMessage } from "@/components/layout/ai-chat-message";
import { YulaChartCard } from "@/components/layout/yula-chart-card";
import { YulaQuestionnaireCard } from "@/components/layout/yula-questionnaire-card";
import { YulaSuggestionChips } from "@/components/layout/yula-suggestion-chips";
import { YulaJobStartedCard } from "@/components/layout/yula-job-started-card";
import { useYulaChat } from "@/hooks/use-yula-chat";
import {
  yulaToolPartInfo,
  isFailedToolInfo,
  isDedupeSkipOutput,
  type YulaToolPartInfo,
} from "@/lib/yula-tool-info";
import { stripMarkdownTables } from "@/lib/markdown-table-strip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Copy, Check, Undo2, Loader2 } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { sanitizeAssistantText } from "@/lib/sanitize-assistant-text";
import { describeYulaStreamError } from "@/lib/yula-stream-error";
import { runConfirmationClickPrompt } from "@/lib/yula-actions";
import { triggerReportRun } from "@/lib/report-run-bus";
import {
  detectUserLanguage,
  pickLang,
  type YulaUiLang,
} from "@/lib/yula-lang";

const SCREEN_TOOLS = new Set([
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
]);

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function liveStatusLabel(toolParts: YulaToolPartInfo[], lang: YulaUiLang): string {
  const pending = toolParts.find(
    (i) => i.state === "input-available" || i.state === "input-streaming",
  );
  const L = (tr: string, en: string) => pickLang(lang, tr, en);
  switch (pending?.toolName) {
    case "profile_grid_table":
      return L("Tablo analiz ediliyor — lütfen bekleyin…", "Analyzing table — please wait…");
    case "analyze_grid_data":
      return L("Tablo özeti hesaplanıyor…", "Computing table summary…");
    case "run_expert_sql":
      return L("SQL sorgusu çalışıyor…", "Running SQL query…");
    case "visualize_grid_data":
      return L("Grafik hazırlanıyor…", "Preparing chart…");
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

function SilentTurnFallback({
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
  // Kasıtlı dedupe bastırmaları gerçek hata değildir — sessiz-tur
  // uyarısında raporlanmaz (aksi halde yinelenen soru elenince yersiz
  // kırmızı kutu çıkardı).
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

export interface YulaChatTurnProps {
  userMessage?: YulaMessage;
  assistantMessage?: YulaMessage;
  isLive?: boolean;
  durationSec?: number;
  llmStepCount?: number;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  recoveredToolCallIds?: Set<string>;
  onUndo?: (text: string) => void;
  /** Worker izleri yalnız aktif turda */
  conversationId?: string;
}

export function YulaChatTurn({
  userMessage,
  assistantMessage,
  isLive = false,
  durationSec,
  llmStepCount,
  tokenUsage,
  recoveredToolCallIds = new Set(),
  onUndo,
  conversationId,
}: YulaChatTurnProps) {
  const yula = useYulaChat();
  const pathname = usePathname();
  const [copied, setCopied] = React.useState(false);
  const [userPromptOpen, setUserPromptOpen] = React.useState(false);

  // Kullanıcı mesajının metni
  const t = useTranslations("ChatTurn")
  const userText = React.useMemo(() => {
    if (!userMessage) return "";
    return userMessage.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n");
  }, [userMessage]);

  // Tur dili: sabit arayüz metinleri (durum etiketi, fallback) için
  const turnLang = React.useMemo(() => detectUserLanguage(userText), [userText]);

  // Asistan mesajının metni
  const assistantText = React.useMemo(() => {
    if (!assistantMessage) return "";
    return sanitizeAssistantText(
      assistantMessage.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n"),
    );
  }, [assistantMessage]);

  const handleCopyUserText = async () => {
    if (!userText) return;
    const success = await copyToClipboard(userText);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUndoUserMessage = () => {
    if (!userMessage) return;
    const text = yula.undoToUserMessage(userMessage.id);
    if (text !== undefined && onUndo) {
      onUndo(text);
    }
  };

  // Araç parçaları hazırlığı
  const toolParts = React.useMemo(() => {
    if (!assistantMessage || assistantMessage.role !== "assistant") return [];
    return assistantMessage.parts
      .map((p) => yulaToolPartInfo(p))
      .filter(
        (info): info is NonNullable<typeof info> => info !== null
      );
  }, [assistantMessage]);

  const hasSqlCard = React.useMemo(() => {
    if (!assistantMessage) return false;
    return toolParts.some(
      (i) =>
        i.toolName === "run_expert_sql" &&
        !isFailedToolInfo(i) &&
        i.state === "output-available"
    )
      ? assistantMessage.parts.some(
          (p) => p.type === "text" && p.text.includes("|")
        )
      : false;
  }, [assistantMessage, toolParts]);

  const displayAssistantMessage: YulaMessage | undefined = React.useMemo(() => {
    if (!assistantMessage) return undefined;
    const cleanedParts = assistantMessage.parts.map((p) => {
      if (p.type === "text") {
        const raw = hasSqlCard
          ? stripMarkdownTables((p as { text: string }).text)
          : (p as { text: string }).text;
        return { ...p, text: sanitizeAssistantText(raw) };
      }
      if (p.type === "reasoning" && "text" in p) {
        return { ...p, text: sanitizeAssistantText(String((p as { text?: string }).text ?? "")) };
      }
      return p;
    });
    return { ...assistantMessage, parts: cleanedParts };
  }, [assistantMessage, hasSqlCard]);

  // Metin yazılmayan turlarda son başarılı araç çıktısının "message" alanı
  // görünür yanıt olarak kullanılır (LLM, terminal ekran araçlarından sonra yazmaz).
  // Soru araçları hariç: soru kartı zaten render edilir; sistem-İngilizcesi
  // "message" alanları kullanıcı balonuna sızmamalıdır.
  const streamErrorText = assistantMessage ? yula.streamErrorTexts[assistantMessage.id] : undefined;
  let fallbackToolText = "";
  if (!assistantText.trim() && !streamErrorText) {
    for (let i = toolParts.length - 1; i >= 0; i--) {
      const info = toolParts[i];
      if (
        info.toolName === "ask_user_question" ||
        info.toolName === "request_user_confirmation" ||
        info.toolName === "suggest_next_steps"
      )
        continue;
      if (info.state !== "output-available" || isFailedToolInfo(info)) continue;
      const out = info.output as { message?: unknown } | undefined;
      if (typeof out?.message === "string" && out.message.trim()) {
        fallbackToolText = out.message.trim();
        break;
      }
    }
  }

  const fallbackMessage: YulaMessage | undefined =
    fallbackToolText && assistantMessage
      ? ({
          id: `${assistantMessage.id}-tool-reply`,
          role: "assistant",
          parts: [{ type: "text", text: fallbackToolText }],
        } as unknown as YulaMessage)
      : undefined;

  // Run-onay delegesi: turda "çalıştır" önerisi varsa (kriter ekranı, iş
  // henüz koşmadı) metin-içi "Raporu çalıştır" tıklaması ÖNCE ekranın kendi
  // Run akışına delege eder (report-run-bus); kayıtlı çalıştırıcı yoksa
  // yedek yol olarak run mesajı kullanıcı mesajı gibi gider.
  const runAction = React.useMemo(() => {
    if (!assistantMessage) return null;
    const hasExecutedRun = toolParts.some(
      (i) =>
        i.toolName === "run_job" &&
        i.state === "output-available" &&
        !isFailedToolInfo(i),
    );
    return runConfirmationClickPrompt({
      text: assistantText,
      pathname,
      lang: turnLang,
      hasExecutedRun,
    });
  }, [assistantMessage, toolParts, assistantText, pathname, turnLang]);

  const handleRunReportClick = React.useCallback((): boolean => {
    if (!runAction) return false;
    return triggerReportRun(runAction.scope);
  }, [runAction]);

  return (
    <div className="group/turn relative flex flex-col gap-2.5 py-2">
      {/* 1. Yapışkan Soru Kartı (Kullanıcı Mesajı + Kopyala & Geri Al Simge Butonları) */}
      {userMessage && userText ? (
        <div className={cn("py-1 font-sans", isLive && "sticky top-0 z-10")}>
          <div className="group/prompt relative flex min-h-8 min-w-0 items-center justify-between gap-2 rounded-xl border border-primary/15 dark:border-primary/20 bg-gradient-to-br from-primary/[0.04] via-muted/20 to-orange-500/[0.06] dark:from-primary/10 dark:via-muted/15 dark:to-orange-500/10 backdrop-blur-md px-3 py-1.5 shadow-xs">
            <button
              type="button"
              onClick={() => setUserPromptOpen((v) => !v)}
              title={userPromptOpen ? "Kısalt" : userText}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
            >
              <p
                className={cn(
                  "text-[13px] font-sans text-foreground/95 leading-snug break-words",
                  userPromptOpen
                    ? "whitespace-pre-wrap"
                    : "overflow-hidden text-ellipsis whitespace-nowrap",
                )}
              >
                {userPromptOpen ? userText : userText.replace(/\s+/g, " ").trim()}
              </p>
            </button>

            {!isLive ? (
              <div className="flex items-center gap-0.5 opacity-0 group-hover/prompt:opacity-100 transition-opacity">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 shrink-0 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 border-0 bg-transparent shadow-none"
                  onClick={handleCopyUserText}
                  title={t("copy_question")}
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span className="sr-only">{t("copy")}</span>
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 shrink-0 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 border-0 bg-transparent shadow-none"
                  onClick={handleUndoUserMessage}
                  title={t("undo_edit")}
                >
                  <Undo2 className="size-3.5" />
                  <span className="sr-only">{t("undo_edit_short")}</span>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 2. Asistan Yanıt Alanı */}
      <div className="flex flex-col gap-2 pl-1 pr-1">
        {/* Kullanıcı mesaj gönderir göndermez (canlı veya asistan mesajı varken) katlanabilir Worked for X zaman çizelgesi */}
        <YulaWorkedAccordion
          userMessage={userMessage}
          message={assistantMessage}
          isLive={isLive}
          durationSec={durationSec}
          llmStepCount={llmStepCount}
          conversationId={conversationId}
        />

        {/* Özel Görsel Kartlar (Grafik Kartı) */}
        {toolParts.map((info) => {
          const isError = isFailedToolInfo(info);
          if (isError && recoveredToolCallIds.has(info.toolCallId)) {
            return null;
          }
          return (
            <React.Fragment key={info.toolCallId}>
              {info.toolName === "visualize_grid_data" &&
              !isError &&
              info.state === "output-available" ? (
                <YulaChartCard output={info.output} />
              ) : null}
              {info.toolName === "ask_user_question" &&
              !isError &&
              (info.state === "output-available" ||
                info.state === "input-available") ? (
                <YulaQuestionnaireCard
                  messageId={assistantMessage?.id}
                  input={info.input}
                  output={info.state === "output-available" ? info.output : undefined}
                />
              ) : null}
              {info.toolName === "suggest_next_steps" &&
              !isError &&
              (info.state === "output-available" ||
                info.state === "input-available") ? (
                <YulaSuggestionChips
                  input={info.input}
                  output={info.state === "output-available" ? info.output : undefined}
                />
              ) : null}
              {info.toolName === "run_job" &&
              !isError &&
              info.state === "output-available" &&
              typeof info.output === "object" &&
              info.output !== null &&
              (info.output as { status?: unknown }).status === "executed" &&
              typeof (info.output as { navigateTo?: unknown }).navigateTo ===
                "string" ? (
                <YulaJobStartedCard
                  jobId={
                    typeof (info.output as { jobId?: unknown }).jobId === "string"
                      ? (info.output as { jobId: string }).jobId
                      : undefined
                  }
                  navigateTo={(info.output as { navigateTo: string }).navigateTo}
                />
              ) : null}
            </React.Fragment>
          );
        })}

        {/* Nihai Akan Markdown Cevap — boş metinde sessiz kalma: canlı durum veya fallback */}
        {assistantText.trim() && displayAssistantMessage ? (
          <AiChatMessage
            message={displayAssistantMessage}
            isLive={isLive}
            onRunReport={runAction ? handleRunReportClick : undefined}
          />
        ) : fallbackMessage ? (
          <AiChatMessage
            message={fallbackMessage}
            onRunReport={runAction ? handleRunReportClick : undefined}
          />
        ) : null}

        {isLive ? (
          <div className="flex items-center gap-2 py-1.5 px-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 text-primary animate-spin" />
            <span>{liveStatusLabel(toolParts, turnLang)}</span>
          </div>
        ) : !assistantText.trim() && !fallbackMessage ? (
          <SilentTurnFallback
            toolParts={toolParts}
            streamErrorText={streamErrorText}
            onRetry={() => void yula.retryResponse()}
            lang={turnLang}
          />
        ) : null}

        {/* Cevap Altı Telemetri Çubuğu */}
        {!isLive && durationSec ? (
          <div className="mt-0.5 flex justify-end text-[10.5px] font-mono text-muted-foreground/40 select-none">
            {llmStepCount && llmStepCount > 1 ? `${llmStepCount} tur · ` : ""}
            {tokenUsage?.totalTokens ? `${formatTokenCount(tokenUsage.totalTokens)} tok · ` : ""}
            {durationSec}s
          </div>
        ) : null}
      </div>
    </div>
  );
}
