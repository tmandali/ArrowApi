"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAgentChat, useAgentSteering } from "@my-agent/react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { useChatsStore } from "@/lib/stores/chats";
import { clearTurnTrace } from "@/lib/yula-turn-trace";
import { extractWorkedSteps } from "@/components/layout/yula-worked-steps";
import {
  getRequestStartMs,
  clearRequestStart,
  markRequestStart,
  setActiveConversationId,
  resolveCurrentAgentId,
  type LiveHelpers,
} from "./chat-shared";
import {
  executeComponentAction,
  multiLaneScheduler,
  retryWithBackoff,
} from "@my-agent/core";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { exportDetailedYulaSessionDump } from "@/lib/yula-session-dump";
import { useHeadlessSystemComponents } from "./use-headless-system-components";

/**
 * Yula Chat Instance — Saf @my-agent/react motoru ve Headless UI-Agent bileşen kaydı.
 *
 * Demo projedeki gibi yapay Vercel SDK manuel döngüleri, prompt kuyruklama
 * veya süre kapıları (sendGate) içermez; araçlar ve olaylar doğrudan EventBus
 * ve @my-agent/core üzerinden yürütülür.
 */
export function ChatInstance({
  conversationId,
  onContextReady,
}: {
  conversationId: string;
  onContextReady: (helpers: LiveHelpers) => void;
}) {
  const router = useRouter();
  const saveMessages = useChatsStore((s) => s.saveMessages);
  const renameFromFirstMessage = useChatsStore((s) => s.renameFromFirstMessage);

  const initialMessages = React.useMemo(
    () => useChatsStore.getState().messagesById[conversationId] ?? [],
    [conversationId],
  );

  const [responseDurations, setResponseDurations] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    setActiveConversationId(conversationId);
  });

  // Headless UI-Agent Sistem Bileşenleri: app_router, job_history & criteria_form:*
  useHeadlessSystemComponents(router);

  const userStoppedRef = React.useRef(false);
  const [stopped, setStopped] = React.useState(false);
  const [streamErrorTexts, setStreamErrorTexts] = React.useState<Record<string, string>>({});

  const currentPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/";

  // Saf @my-agent/react sohbet motoru
  const chat = useAgentChat(currentPath, {
    initialMessages: initialMessages as any,
    compactEndpoint: "/api/compact",
    compactionSettings: {
      enabled: true,
      reserveTokens: 16384,
      keepRecentTokens: 20000,
    },
    onCompaction(_result) {
      saveMessages(conversationId, chat.messages as YulaMessage[]);
    },
    onError(err) {
      console.error("🤖 [Yula Chat Client Error Details]:", err);
      userStoppedRef.current = true;
      setStopped(true);
      const raw = err instanceof Error ? err.message : String(err);
      const lastAssistant = [...chat.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (lastAssistant && raw) {
        setStreamErrorTexts((prev) =>
          prev[lastAssistant.id] === raw ? prev : { ...prev, [lastAssistant.id]: raw },
        );
      }
    },
  });

  const status = chat.status;

  const {
    steeringQueue,
    followUpQueue,
    clearSteering,
    clearFollowUp,
  } = useAgentSteering();

  const steer = React.useCallback(
    (text: string) => {
      chat.steer(text);
    },
    [chat],
  );

  const followUp = React.useCallback(
    (text: string) => {
      chat.followUp(text);
    },
    [chat],
  );

  // Background indexing with Multi-Lane Scheduler (lane: background)
  React.useEffect(() => {
    multiLaneScheduler.enqueue("background", "Init Yula Storage Buckets", async () => {
      const { initYulaStorageBuckets } = await import("@/lib/yula-storage-buckets");
      await initYulaStorageBuckets().catch(() => {});
    });
    multiLaneScheduler.enqueue("background", "DuckDB RAG Schema Indexing", async () => {
      const { indexReportSchemas } = await import("@/services/duckdb-vector");
      await indexReportSchemas().catch((err) =>
        console.warn("[Yula RAG] Background indexing error:", err),
      );
    });
  }, []);

  // Mesaj kalıcılığı
  React.useEffect(() => {
    if (!conversationId || status !== "ready") return;
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : undefined;
    const currentAgentId = currentPath ? resolveCurrentAgentId(currentPath) : null;
    saveMessages(conversationId, chat.messages, currentPath, currentAgentId);
    const firstUser = chat.messages.find((m) => m.role === "user");
    const textPart = firstUser?.parts?.find(
      (p): p is Extract<(typeof p), { type: "text" }> => (p as { type: string }).type === "text",
    );
    const text = textPart && "text" in textPart ? textPart.text : "";
    if (text) renameFromFirstMessage(conversationId, text, currentAgentId);
  }, [status, chat.messages, conversationId, saveMessages, renameFromFirstMessage]);

  const stopResponse = React.useCallback(async () => {
    userStoppedRef.current = true;
    setStopped(true);
    await chat.stop();
  }, [chat]);

  const retryResponse = React.useCallback(async () => {
    userStoppedRef.current = false;
    setStopped(false);
    await retryWithBackoff(
      async () => {
        await chat.regenerate();
      },
      { maxRetries: 2, initialDelayMs: 250, backoffMultiplier: 2 }
    );
  }, [chat]);

  const isTurnActive = (status === "submitted" || status === "streaming") && !stopped;
  const busy = isTurnActive;

  // Sayaç ve yanıt süresi takibi
  React.useEffect(() => {
    if (isTurnActive && getRequestStartMs() === null) {
      markRequestStart();
    }
    if (!isTurnActive && getRequestStartMs() !== null) {
      const durationSec = Math.max(
        1,
        Math.round((Date.now() - (getRequestStartMs() ?? Date.now())) / 1000),
      );
      const applyDuration = () => {
        setResponseDurations((prev) => {
          const next = { ...prev };
          const lastMsg = chat.messages[chat.messages.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            next[lastMsg.id] = durationSec;
          }
          return next;
        });
      };
      applyDuration();
      clearRequestStart();
    }
  }, [isTurnActive, chat.messages]);

  const [llmStepCounts, setLlmStepCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const assistantMsgs = chat.messages.filter((m) => m.role === "assistant");
    const counts: Record<string, number> = {};
    for (const msg of assistantMsgs) {
      const steps = extractWorkedSteps(msg, false);
      if (steps.length > 0) {
        counts[msg.id] = steps.length;
      } else {
        const stepStarts = (msg.parts || []).filter((p) => (p as { type: string }).type === "step-start").length;
        counts[msg.id] = stepStarts > 0 ? stepStarts : 1;
      }
    }
    // eslint-disable-next-line react/set-state-in-effect -- mesaj dizisinden türetilen adım sayacı; harici chat.messages senkronu
    setLlmStepCounts(counts);
  }, [chat.messages]);

  const undoToUserMessage = React.useCallback(
    (messageId: string): string | undefined => {
      const idx = chat.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return undefined;

      const targetMsg = chat.messages[idx];
      const textPart = targetMsg.parts?.find((p) => (p as { type: string }).type === "text") as
        | { text?: string }
        | undefined;
      const userText = textPart?.text ?? "";

      const remainingMessages = chat.messages.slice(0, idx);
      chat.setMessages(remainingMessages);

      const currentPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : undefined;
      saveMessages(
        conversationId,
        remainingMessages,
        currentPath,
        currentPath ? resolveCurrentAgentId(currentPath) : null,
      );

      userStoppedRef.current = false;
      setStopped(false);

      return userText;
    },
    [chat, conversationId, saveMessages],
  );

  const dumpSession = React.useCallback(() => {
    const currentRoute = typeof window !== "undefined" ? window.location.pathname : "/";
    exportDetailedYulaSessionDump(chat.messages, conversationId, currentRoute);
  }, [chat.messages, conversationId]);

  const sendMessageText = React.useCallback(
    (
      text: string,
      attachmentsList?: Array<{ name: string; type: string; dataUrl?: string }>,
    ) => {
      userStoppedRef.current = false;
      setStopped(false);
      clearTurnTrace(conversationId);

      const imageFiles = (attachmentsList ?? []).filter(
        (f) => f.dataUrl && f.type.startsWith("image/"),
      );
      const nonImageFiles = (attachmentsList ?? []).filter(
        (f) => !f.type.startsWith("image/"),
      );

      const attachmentNote =
        nonImageFiles.length > 0
          ? `\n\n[Ekler: ${nonImageFiles.map((file) => file.name).join(", ")}]`
          : "";

      const finalText = `${text}${attachmentNote}`.trim();

      if (imageFiles.length > 0) {
        const files = imageFiles.map((f) => ({
          type: "file" as const,
          filename: f.name,
          mediaType: f.type,
          url: f.dataUrl!,
        }));
        void chat.sendMessage({ text: finalText, files });
      } else {
        void chat.sendMessage({ text: finalText });
      }
    },
    [chat, conversationId],
  );

  const runPendingTool = React.useCallback(
    async (part: { toolCallId: string; toolName: string; input?: unknown; state?: string }) => {
      const args = (part.input ?? {}) as Record<string, unknown>;
      if (part.toolName === "dispatch_component_action") {
        await executeComponentAction({
          component_id: String(args.component_id ?? ""),
          action: String(args.action ?? ""),
          payload: (args.payload as Record<string, unknown>) ?? {},
          toolCallId: part.toolCallId,
        });
      } else {
        await executeDispatchComponentAction({
          component_id: part.toolName,
          action: "RUN",
          payload: args,
        });
      }
    },
    [],
  );

  const value = React.useMemo(
    () => ({
      messages: chat.messages as YulaMessage[],
      status: chat.status,
      stop: stopResponse,
      error: chat.error ?? undefined,
      busy,
      stopped,
      retryResponse,
      undoToUserMessage,
      addToolOutput: chat.addToolOutput,
      isTurnActive: busy,
      responseDurations,
      llmStepCounts,
      streamErrorTexts,
      dumpSession,
      sendMessageText,
      runPendingTool,
      contextUsage: chat.contextUsage,
      autoCompactEnabled: chat.autoCompactEnabled,
      setAutoCompactEnabled: chat.setAutoCompactEnabled,
      isCompacting: chat.isCompacting,
      compact: chat.compact,
      steer,
      followUp,
      steeringQueue,
      followUpQueue,
      clearSteering,
      clearFollowUp,
    }),
    [
      chat.messages,
      chat.status,
      chat.error,
      chat.addToolOutput,
      chat.contextUsage,
      chat.autoCompactEnabled,
      chat.setAutoCompactEnabled,
      chat.isCompacting,
      chat.compact,
      stopResponse,
      busy,
      stopped,
      retryResponse,
      undoToUserMessage,
      responseDurations,
      llmStepCounts,
      streamErrorTexts,
      dumpSession,
      sendMessageText,
      runPendingTool,
      steer,
      followUp,
      steeringQueue,
      followUpQueue,
      clearSteering,
      clearFollowUp,
    ],
  );

  React.useEffect(() => {
    onContextReady(value as LiveHelpers);
  }, [onContextReady, value]);

  return null;
}

