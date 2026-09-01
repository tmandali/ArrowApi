"use client";

import * as React from "react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { YulaWorkedAccordion } from "@/components/layout/yula-worked-accordion";
import { AiChatMessage } from "@/components/layout/ai-chat-message";
import { ToolResultTable } from "@/components/layout/tool-result-table";
import { YulaChartCard } from "@/components/layout/yula-chart-card";
import { yulaToolPartInfo, isFailedToolInfo, useYulaChat } from "@/hooks/use-yula-chat";
import { stripMarkdownTables } from "@/lib/markdown-table-strip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Copy, Check, Undo2, Sparkles, Loader2 } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

export interface YulaChatTurnProps {
  userMessage?: YulaMessage;
  assistantMessage?: YulaMessage;
  isLive?: boolean;
  durationSec?: number;
  llmStepCount?: number;
  recoveredToolCallIds?: Set<string>;
  onUndo?: (text: string) => void;
}

export function YulaChatTurn({
  userMessage,
  assistantMessage,
  isLive = false,
  durationSec,
  llmStepCount,
  recoveredToolCallIds = new Set(),
  onUndo,
}: YulaChatTurnProps) {
  const yula = useYulaChat();
  const [copied, setCopied] = React.useState(false);

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
    return assistantMessage.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n");
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
    if (!hasSqlCard) return assistantMessage;
    return {
      ...assistantMessage,
      parts: assistantMessage.parts.map((p) =>
        p.type === "text"
          ? { ...p, text: stripMarkdownTables((p as { text: string }).text) }
          : p
      ),
    };
  }, [assistantMessage, hasSqlCard]);

  return (
    <div className="group/turn relative flex flex-col gap-2.5 py-2">
      {/* 1. Yapışkan Soru Kartı (Kullanıcı Mesajı + Kopyala & Geri Al Simge Butonları) */}
      {userMessage && userText ? (
        <div className="sticky top-0 z-10 py-1 bg-transparent font-sans">
          <div className="group/prompt relative flex items-center justify-between gap-3 rounded-xl border border-primary/15 dark:border-primary/20 bg-gradient-to-br from-primary/[0.04] via-muted/20 to-orange-500/[0.06] dark:from-primary/10 dark:via-muted/15 dark:to-orange-500/10 backdrop-blur-md px-3.5 py-2.5 shadow-xs transition-all">
            <p className="flex-1 text-[13px] font-sans text-foreground/95 leading-relaxed whitespace-pre-wrap break-words">
              {userText}
            </p>

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

        {/* Nihai Akan Markdown Cevap */}
        {displayAssistantMessage ? (
          <AiChatMessage
            message={displayAssistantMessage}
            isLive={isLive}
          />
        ) : isLive ? (
          <div className="flex items-center gap-2 py-1.5 px-2 text-[12px] text-muted-foreground animate-pulse">
            <Sparkles className="size-3.5 text-primary animate-spin" />
            <span>Yula yanıt hazırlıyor...</span>
          </div>
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
