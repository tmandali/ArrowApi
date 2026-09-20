"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { YulaWorkedAccordion } from "@/components/layout/yula-worked-accordion";
import { AiChatMessage } from "@/components/layout/ai-chat-message";
import { YulaChartCard } from "@/components/layout/yula-chart-card";
import { YulaQuestionnaireCard } from "@/components/layout/yula-questionnaire-card";
import { YulaChoiceCard } from "@/components/layout/yula-choice-card";
import { YulaSuggestionChips } from "@/components/layout/yula-suggestion-chips";
import { YulaJobStartedCard } from "@/components/layout/yula-job-started-card";
import { useYulaChat } from "@/hooks/use-yula-chat";
import {
  yulaToolPartInfo,
  isFailedToolInfo,
} from "@/lib/yula-tool-info";
import { stripMarkdownTables } from "@/lib/markdown-table-strip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Copy, Check, Undo2, Loader2 } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { runConfirmationClickPrompt } from "@/lib/yula-actions";
import { triggerReportRun } from "@/lib/report-run-bus";
import {
  detectUserLanguage,
} from "@/lib/yula-lang";

import {
  formatTokenCount,
  liveStatusLabel,
  SilentTurnFallback,
  hasVisibleTurnContent,
  INTERACTIVE_CARD_TOOLS,
} from "./yula-chat-turn-helpers";
import { modelCatalog } from "@my-agent/core";

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

  // Kullanıcı mesajındaki ekli dosyalar / görseller
  const userFiles = React.useMemo(() => {
    if (!userMessage?.parts) return [];
    return userMessage.parts.filter(
      (p) =>
        ((p as { type: string }).type === "file" || (p as { type: string }).type === "image") &&
        Boolean((p as { url?: unknown; data?: unknown }).url || (p as { url?: unknown; data?: unknown }).data),
    ) as Array<{ type: string; url?: string; data?: string; filename?: string; mediaType?: string }>;
  }, [userMessage]);

  // Tur dili: sabit arayüz metinleri (durum etiketi, fallback) için
  const turnLang = React.useMemo(() => detectUserLanguage(userText), [userText]);

  // Asistan mesajının metni
  const assistantText = React.useMemo(() => {
    if (!assistantMessage) return "";
    return assistantMessage.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n");
  }, [assistantMessage]);

  const turnCostFormatted = React.useMemo(() => {
    if (!tokenUsage?.totalTokens) return null;
    const inTok = tokenUsage.inputTokens ?? 0;
    const outTok = tokenUsage.outputTokens ?? 0;
    return modelCatalog.calculateCost("gpt-4o-mini", inTok, outTok).formatted;
  }, [tokenUsage]);

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
    const hasSqlTool = toolParts.some((i) => {
      if (isFailedToolInfo(i) || i.state !== "output-available") return false;
      if (i.toolName === "run_expert_sql") return true;
      // Yeni yapı: grid SQL dispatch üzerinden gelir (RUN_SQL/QUERY/ANALYZE)
      if (i.toolName === "dispatch_component_action" && i.input && typeof i.input === "object") {
        const action = (i.input as { action?: unknown }).action;
        return action === "RUN_SQL" || action === "QUERY" || action === "ANALYZE";
      }
      return false;
    });
    return hasSqlTool
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
        return { ...p, text: raw };
      }
      if (p.type === "reasoning" && "text" in p) {
        return { ...p, text: String((p as { text?: string }).text ?? "") };
      }
      return p;
    });
    return { ...assistantMessage, parts: cleanedParts };
  }, [assistantMessage, hasSqlCard]);

  // Metin yazılmayan turlarda son başarılı araç çıktısının "message" alanı
  // görünür yanıt olarak kullanılır (LLM, terminal ekran araçlarından sonra yazmaz).
  // Soru araçları ve salt-okuma/taslak/iç taşıma mesajları hariç tutulur.
  const streamErrorText = assistantMessage ? yula.streamErrorTexts[assistantMessage.id] : undefined;
  let fallbackToolText = "";
  if (!assistantText.trim() && !streamErrorText) {
    for (let i = toolParts.length - 1; i >= 0; i--) {
      const info = toolParts[i];
      if (
        info.toolName === "ask_user_choice" ||
        info.toolName === "ask_user_question" ||
        info.toolName === "request_user_confirmation" ||
        info.toolName === "suggest_next_steps"
      )
        continue;
      if (info.state !== "output-available" || isFailedToolInfo(info)) continue;

      // Standart component dispatch eylemlerinde salt-okuma veya iç taşıma eylemleri
      // (READ, SCHEMA, VALIDATE) kullanıcı sohbet balonuna sızmamalıdır.
      if (info.toolName === "dispatch_component_action") {
        const action = (info.input as { action?: string } | undefined)?.action;
        if (action === "READ" || action === "SCHEMA" || action === "VALIDATE") {
          continue;
        }
      }

      const out = info.output as { message?: unknown } | undefined;
      if (typeof out?.message === "string" && out.message.trim()) {
        const msg = out.message.trim();
        // Ham bileşen dispatch iletileri (örn: "criteria_form:..." bileşenine "..." komutu iletildi
        // veya Action "..." dispatched to "...") son kullanıcı sohbet metni değildir.
        if (
          /bileşenine\s+"?[^"]+"?\s+komutu iletildi/i.test(msg) ||
          /^Action\s+"?[^"]+"?\s+dispatched\s+to\s+"?[^"]+"?/i.test(msg)
        ) {
          continue;
        }
        fallbackToolText = msg;
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

  const hasVisibleContent = hasVisibleTurnContent({
    toolParts,
    assistantText,
    fallbackMessage,
  });

  const shouldShowSilentFallback =
    !isLive && (!hasVisibleContent || Boolean(streamErrorText));

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
      {userMessage && (userText || userFiles.length > 0) ? (
        <div className={cn("py-1 font-sans", isLive && "sticky top-0 z-10")}>
          <div className="group/prompt relative flex min-h-8 min-w-0 items-center justify-between gap-2 rounded-xl border border-primary/15 dark:border-primary/20 bg-gradient-to-br from-primary/[0.04] via-muted/20 to-orange-500/[0.06] dark:from-primary/10 dark:via-muted/15 dark:to-orange-500/10 backdrop-blur-md px-3 py-1.5 shadow-xs">
            <button
              type="button"
              onClick={() => setUserPromptOpen((v) => !v)}
              title={userPromptOpen ? "Kısalt" : userText}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
            >
              <div className="flex flex-col gap-1.5">
                {userFiles.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {userFiles.map((file, idx) => {
                      const fileUrl = file.url || file.data;
                      const isImg =
                        file.mediaType?.startsWith("image/") ||
                        file.type === "image" ||
                        (typeof fileUrl === "string" && fileUrl.startsWith("data:image/"));
                      return isImg && fileUrl ? (
                        <div
                          key={idx}
                          className="relative size-10 overflow-hidden rounded-md border border-border/80 bg-muted/40 shadow-xs shrink-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={fileUrl}
                            alt={file.filename || "Attached image"}
                            className="size-full object-cover"
                          />
                        </div>
                      ) : (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {file.filename || "Dosya"}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {userText ? (
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
                ) : null}
              </div>
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

        {/* 1. İçerik Araç Kartları (Grafik Kartı, Başlatılan İş vb.) */}
        {toolParts
          .filter((i) => !INTERACTIVE_CARD_TOOLS.has(i.toolName))
          .map((info) => {
            const isError = isFailedToolInfo(info);
            if (isError && recoveredToolCallIds.has(info.toolCallId)) return null;
            if (info.toolName === "visualize_grid_data" && !isError && info.state === "output-available") {
              return <YulaChartCard key={info.toolCallId} output={info.output} />;
            }
            const isJob =
              (info.toolName === "run_job" ||
                (info.input as { action?: string } | undefined)?.action === "RUN" ||
                (info.output as { status?: string } | undefined)?.status === "executed") &&
              !isError &&
              info.state === "output-available" &&
              typeof (info.output as { navigateTo?: unknown })?.navigateTo === "string";
            if (isJob) {
              const out = info.output as { jobId?: string; navigateTo: string };
              return <YulaJobStartedCard key={info.toolCallId} jobId={out.jobId} navigateTo={out.navigateTo} />;
            }
            return null;
          })}

        {/* 2. Nihai Akan Markdown Cevap / Plan Metni — Kullanıcı önce planı okur */}
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

        {/* 3. Etkileşimli Karar ve Takip Kartları (Seçenekler, Anketler, Öneriler) — Planın hemen altında */}
        {toolParts
          .filter((i) => INTERACTIVE_CARD_TOOLS.has(i.toolName))
          .map((info) => {
            const isError = isFailedToolInfo(info);
            if (isError && recoveredToolCallIds.has(info.toolCallId)) return null;
            const isReady = info.state === "output-available" || info.state === "input-available";
            if (info.toolName === "ask_user_choice" && !isError && isReady) {
              return (
                <YulaChoiceCard
                  key={info.toolCallId}
                  toolCallId={info.toolCallId}
                  messageId={assistantMessage?.id}
                  input={info.input}
                  output={info.state === "output-available" ? info.output : undefined}
                />
              );
            }
            if (info.toolName === "ask_user_question" && !isError && isReady) {
              return (
                <YulaQuestionnaireCard
                  key={info.toolCallId}
                  messageId={assistantMessage?.id}
                  input={info.input}
                  output={info.state === "output-available" ? info.output : undefined}
                />
              );
            }
            if (info.toolName === "suggest_next_steps" && !isError && isReady) {
              return <YulaSuggestionChips key={info.toolCallId} input={info.input} output={info.state === "output-available" ? info.output : undefined} />;
            }
            return null;
          })}

        {isLive ? (
          <div className="flex items-center gap-2 py-1.5 px-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 text-primary animate-spin" />
            <span>{liveStatusLabel(toolParts, t, turnLang)}</span>
          </div>
        ) : shouldShowSilentFallback ? (
          <SilentTurnFallback
            toolParts={toolParts}
            streamErrorText={streamErrorText}
            recoveredToolCallIds={recoveredToolCallIds}
            onRetry={() => void yula.retryResponse()}
            lang={turnLang}
          />
        ) : null}

        {/* Cevap Altı Telemetri Çubuğu */}
        {!isLive && (durationSec || tokenUsage?.totalTokens) ? (
          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] font-mono text-muted-foreground/45 select-none">
            {llmStepCount && llmStepCount > 1 ? <span>{llmStepCount} tur · </span> : null}
            {tokenUsage?.totalTokens ? (
              <span>
                {formatTokenCount(tokenUsage.totalTokens)} tok
                {tokenUsage.inputTokens !== undefined && tokenUsage.outputTokens !== undefined ? (
                  <span className="text-muted-foreground/30"> ({formatTokenCount(tokenUsage.inputTokens)}/{formatTokenCount(tokenUsage.outputTokens)})</span>
                ) : null}
                {" · "}
              </span>
            ) : null}
            {turnCostFormatted ? <span>{turnCostFormatted} · </span> : null}
            {durationSec ? <span>{durationSec}s</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
