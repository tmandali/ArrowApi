"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAgentChat, useAgentSteering } from "@my-agent/react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { useChatsStore } from "@/lib/stores/chats";
import { clearTurnTrace } from "@/lib/yula-turn-trace";
import { extractWorkedSteps } from "@/components/layout/yula-worked-steps";
import {
  getRequestStartMs, clearRequestStart, markRequestStart,
  setActiveConversationId, resolveCurrentAgentId, type LiveHelpers,
} from "./chat-shared";
import { isAiAllowedOnRoute } from "@/lib/contracts/screen-contract";
import {
  executeComponentAction,
  multiLaneScheduler,
  retryWithBackoff,
  uiEventBus,
  classifyDiagnosticError,
  getMessageText,
} from "@my-agent/core";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { exportDetailedYulaSessionDump } from "@/lib/yula-session-dump";
import { useHeadlessSystemComponents } from "./use-headless-system-components";
import {
  readYulaClientAiConfig,
  writeYulaClientAiConfig,
  yulaModelsApiUrl,
} from "@/lib/yula-ai-client-config";
import { useProviderDialogStore } from "@/lib/stores/provider-dialog-store";

import { normalizeHitlPrompt, isHitlResolved } from "@/lib/contracts/hitl-prompt";
import { yulaToolPartInfo } from "@/lib/yula-tool-info";

/**
 * Yula Chat Instance — Saf @my-agent/react motoru ve Headless UI-Agent bileşen kaydı.
 */
let errorIdCounter = 0;
function nextErrorAssistantId(): string {
  errorIdCounter += 1;
  return `asst_err_${errorIdCounter}`;
}

