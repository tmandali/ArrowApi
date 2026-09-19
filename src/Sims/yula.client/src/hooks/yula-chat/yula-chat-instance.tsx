"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAgentChat } from "@my-agent/react";
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
  uiRegistry,
  uiEventBus,
  type ComponentSchema,
  executeComponentAction,
  piEventStream,
} from "@my-agent/core";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { exportDetailedYulaSessionDump } from "@/lib/yula-session-dump";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";

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

  // Headless UI-Agent Sistem Bileşenleri: app_router & job_history
  React.useEffect(() => {
    const routerSchema: ComponentSchema = {
      id: "app_router",
      meta: { description: "Sayfa ve Rota Yönlendirici" },
      actions: {
        NAVIGATE: {
          description: "Kullanıcıyı hedef sayfaya/rapora yönlendirir ({ path }).",
          whenToCall: "Kullanıcı başka bir rapor veya sayfaya gitmek istediğinde.",
          whenNotToCall: "Kullanıcı zaten o ekrandayken.",
        },
      },
    };
    uiRegistry.register(routerSchema);
    const unsubRouter = uiEventBus.subscribe("app_router", (action, payload) => {
      if (action === "NAVIGATE" && payload?.path) {
        let rawPath = String(payload.path).trim();
        const [basePath, search] = rawPath.split("?");
        const clean = basePath.replace(/^\//, "").toLowerCase();
        const matched = REGISTERED_REPORTS.find(
          (r) =>
            r.pagePath.toLowerCase() === basePath.toLowerCase() ||
            r.scope.toLowerCase() === clean ||
            clean.endsWith(r.scope.toLowerCase()) ||
            r.aliases.some((a) => a.toLowerCase() === clean),
        );
        let targetPath = matched ? matched.pagePath : basePath;
        if (search) {
          targetPath = `${targetPath}?${search}`;
        }
        router.push(targetPath);
        return { success: true, navigatedTo: targetPath };
      }
      return { success: false, error: "Bilinmeyen router aksiyonu" };
    });

    const jobHistorySchema: ComponentSchema = {
      id: "job_history",
      meta: { description: "Rapor Çalışma Geçmişi ve İş Takibi" },
      actions: {
        OPEN_LAST: {
          description: "En son tamamlanan rapor sonucunu ekranda açar.",
          whenToCall: "Kullanıcı 'son raporu aç', 'en son sonucu göster' dediğinde.",
          whenNotToCall: "Yeni bir rapor çalıştırılmak istendiğinde.",
        },
        LIST: {
          description: "Geçmiş işleri listeler.",
          whenToCall: "Kullanıcı 'hangi raporlar çalıştı', 'geçmiş' dediğinde.",
          whenNotToCall: "Mevcut rapor incelenirken.",
        },
        CANCEL: {
          description: "Çalışmakta olan işi iptal eder ({ jobId }).",
          whenToCall: "Kullanıcı 'durdur', 'iptal et' dediğinde.",
          whenNotToCall: "İş zaten tamamlanmışken.",
        },
      },
    };
    uiRegistry.register(jobHistorySchema);
    const unsubJob = uiEventBus.subscribe("job_history", (action, payload) => {
      return executeDispatchComponentAction({ component_id: "job_history", action, payload }) as any;
    });

    // Headless Platform Rapor Kriter Formları (REGISTERED_REPORTS):
    // Kullanıcı ana sayfada veya başka bir ekrandayken de raporları çalıştırabilmesi
    // ve form doldurabilmesi için (demo-app mimarisindeki gibi) headless olarak kaydedilir.
    const unsubReports: Array<() => void> = [];
    REGISTERED_REPORTS.forEach((report) => {
      const formCompId = `criteria_form:${report.scope}`;
      const formSchema: ComponentSchema = {
        id: formCompId,
        meta: {
          reportScope: report.scope,
          screenTitle: report.title,
          pagePath: report.pagePath,
          workspaceId: report.workspace,
          isHeadless: true,
        },
        actions: {
          APPLY: {
            description: `${report.title} kriter formuna değerleri yazar ve sayfaya yönlendirir.`,
            whenToCall: `Kullanıcı ${report.title} rapor kriterlerini girmek veya güncellemek istediğinde.`,
            whenNotToCall: "Raporu doğrudan çalıştırmak istediğinde veya form alanlarıyla ilgisiz işlemlerde.",
          },
          RUN: {
            description: `${report.title} raporunu çalıştırır ve sonuç ekranına yönlendirir.`,
            whenToCall: `Kullanıcı ${report.title} raporunu çalıştırmak veya sonuçlarını görmek istediğinde.`,
            whenNotToCall: "Sadece kriterleri taslak olarak doldurmak istediğinde.",
          },
          SCHEMA: {
            description: `${report.title} kriter şemasını inceler.`,
            whenToCall: `Raporun alanlarını ve veri formatlarını öğrenmek gerektiğinde.`,
            whenNotToCall: "Kriter yapısı zaten biliniyorken.",
          },
          READ: {
            description: `${report.title} mevcut taslak kriterlerini okur.`,
            whenToCall: `Formdaki mevcut doldurulmuş değerleri kontrol etmek için.`,
            whenNotToCall: "Yeni değerler atanırken.",
          },
          VALIDATE: {
            description: `${report.title} kriterlerini doğrular.`,
            whenToCall: `Kriter girdilerinin şema kurallarına uygunluğunu denetlemek için.`,
            whenNotToCall: "Kriter girilmediğinde.",
          },
        },
      };
      uiRegistry.register(formSchema);
      const unsub = uiEventBus.subscribe(formCompId, async (action, payload) => {
        const res = (await executeDispatchComponentAction({
          component_id: formCompId,
          action,
          payload: { ...payload, report: report.scope },
        })) as Record<string, unknown> | null;

        if (res && typeof res === "object") {
          const navTarget =
            (res.navigateTo as string) ||
            (action === "APPLY" || action === "RUN" ? report.pagePath : undefined);
          if (navTarget) {
            const navToolCallId = `nav_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            piEventStream.emit({
              type: "tool_execution_start",
              toolCallId: navToolCallId,
              toolName: "dispatch_component_action",
              args: {
                component_id: "app_router",
                action: "NAVIGATE",
                payload: { path: navTarget },
              },
            });
            let navOutcome: any;
            try {
              if (Boolean(uiRegistry.get("app_router"))) {
                navOutcome = uiEventBus.dispatch({
                  component_id: "app_router",
                  action: "NAVIGATE",
                  payload: { path: navTarget },
                });
              } else {
                router.push(navTarget);
                navOutcome = { success: true, result: { navigatedTo: navTarget } };
              }
            } catch (err) {
              router.push(navTarget);
              navOutcome = { success: false, error: String(err) };
            }
            const cleanNavOutput =
              navOutcome?.result ?? { success: navOutcome?.success, navigatedTo: navTarget };
            piEventStream.emit({
              type: "tool_execution_end",
              toolCallId: navToolCallId,
              toolName: "dispatch_component_action",
              result: cleanNavOutput,
              isError: !navOutcome?.success,
            });
          }
        }
        return res;
      });
      unsubReports.push(unsub);
    });

    return () => {
      unsubRouter();
      unsubJob();
      unsubReports.forEach((unsub) => unsub());
      uiRegistry.unregister("app_router");
      uiRegistry.unregister("job_history");
      REGISTERED_REPORTS.forEach((report) => {
        uiRegistry.unregister(`criteria_form:${report.scope}`);
      });
    };
  }, [router]);

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

  // Background indexing
  React.useEffect(() => {
    void import("@/lib/yula-storage-buckets").then(({ initYulaStorageBuckets }) => {
      void initYulaStorageBuckets().catch(() => {});
    });
    void import("@/services/duckdb-vector").then(({ indexReportSchemas }) => {
      void indexReportSchemas().catch((err) =>
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
    await chat.regenerate();
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
    ],
  );

  React.useEffect(() => {
    onContextReady(value as LiveHelpers);
  }, [onContextReady, value]);

  return null;
}
