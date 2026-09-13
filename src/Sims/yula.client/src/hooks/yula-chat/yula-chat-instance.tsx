"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import type { YulaMessage, YulaTools } from "@/app/api/agent/chat/route";
import {
  yulaToolPartInfo,
  SERVER_EXECUTED_TOOLS,
  DEDUPE_SKIP_MARKER,
  findDuplicateQuestionCallIds,
} from "@/lib/yula-tool-info";
import {
  isReportResultPath,
  extractJobIdFromHref,
  reportExecutionPath,
} from "@/lib/workspace-paths";
import { useChatsStore } from "@/lib/stores/chats";
import { queueYulaPrompt, takeQueuedYulaPrompt } from "@/lib/yula-pending-prompt";
import { clearTurnTrace, getTurnTrace, upsertTurnTrace } from "@/lib/yula-turn-trace";
import { GRID_COMMANDS, isYulaGridSlashPrompt, localizeYulaCommands } from "@/components/layout/yula-commands";
import { useYulaGridStore } from "@/lib/stores/grid";
import { useYulaDockStore } from "@/lib/stores/dock";
import { extractWorkedSteps } from "@/components/layout/yula-worked-steps";
import { useLocale, useTranslations } from "next-intl";
import {
  MAX_AUTO_STEPS,
  toolStepCountSinceLastUser,
  shouldContinueAfterToolOutputs,
} from "./chat-loop-policy";
import {
  getRequestStartMs,
  clearRequestStart,
  markRequestStart,
  setActiveConversationId,
  getActiveConversationId,
  resolveCurrentAgentId,
  type LiveHelpers,
} from "./chat-shared";
import { buildYulaTransport } from "./chat-transport";
import { useYulaToolRunner } from "./use-yula-tool-runner";

/**
 * Yula v2 — referans repo deseninin standart Next karşılığı.
 * Tek kaynak: ai-sdk `useChat` + zustand persist (konuşma geçmişi/model).
 *
 * Konuşma değişimi: dış sağlayıcı yalnız seçim durumunu okur,
 * içte anahtarlanmış (<ChatInstance key>) taze bir chat örneği kurulur;
 * böylece persist edilmiş mesajlar asla çalışan örneğe çift eklenmez.
 */

