"use client";

import * as React from "react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { yulaToolPartInfo, isFailedToolInfo } from "@/lib/yula-tool-info";

export type ChatTurn = {
  id: string;
  userMessage?: YulaMessage;
  assistantMessage?: YulaMessage;
  assistantMessages: YulaMessage[];
};

/** SDK geçişlerinde (stream + persist rehydrate) aynı id'li mesaj dizide
 *  iki kez bulunabilir → React key çakışması ve çift balon render'ı.
 *  Render öncesi id'ye göre tekilleştir (SON kopya en taze durumudur). */
export function useDedupedMessages(messages: YulaMessage[]): YulaMessage[] {
  return React.useMemo(() => {
    const lastById = new Map<string, number>();
    messages.forEach((m, i) => lastById.set(m.id, i));
    if (lastById.size === messages.length) return messages;
    return messages.filter((m, i) => lastById.get(m.id) === i);
  }, [messages]);
}

/** Sohbet mesajlarını Soru-Cevap turlarına (YulaChatTurn) grupla (Çok adımlı araç çağrılarını birleştirir). */
export function useChatTurns(dedupedMessages: YulaMessage[]): ChatTurn[] {
  return React.useMemo(() => {
    const list: ChatTurn[] = [];

    let currentTurn: {
      id: string;
      userMessage?: YulaMessage;
      assistantMessages: YulaMessage[];
    } | null = null;

    for (const m of dedupedMessages) {
      if (m.role === "user") {
        if (currentTurn) {
          const combinedParts = currentTurn.assistantMessages.flatMap((a) => a.parts);
          const lastAssistant = currentTurn.assistantMessages[currentTurn.assistantMessages.length - 1];
          list.push({
            id: currentTurn.id,
            userMessage: currentTurn.userMessage,
            assistantMessage: lastAssistant ? { ...lastAssistant, parts: combinedParts } : undefined,
            assistantMessages: currentTurn.assistantMessages,
          });
        }
        currentTurn = { id: m.id, userMessage: m, assistantMessages: [] };
      } else if (m.role === "assistant") {
        if (currentTurn) {
          currentTurn.assistantMessages.push(m);
        } else {
          list.push({ id: m.id, assistantMessage: m, assistantMessages: [m] });
        }
      }
    }
    if (currentTurn) {
      const combinedParts = currentTurn.assistantMessages.flatMap((a) => a.parts);
      const lastAssistant = currentTurn.assistantMessages[currentTurn.assistantMessages.length - 1];
      list.push({
        id: currentTurn.id,
        userMessage: currentTurn.userMessage,
        assistantMessage: lastAssistant ? { ...lastAssistant, parts: combinedParts } : undefined,
        assistantMessages: currentTurn.assistantMessages,
      });
    }
    return list;
  }, [dedupedMessages]);
}

/** Canlı akış görünümü: en son asistan mesajının parçalarından türetilir. */
export function useStreamingPreview(
  messages: YulaMessage[],
  status: string,
): {
  lastAssistant?: YulaMessage;
  streaming: boolean;
  streamingThinking: string;
  streamingContent: string;
} {
  return React.useMemo(() => {
    const lastAssistant =
      messages.length > 0
        ? [...messages].reverse().find((m) => m.role === "assistant")
        : undefined;
    const streaming = status === "submitted" || status === "streaming";
    const streamingThinking =
      streaming && lastAssistant
        ? lastAssistant.parts
            .filter((p) => p.type === "reasoning")
            .map((p: { text?: string }) => p.text ?? "")
            .join("")
        : "";
    const streamingContent =
      streaming && lastAssistant
        ? lastAssistant.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("")
        : "";
    return { lastAssistant, streaming, streamingThinking, streamingContent };
  }, [messages, status]);
}

/**
 * Kurtarılmış araç hataları: hatadan sonra sohbette ilerleme varsa (başarılı
 * araç çıktısı, metin ya da yeni kullanıcı mesajı) model sorunu zaten
 * çözmüştür → bu hatalar kullanıcıya KIRMIZI olarak gösterilmez (kafa
 * karışıklığını önler). Yalnız tur sonundaki gerçek başarısızlıklar kırmızıdır.
 */
export function useRecoveredToolCallIds(messages: YulaMessage[]): Set<string> {
  return React.useMemo(() => {
    const ids = new Set<string>();
    type Progress = { msgIdx: number; partIdx: number };
    const progresses: Progress[] = [];
    messages.forEach((m, mi) => {
      m.parts.forEach((p, pi) => {
        if (m.role === "user") {
          progresses.push({ msgIdx: mi, partIdx: pi });
          return;
        }
        const info = yulaToolPartInfo(p);
        if (info) {
          const isInteractiveCard =
            info.toolName === "ask_user_choice" ||
            info.toolName === "ask_user_question" ||
            info.toolName === "suggest_next_steps";
          if (
            (info.state === "output-available" ||
              (isInteractiveCard && info.state === "input-available")) &&
            !isFailedToolInfo(info)
          ) {
            progresses.push({ msgIdx: mi, partIdx: pi });
          }
        } else if (
          p.type === "text" &&
          ((p as { text?: string }).text ?? "").trim()
        ) {
          progresses.push({ msgIdx: mi, partIdx: pi });
        }
      });
    });
    messages.forEach((m, mi) => {
      m.parts.forEach((p, pi) => {
        const info = yulaToolPartInfo(p);
        if (!info || !isFailedToolInfo(info)) return;
        const hasLaterProgress = progresses.some(
          (pr) => pr.msgIdx > mi || (pr.msgIdx === mi && pr.partIdx > pi),
        );
        if (hasLaterProgress) ids.add(info.toolCallId);
      });
    });
    return ids;
  }, [messages]);
}
