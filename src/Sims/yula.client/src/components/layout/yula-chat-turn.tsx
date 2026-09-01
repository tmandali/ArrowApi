"use client";

import * as React from "react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { YulaWorkedAccordion } from "@/components/layout/yula-worked-accordion";
import { AiChatMessage } from "@/components/layout/ai-chat-message";
import { ToolResultTable } from "@/components/layout/tool-result-table";
import { YulaChartCard } from "@/components/layout/yula-chart-card";
import { yulaToolPartInfo, isFailedToolInfo, useYulaChat } from "@/hooks/use-yula-chat";
import type { YulaToolPartInfo } from "@/hooks/use-yula-chat";
import { stripMarkdownTables } from "@/lib/markdown-table-strip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Copy, Check, Undo2, Loader2 } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { sanitizeAssistantText } from "@/lib/sanitize-assistant-text";
import { describeYulaStreamError } from "@/lib/yula-stream-error";

const SCREEN_TOOLS = new Set([
  "filter_current_grid",
  "set_grid_query",
  "run_report",
  "run_job",
  "apply_criteria",
  "navigate_to_page",
  "visualize_grid_data",
]);

function liveStatusLabel(toolParts: YulaToolPartInfo[]): string {
  const pending = toolParts.find(
    (i) => i.state === "input-available" || i.state === "input-streaming",
  );
  switch (pending?.toolName) {
    case "profile_grid_table":
      return "Tablo analiz ediliyor — lütfen bekleyin…";
    case "analyze_grid_data":
      return "Tablo özeti hesaplanıyor…";
    case "run_expert_sql":
      return "SQL sorgusu çalışıyor…";
    case "visualize_grid_data":
      return "Grafik hazırlanıyor…";
    case "filter_current_grid":
      return "Filtre uygulanıyor…";
    case "set_grid_query":
      return "Tablo görünümü güncelleniyor…";
    default:
      return pending
        ? "İstek işleniyor — lütfen bekleyin…"
        : "Yula yanıt hazırlıyor — lütfen bekleyin…";
  }
}

function SilentTurnFallback({
  toolParts,
  streamErrorText,
  onRetry,
}: {
  toolParts: YulaToolPartInfo[];
  streamErrorText?: string;
  onRetry: () => void;
}) {
  const failed = toolParts.filter((i) => isFailedToolInfo(i));
  const hasScreenOk = toolParts.some(
    (i) => SCREEN_TOOLS.has(i.toolName) && !isFailedToolInfo(i) && i.state === "output-available",
  );
  if (hasScreenOk && failed.length === 0 && !streamErrorText) return null;

  const friendlyStreamError = describeYulaStreamError(streamErrorText);
  const hint =
    friendlyStreamError
      ? `AI sağlayıcısı hata döndürdü: ${friendlyStreamError}`
      : failed.length > 0
        ? `Analiz tamamlanamadı: ${failed[0].errorText || (typeof failed[0].output === "object" && failed[0].output && "error" in failed[0].output ? String((failed[0].output as { error?: unknown }).error) : "araç hatası")}.`
        : "Bu turda görünür bir yanıt yazılamadı (analiz takılmış veya model sessiz bitmiş olabilir).";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/35 bg-amber-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950 dark:text-amber-100">
      <p>{hint} Yeni bir mesaj yazmadan önce yeniden deneyin.</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-fit text-[11px]"
        onClick={onRetry}
      >
        Yanıtı yeniden dene
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
  recoveredToolCallIds = new Set(),
  onUndo,
  conversationId,
}: YulaChatTurnProps) {
  const yula = useYulaChat();
  const [copied, setCopied] = React.useState(false);
  const [userPromptOpen, setUserPromptOpen] = React.useState(false);

  // Kullanıcı mesajının metni
  const userText = React.useMemo(() => {
    if (!userMessage) return "";
    return userMessage.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n");
  }, [userMessage]);

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
        (info): info is NonNullable<typeof info> =>
          info !== null && info.toolName !== "prepare_report_criteria"
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
                  title="Soruyu Kopyala"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span className="sr-only">Kopyala</span>
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 shrink-0 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 border-0 bg-transparent shadow-none"
                  onClick={handleUndoUserMessage}
                  title="Mesajı Geri Al ve Düzenle"
                >
                  <Undo2 className="size-3.5" />
                  <span className="sr-only">Geri Al ve Düzenle</span>
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
            </React.Fragment>
          );
        })}

        {/* Nihai Akan Markdown Cevap — boş metinde sessiz kalma: canlı durum veya fallback */}
        {assistantText.trim() && displayAssistantMessage ? (
          <AiChatMessage
            message={displayAssistantMessage}
            isLive={isLive}
          />
        ) : null}

        {isLive ? (
          <div className="flex items-center gap-2 py-1.5 px-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 text-primary animate-spin" />
            <span>{liveStatusLabel(toolParts)}</span>
          </div>
        ) : !assistantText.trim() ? (
          <SilentTurnFallback
            toolParts={toolParts}
            streamErrorText={
              assistantMessage ? yula.streamErrorTexts[assistantMessage.id] : undefined
            }
            onRetry={() => void yula.retryResponse()}
          />
        ) : null}

        {/* Cevap Altı Telemetri Çubuğu */}
        {!isLive && durationSec ? (
          <div className="mt-0.5 flex justify-end text-[10.5px] font-mono text-muted-foreground/40 select-none">
            {llmStepCount && llmStepCount > 1 ? `${llmStepCount} tur · ` : ""}
            {durationSec}s
          </div>
        ) : null}
      </div>
    </div>
  );
}