/** Konuşma başına tek taze chat örneği — key değiştikçe sıfırdan kurulur. */
export function ChatInstance({
  conversationId,
  onContextReady,
}: {
  conversationId: string;
  onContextReady: (helpers: LiveHelpers) => void;
}) {
  const router = useRouter();
  const tc = useTranslations("Commands");
  const locale = useLocale();
  // Yerel dilde grid komut listesi: metin alanları `Commands` next-intl
  // ad alanından çözülür; locale stabil string → yalnız locale değişince
  // yeniden hesaplanır (`tc` render başına yenidir, bağımlılık yerine locale izlenir).
  const localizedGridCommands = React.useMemo(
    () => localizeYulaCommands(GRID_COMMANDS, tc),
    /* eslint-disable react-hooks/exhaustive-deps -- `tc` render başına yenidir; locale değişimi gerçek sürücüdür, locale izlenir */
    [locale],
    /* eslint-enable react-hooks/exhaustive-deps */
  );
  const saveMessages = useChatsStore((s) => s.saveMessages);
  const renameFromFirstMessage = useChatsStore(
    (s) => s.renameFromFirstMessage,
  );

  const initialMessages = React.useMemo(
    () => useChatsStore.getState().messagesById[conversationId] ?? [],
    [conversationId],
  );

  const [responseDurations, setResponseDurations] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    setActiveConversationId(conversationId);
  });

  const transport = React.useMemo(
    () => buildYulaTransport(localizedGridCommands),
    // Mount-snapshot transport: locale değişince (stabil string) yeniden kurulur
    [localizedGridCommands],
  );

  // Kullanıcı "durdur" bayrağı — bir sonraki kullanıcı mesajına kadar otomatik
  // devam döngüsünü (sendAutomaticallyWhen + araç yürütme) kilitler.
  const userStoppedRef = React.useRef(false);
  // UI-reaktif kopya (durdurulan kısmi metin akışlarında retry butonu için)
  const [stopped, setStopped] = React.useState(false);
  // Akış hatası (sağlayıcı 401/kota/ağ vb.) — asistan mesaj id'sine kaydedilir;
  // SilentTurnFallback genel "sessiz tur" yerine anlamlı hata gösterir.
  const [streamErrorTexts, setStreamErrorTexts] = React.useState<
    Record<string, string>
  >({});
  // Tur içinde çalıştırılan araç çağrıları (araç:girdi imzası). Aynı imza
  // tekrar gelirse yeniden KOŞULMAZ; modele "zaten çalıştı" hatası döner.
  // Küçük modellerin (gemma) [metin + aynı araç çağrısı] turlarını sonsuza
  // kadar tekrarlamasını buradaki sinyal keser.
  const executedCallsRef = React.useRef<Map<string, string>>(new Map());

  const chat = useChat<YulaMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    // Streaming render seyreltme — memoized markdown bloklarıyla akıcı güncelleme
    throttle: 60,
    onError(err) {
      console.error("🤖 [Yula Chat Client Error Details]:", err);
      userStoppedRef.current = true;
      setStopped(true);
      const raw = err instanceof Error ? err.message : String(err);
      upsertTurnTrace(getActiveConversationId(), {
        id: "client-error",
        toolName: "worker",
        label: "İstemci hatası",
        isError: true,
        detailText: raw,
      });
      // Akış hatasını son asistan mesajına işle — SilentTurnFallback genel
      // "sessiz tur" yerine anlamlı hata mesajı göstersin.
      const lastAssistant = [...chat.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (lastAssistant && raw) {
        setStreamErrorTexts((prev) =>
          prev[lastAssistant.id] === raw ? prev : { ...prev, [lastAssistant.id]: raw },
        );
      }
    },
    // Cookbook/Client-Tools deseni: araç çıktısı eklendiğinde akış kendiliğinden
    // devam etsin (manuel sendMessage yerine SDK köprüsü).
    sendAutomaticallyWhen: ({ messages }) =>
      !userStoppedRef.current && shouldContinueAfterToolOutputs(messages),
  });

  const status = chat.status;

  // Storage Buckets & WASM Vector RAG şema indeksleyicisi
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

  // Konuşma kalıcılığı (localStorage / zustand persist) — ajan kimliğiyle birlikte.
  React.useEffect(() => {
    if (!conversationId || status !== "ready") return;
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : undefined;
    const currentAgentId = currentPath ? resolveCurrentAgentId(currentPath) : null;
    saveMessages(conversationId, chat.messages, currentPath, currentAgentId);
    const firstUser = chat.messages.find((m) => m.role === "user");
    const textPart = firstUser?.parts.find(
      (p): p is Extract<(typeof p), { type: "text" }> => p.type === "text",
    );
    const text =
      textPart && textPart.type === "text" ? textPart.text : "";
    if (text) renameFromFirstMessage(conversationId, text, currentAgentId);
  }, [status, chat.messages, conversationId, saveMessages, renameFromFirstMessage]);

  const runPendingTool = useYulaToolRunner(chat, executedCallsRef);

  // İstemci-tarafı araç döngüsü (cookbook "client tools"):
  // asistan turu bittiğinde bekleyen YÜRÜTÜLEBİLİR araç varsa otomatik koştur.
  // Kriter kartı katmanı kaldırıldı; rapor çalıştırma yalnız run_job ile.
  const handledToolsRef = React.useRef<Set<string>>(new Set());
  const [isExecutingTools, setIsExecutingTools] = React.useState(false);

  React.useEffect(() => {
    // TÜM asistan mesajlarındaki bekleyen araçları topla — yalnız son mesajı değil.
    // Kesintiye uğrayan eski turlar (hata/reload) sonradan gelen mesajlarla
    // kendini onaramazdı; burada geriye dönük self-heal yapılır.
    const pending = chat.messages.flatMap((m) =>
      m.role === "assistant"
        ? m.parts
            .map((p) => yulaToolPartInfo(p))
            .filter(
              (info): info is NonNullable<typeof info> =>
                info !== null &&
                info.state === "input-available" &&
                !SERVER_EXECUTED_TOOLS.has(info.toolName) &&
                !handledToolsRef.current.has(info.toolCallId),
            )
        : [],
    );
    if (pending.length === 0) return;
    pending.forEach((info) => handledToolsRef.current.add(info.toolCallId));
    // Aynı adımda yinelenen soru çağrıları: model bazen tek adımda paralel
    // iki `ask_user_question` üretir — ikisi de çalışırsa çift soru kartı
    // çıkar. Adım başına yalnız ilk soru yaşar, sonrakiler koşturulmadan
    // dedupe çıktısıyla kapatılır (kart render edilmez, tur terminal kalır).
    const duplicateAskIds = findDuplicateQuestionCallIds(chat.messages);

    void (async () => {
      setIsExecutingTools(true);
      try {
        for (const info of pending) {
          // Kullanıcı bu sırada durdurduysa kalan araçları koşturma
          if (userStoppedRef.current) break;
          // Manual agent loop telemetrisi (cookbook: "custom logging")
          console.info(
            `[Yula Agent Loop] adım ${toolStepCountSinceLastUser(chat.messages) + 1}/${MAX_AUTO_STEPS} → ${info.toolName}`,
          );
          await runPendingTool(
            {
              toolCallId: info.toolCallId,
              toolName: info.toolName,
              input: info.input,
              state: info.state,
            },
            info.toolName === "ask_user_question" &&
              duplicateAskIds.has(info.toolCallId)
              ? {
                  skipAsDuplicate:
                    DEDUPE_SKIP_MARKER +
                    " (a previous ask_user_question call in the same step was kept). " +
                    "Do not call ask_user_question again; end your turn with a short visible summary instead.",
                }
              : undefined,
          );
        }
      } finally {
        setIsExecutingTools(false);
      }
    })();
  }, [status, chat.messages, runPendingTool]);

  /**
   * "Yanıtı durdur" — akışı keser, bekleyen araç çağrılarını "durduruldu"
   * çıktısıyla kapatır (satırlar "Çalışıyor…"da asılı kalmasın) ve otomatik
   * devam döngüsünü bir sonraki kullanıcı mesajına kadar duraklatır.
   */
  const stopResponse = React.useCallback(async () => {
    userStoppedRef.current = true;
    setStopped(true);
    await chat.stop();
    const last = chat.messages[chat.messages.length - 1];
    if (last?.role === "assistant") {
      for (const p of last.parts) {
        const info = yulaToolPartInfo(p);
        if (info?.state === "input-available") {
          // SDK ToolUIPart sözleşmesi: hata → state:"output-error" + errorText
          chat.addToolOutput({
            tool: info.toolName as keyof YulaTools,
            toolCallId: info.toolCallId,
            state: "output-error",
            errorText: "Kullanıcı tarafından durduruldu.",
          });
        }
      }
    }
  }, [chat]);

  /**
   * "Yeniden dene" — SDK `regenerate`/`sendMessage` ikilisinin akıllı seçimi:
   *  • Son asistan mesajında tamamlanmış metin var → `chat.regenerate()`
   *    (SDK o mesajı geçmişten atar ve cevabı yeniden üretir).
   *  • Yoksa (durdurulmuş akış: yalnız araç parçaları) → argsız `sendMessage()`
   *    geçmişi olduğu gibi resubmit eder; araç çıktıları korunur, model devam eder.
   */
  const retryResponse = React.useCallback(async () => {
    userStoppedRef.current = false;
    setStopped(false);
    // Yeniden deneme yeni bir tur açar: tekrar-çağrı hafızası sıfırlanır.
    executedCallsRef.current.clear();
    const last = chat.messages[chat.messages.length - 1];
    const hasText =
      last?.role === "assistant" &&
      last.parts.some(
        (p) =>
          p.type === "text" &&
          typeof (p as { text?: unknown }).text === "string" &&
          ((p as { text?: string }).text ?? "").trim().length > 0,
      );
    if (hasText) {
      await chat.regenerate();
    } else {
      await chat.sendMessage();
    }
  }, [chat]);

  // TÜM YANIT SÜRECİ AKTİF Mİ? (LLM akışı + Araç yürütmeleri + Otomatik devam turları)
  const hasPendingTools = React.useMemo(() => {
    return chat.messages.some(
      (m) =>
        m.role === "assistant" &&
        m.parts.some(
          (p) => yulaToolPartInfo(p)?.state === "input-available",
        ),
    );
  }, [chat.messages]);

  const willAutoContinue = React.useMemo(() => {
    return shouldContinueAfterToolOutputs(chat.messages);
  }, [chat.messages]);

  const isTurnActive =
    (status === "submitted" ||
      status === "streaming" ||
      isExecutingTools ||
      hasPendingTools ||
      willAutoContinue) &&
    !stopped;

  // Gönder → SDK `submitted` arası boşlukta busy false kalmasın (peş peşe mesaj).
  const [sendGate, setSendGate] = React.useState(false);
  const busy = isTurnActive || sendGate;
  const busyRef = React.useRef(busy);
  React.useEffect(() => {
    busyRef.current = busy;
  });

  const pagePathname = usePathname();
  const liveGridSpec = useYulaGridStore((s) => s.spec);

  React.useEffect(() => {
    if (!isReportResultPath(pagePathname)) return;
    if (!liveGridSpec?.columns.length) return;
    if (status !== "ready") return;
    if (busyRef.current) return;
    const queued = takeQueuedYulaPrompt();
    if (!queued) return;
    const connectQueued = () => {
      userStoppedRef.current = false;
      setStopped(false);
      setSendGate(true);
    }
    connectQueued();
    upsertTurnTrace(conversationId, {
      id: "open-results",
      toolName: "worker",
      label: "Sonuç tablosu açıldı",
      isLive: false,
      input: { pathname: pagePathname },
      output: {
        table: liveGridSpec.tableName,
        cols: liveGridSpec.columns.length,
      },
    });
    upsertTurnTrace(conversationId, {
      id: "flush-prompt",
      toolName: "worker",
      label: "Kuyruktaki komut gönderiliyor",
      isLive: true,
      input: { queued },
    });
    void chat.sendMessage({ text: queued });
  }, [pagePathname, liveGridSpec, status, chat, conversationId]);

  React.useEffect(() => {
    if (!sendGate) return;
    const releaseGate = () => {
      if (isTurnActive) {
        setSendGate(false);
        return true;
      }
      return false;
    }
    if (releaseGate()) return;
    const t = window.setTimeout(() => setSendGate(false), 8_000);
    return () => window.clearTimeout(t);
  }, [sendGate, isTurnActive]);

  // Kullanıcı mesajı gönderdiği an veya tur aktifleştiği an bekleme süresi başlar (KesintisizSayaç)
  React.useEffect(() => {
    if (isTurnActive && getRequestStartMs() === null) {
      markRequestStart();
    }
  }, [isTurnActive]);

  // TÜM Yanıt Süreci tamamen bittiğinde (!isTurnActive) GERÇEK KÜMÜLATİF bekleme süresini kaydet
  React.useEffect(() => {
    if (!isTurnActive && getRequestStartMs() !== null) {
      const durationSec = Number(
        ((performance.now() - (getRequestStartMs() ?? performance.now())) / 1000).toFixed(1),
      );
      const assistantMsgs = chat.messages.filter((m) => m.role === "assistant");
      const finalDuration = durationSec > 0 ? durationSec : 0.1;
      const applyDuration = () => {
        setResponseDurations((prev) => {
          const next = { ...prev };
          for (const m of assistantMsgs) {
            if (!next[m.id]) {
              next[m.id] = finalDuration;
            }
          }
          return next;
        });
      };
      applyDuration();
      clearRequestStart();
    }
  }, [isTurnActive, chat.messages]);

  React.useEffect(() => {
    if (isTurnActive) return;
    const liveHttp = getTurnTrace(conversationId).find(
      (s) => s.id === "flush-prompt" && s.isLive,
    );
    if (!liveHttp) return;
    upsertTurnTrace(conversationId, {
      ...liveHttp,
      isLive: false,
      label: "HTTP /api/agent/chat bitti",
    });
  }, [isTurnActive, conversationId]);

  const [llmStepCounts, setLlmStepCounts] = React.useState<Record<string, number>>({});

  // Asistan mesajlarındaki ekranda görünen Worked adımlarının sayısını hesapla
  React.useEffect(() => {
    const assistantMsgs = chat.messages.filter((m) => m.role === "assistant");
    const counts: Record<string, number> = {};
    for (const msg of assistantMsgs) {
      const steps = extractWorkedSteps(msg, false);
      if (steps.length > 0) {
        counts[msg.id] = steps.length;
      } else {
        const stepStarts = msg.parts.filter((p) => p.type === "step-start").length;
        counts[msg.id] = stepStarts > 0 ? stepStarts : 1;
      }
    }
    const applyCounts = () => {
      setLlmStepCounts(counts);
    }
    applyCounts();
  }, [chat.messages]);

  /**
   * "Mesajı Geri Al" (Undo) — seçilen kullanıcı mesajını ve altındaki tüm sonraki
   * turları geçmişten ve LLM bağlamından (messages) siler, soru metnini döndürür.
   */
  const undoToUserMessage = React.useCallback(
    (messageId: string): string | undefined => {
      const idx = chat.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return undefined;

      const targetMsg = chat.messages[idx];
      const textPart = targetMsg.parts.find((p) => p.type === "text") as
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
      executedCallsRef.current.clear();

      return userText;
    },
    [chat, conversationId, saveMessages],
  );

  const value = React.useMemo(() => ({
    messages: chat.messages,
    status: chat.status,
    stop: stopResponse,
    error: chat.error,
    busy,
    stopped,
    retryResponse,
    undoToUserMessage,
    addToolOutput: chat.addToolOutput,
    isTurnActive: busy,
    responseDurations,
    llmStepCounts,
    streamErrorTexts,
    sendMessageText: (
      text: string,
      attachmentsList?: Array<{ name: string; type: string; dataUrl?: string }>,
    ) => {
      void (async () => {
      clearTurnTrace(conversationId);
      if (busyRef.current) {
        userStoppedRef.current = true;
        upsertTurnTrace(conversationId, {
          id: "busy-interrupt",
          toolName: "worker",
          label: "Önceki tur kesildi",
          detailText: "Yeni mesaj için bekleyen akış durduruldu.",
        });
        try {
          await chat.stop();
        } catch {
          /* ignore */
        }
      }

      const href =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "";
      const pathOnly = href.split("?")[0] || "/";
      const selectedJobId = extractJobIdFromHref(href);
      const expectedTable = selectedJobId
        ? `report_${selectedJobId.replace(/[^a-zA-Z0-9_]/g, "_")}`
        : "";
      const spec = useYulaGridStore.getState().spec;
      const tableReadyOnScreen =
        Boolean(expectedTable) &&
        spec?.tableName === expectedTable &&
        (        spec.columns?.length ?? 0) > 0;

      upsertTurnTrace(conversationId, {
        id: "user-send",
        toolName: "worker",
        label: "İstek alındı",
        subLabel: text.slice(0, 80),
        input: {
          text,
          href,
          selectedJobId,
          expectedTable,
          specTable: spec?.tableName ?? null,
          specCols: spec?.columns?.length ?? 0,
          tableReadyOnScreen,
          resultPath: isReportResultPath(pathOnly),
        },
      });

      if (
        isYulaGridSlashPrompt(text, localizedGridCommands) &&
        !isReportResultPath(pathOnly) &&
        selectedJobId &&
        !tableReadyOnScreen
      ) {
        queueYulaPrompt(text);
        const exec = reportExecutionPath(pathOnly);
        const to = exec ? `${exec}/${selectedJobId}` : null;
        upsertTurnTrace(conversationId, {
          id: "open-results",
          toolName: "worker",
          label: "Sonuç tablosu açılıyor",
          subLabel: selectedJobId.slice(0, 8),
          isLive: true,
          input: { from: href, to },
          output: { reason: "grid slash; tablo henüz oluşmamış" },
        });
        if (to) {
          useChatsStore.getState().beginConversationFollow(conversationId);
          useYulaDockStore.getState().setOpen(true);
          router.push(to);
        }
        return;
      }

      setSendGate(true);
      // Yeni kullanıcı mesajı → durdurma kilidini kaldır, tur sıfırdan başlar
      userStoppedRef.current = false;
      setStopped(false);
      executedCallsRef.current.clear();

      // Koruma: Bekleyen (yanıtlanmamış) tüm araç çağrılarını kapat ki SDK missing tool result hatası atmasın
      for (const m of chat.messages) {
        if (m.role === "assistant") {
          for (const p of m.parts) {
            const info = yulaToolPartInfo(p);
            if (info?.state === "input-available") {
              chat.addToolOutput({
                tool: info.toolName as keyof YulaTools,
                toolCallId: info.toolCallId,
                state: "output-error",
                errorText: "Kullanıcı yeni mesaj gönderdiği için atlandı.",
              });
            }
          }
        }
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
      })();
    },
    runPendingTool,
  }), [chat, runPendingTool, stopResponse, retryResponse, undoToUserMessage, stopped, responseDurations, llmStepCounts, streamErrorTexts, busy, router, conversationId, localizedGridCommands]);

  // Üst sağlayıcıya canlı yardımcıları duyur (imza-eşikli)
  React.useEffect(() => {
    onContextReady(value as LiveHelpers);
  }, [onContextReady, value]);

  return null;
}
