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
export function computeDedupedMessages(messages: YulaMessage[]): YulaMessage[] {
  const lastById = new Map<string, number>();
  messages.forEach((m, i) => lastById.set(m.id, i));
  if (lastById.size === messages.length) return messages;
  return messages.filter((m, i) => lastById.get(m.id) === i);
}

export function useDedupedMessages(messages: YulaMessage[]): YulaMessage[] {
  return React.useMemo(() => computeDedupedMessages(messages), [messages]);
}

/**
 * Pi DAG & Vercel AI SDK Standardı:
 * Çok adımlı/turlu işlemlerde (Step 1 Tool -> Step 2 Terminal Answer):
 * - Akordiyon ve Tool kartları tüm adımların araç/durum parçalarını görebilmelidir.
 * - Ana sohbet balonu ise YALNIZCA terminal (son) asistan mesajının metin parçalarını basmalıdır.
 * - Ara adımların (tool çağıran turların) metin parçaları ana balona sızmaz;
 *   akordiyonda adım geçmişinde kalması için "reasoning" (intermediate_plan) olarak korunur.
 */
export function buildTurnAssistantMessage(
  assistantMessages: YulaMessage[],
): YulaMessage | undefined {
  if (assistantMessages.length === 0) return undefined;
  if (assistantMessages.length === 1) {
    const single = assistantMessages[0];
    return {
      ...single,
      parts: single.parts ?? [],
    };
  }

  const lastAssistant = assistantMessages[assistantMessages.length - 1];

  // Metin içeren terminal (son) asistan mesajını bul
  const terminalWithText =
    [...assistantMessages].reverse().find((a) =>
      a.parts?.some(
        (p) => p.type === "text" && Boolean((p as { text?: string }).text?.trim()),
      ),
    ) ?? lastAssistant;

  const combinedParts: any[] = [];

  for (const msg of assistantMessages) {
    const isTerminal = msg.id === terminalWithText.id;
    for (const part of msg.parts ?? []) {
      if (part.type === "text") {
        if (isTerminal) {
          // Terminal metin parçası doğrudan nihai cevap balonu için eklenir
          combinedParts.push(part);
        } else {
          // Ara adım metni: Ana balona basılmaz; akordiyonda ara plan/düşünce olarak korunur
          const txt = (part as { text?: string }).text?.trim();
          if (txt) {
            combinedParts.push({
              type: "reasoning",
              text: txt,
              meta: "intermediate_plan",
            });
          }
        }
      } else {
        // Tool çağrıları, tool sonuçları, reasoning, step-start vb. aynen korunur
        combinedParts.push(part);
      }
    }
  }

  return {
    ...lastAssistant,
    parts: combinedParts,
  };
}

/** Sohbet mesajlarını Soru-Cevap turlarına (YulaChatTurn) grupla (Çok adımlı araç çağrılarını birleştirir). */
export function computeChatTurns(dedupedMessages: YulaMessage[]): ChatTurn[] {
  const list: ChatTurn[] = [];

  let currentTurn: {
    id: string;
    userMessage?: YulaMessage;
    assistantMessages: YulaMessage[];
  } | null = null;

  for (const m of dedupedMessages) {
    if (m.role === "user") {
      if (currentTurn) {
        list.push({
          id: currentTurn.id,
          userMessage: currentTurn.userMessage,
          assistantMessage: buildTurnAssistantMessage(currentTurn.assistantMessages),
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
    list.push({
      id: currentTurn.id,
      userMessage: currentTurn.userMessage,
      assistantMessage: buildTurnAssistantMessage(currentTurn.assistantMessages),
      assistantMessages: currentTurn.assistantMessages,
    });
  }
  return list;
}

export function useChatTurns(dedupedMessages: YulaMessage[]): ChatTurn[] {
  return React.useMemo(() => computeChatTurns(dedupedMessages), [dedupedMessages]);
}

/** Canlı akış görünümü: en son asistan mesajının parçalarından türetilir. */
export function computeStreamingPreview(
  messages: YulaMessage[],
  status: string,
): {
  lastAssistant?: YulaMessage;
  streaming: boolean;
  streamingThinking: string;
  streamingContent: string;
} {
  const lastAssistant =
    messages.length > 0
      ? [...messages].reverse().find((m) => m.role === "assistant")
      : undefined;
  const streaming = status === "submitted" || status === "streaming";
  const lastParts = Array.isArray(lastAssistant?.parts) ? lastAssistant.parts : [];
  const streamingThinking =
    streaming && lastAssistant
      ? lastParts
          .filter((p) => p.type === "reasoning")
          .map((p: { text?: string }) => p.text ?? "")
          .join("")
      : "";
  const streamingContent =
    streaming && lastAssistant
      ? lastParts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("")
      : "";
  return { lastAssistant, streaming, streamingThinking, streamingContent };
}

export function useStreamingPreview(
  messages: YulaMessage[],
  status: string,
): {
  lastAssistant?: YulaMessage;
  streaming: boolean;
  streamingThinking: string;
  streamingContent: string;
} {
  return React.useMemo(
    () => computeStreamingPreview(messages, status),
    [messages, status],
  );
}

/**
 * Kurtarılmış araç hataları: hatadan sonra sohbette ilerleme varsa (başarılı
 * araç çıktısı, metin ya da yeni kullanıcı mesajı) model sorunu zaten
 * çözmüştür → bu hatalar kullanıcıya KIRMIZI olarak gösterilmez (kafa
 * karışıklığını önler). Yalnız tur sonundaki gerçek başarısızlıklar kırmızıdır.
 */
export function computeRecoveredToolCallIds(messages: YulaMessage[]): Set<string> {
  const ids = new Set<string>();
  type Progress = { msgIdx: number; partIdx: number };
  const progresses: Progress[] = [];
  messages.forEach((m, mi) => {
    const parts = Array.isArray(m.parts) ? m.parts : [];
    if (m.role === "user" && parts.length === 0) {
      progresses.push({ msgIdx: mi, partIdx: 0 });
      return;
    }
    parts.forEach((p, pi) => {
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
    const parts = Array.isArray(m.parts) ? m.parts : [];
    parts.forEach((p, pi) => {
      const info = yulaToolPartInfo(p);
      if (!info || !isFailedToolInfo(info)) return;
      const hasLaterProgress = progresses.some(
        (pr) => pr.msgIdx > mi || (pr.msgIdx === mi && pr.partIdx > pi),
      );
      if (hasLaterProgress) ids.add(info.toolCallId);
    });
  });
  return ids;
}

export function useRecoveredToolCallIds(messages: YulaMessage[]): Set<string> {
  return React.useMemo(() => computeRecoveredToolCallIds(messages), [messages]);
}