function extractPendingChoice(messages?: any[]) {
  if (!messages || messages.length === 0) return null;
  const lastAsst = [...messages].reverse().find((m) => m?.role === "assistant");
  if (!lastAsst) return null;

  const lastAsstIdx = messages.lastIndexOf(lastAsst);
  if (messages.slice(lastAsstIdx + 1).some((m) => m?.role === "user")) return null;

  const parts = (lastAsst as any).parts;
  if (!Array.isArray(parts)) return null;

  for (const p of parts) {
    const info = yulaToolPartInfo(p);
    if (!info) continue;
    const isHitl = info.toolName === "ask_user_choice" || info.toolName === "request_user_confirmation";
    if (isHitl && !isHitlResolved(info.output)) {
      return normalizeHitlPrompt({
        toolName: info.toolName,
        toolCallId: info.toolCallId || "",
        messageId: lastAsst.id,
        input: info.input || {},
        output: info.output,
      });
    }
  }
  return null;
}

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

  // Proaktif Kritik Telemetri Dinleyicisi
  React.useEffect(() => {
    const unsub = uiEventBus.onCritical((event) => {
      const errPayload =
        (event.payload as { error?: string; message?: string })?.error ||
        (event.payload as { error?: string; message?: string })?.message ||
        event.type;
      const diagnostic = classifyDiagnosticError(errPayload, {
        source: event.source,
        payload: event.payload,
        topic: event.topic,
        correlationId: event.correlationId,
      });
      console.warn(
        `🚨 [Yula Critical Telemetry]: ${event.type} (${diagnostic.category}) -> ${diagnostic.action}`,
      );
    });
    return unsub;
  }, []);

  const userStoppedRef = React.useRef(false);
  const [stopped, setStopped] = React.useState(false);
  const [streamErrorTexts, setStreamErrorTexts] = React.useState<Record<string, string>>({});

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = `${pathname || "/"}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;

  const storeModel = useChatsStore((s) => s.model);

  // Saf @my-agent/react sohbet motoru
  const chat = useAgentChat(currentPath, {
    model: storeModel || undefined,
    getAiConfig: () => {
      const cfg = readYulaClientAiConfig();
      const chatsStore = useChatsStore.getState();
      return {
        provider: cfg.provider,
        endpoint: cfg.endpoint,
        thinking: cfg.thinking !== undefined ? cfg.thinking : chatsStore.isThinkingEnabled,
        effort: cfg.effort,
      };
    },
    onSelectModel: (modelId, provider) => {
      useChatsStore.getState().setModel(modelId);
      writeYulaClientAiConfig({
        model: modelId,
        ...(provider ? { provider: provider as any } : {}),
      });
    },
    onSelectProvider: (targetProvider) => {
      useProviderDialogStore.getState().openDialog(targetProvider);
    },
    onOpenLogin: (targetProvider) => {
      useProviderDialogStore.getState().openDialog(targetProvider);
    },
    initialMessages: initialMessages as any,
    compactEndpoint: "/api/compact",
    modelsEndpoint: yulaModelsApiUrl(),
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
      const verdict = classifyDiagnosticError(raw);
      const userMsg = verdict.userFriendlyExplanation || raw;
      let lastAssistant = [...chat.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (!lastAssistant) {
        const errId = nextErrorAssistantId();
        lastAssistant = {
          id: errId,
          role: "assistant",
          content: "",
          parts: [],
        } as any;
        chat.setMessages([...chat.messages, lastAssistant] as any);
      }
      if (lastAssistant && userMsg) {
        setStreamErrorTexts((prev) =>
          prev[lastAssistant!.id] === userMsg ? prev : { ...prev, [lastAssistant!.id]: userMsg },
        );
      }
    },
  });

  const status = chat.status;

  const { steeringQueue, followUpQueue, clearSteering, clearFollowUp } = useAgentSteering();
  const steer = React.useCallback((text: string) => { chat.steer(text); }, [chat]);
  const followUp = React.useCallback((text: string) => { chat.followUp(text); }, [chat]);

  // Background indexing with Multi-Lane Scheduler (lane: background)
  React.useEffect(() => {
    multiLaneScheduler.enqueue("background", "Init Yula Storage Buckets", async () => {
      const { initYulaStorageBuckets } = await import("@/lib/yula-storage-buckets");
      await initYulaStorageBuckets().catch(() => {});
    });
    multiLaneScheduler.enqueue("background", "WasmSQL RAG Schema Indexing", async () => {
      const { indexReportSchemas } = await import("@/services/wasmsql-vector");
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
    const text = getMessageText(firstUser);
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

  const pendingChoice = extractPendingChoice(chat.messages);
  const isSuspended = Boolean(pendingChoice || chat.isSuspended);
  const isTurnActive = (status === "submitted" || status === "streaming") && !stopped && !isSuspended;
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
      const userText = getMessageText(targetMsg);

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

      if (!isAiAllowedOnRoute(pathname || "/")) {
        const ts = Date.now();
        const userMsg = { id: `usr_${ts}`, role: "user" as const, content: text, parts: [{ type: "text", text }] };
        const asstMsg = {
          id: `asst_${ts + 1}`,
          role: "assistant" as const,
          content: "🛑 Bu ekranda güvenlik politikaları gereğince AI asistanı devre dışıdır.",
          parts: [{ type: "text", text: "🛑 Bu ekranda güvenlik politikaları gereğince AI asistanı devre dışıdır." }],
        };
        chat.setMessages([...chat.messages, userMsg as any, asstMsg as any]);
        return;
      }

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
    [chat, conversationId, pathname],
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

  const chatAddToolOutput = chat.addToolOutput;
  const chatSteer = chat.steer;
  const respondToChoice = React.useCallback(
    (val: string) => {
      if (pendingChoice?.toolCallId && chatAddToolOutput) {
        chatAddToolOutput({
          toolCallId: pendingChoice.toolCallId,
          output: { selected: val, value: val },
        });
      }
      chatSteer(val);
    },
    [pendingChoice, chatAddToolOutput, chatSteer],
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
      isSuspended,
      pendingChoice,
      respondToChoice,
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
      isSuspended,
      pendingChoice,
      respondToChoice,
    ],
  );

  React.useEffect(() => {
    onContextReady(value as LiveHelpers);
  }, [onContextReady, value]);

  return null;
}

