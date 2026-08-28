"use client";

import {
  useChat,
  type UseChatHelpers,
} from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { YulaMessage, YulaTools } from "@/app/api/agent/chat/route";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { executeClientTool, resetGridCustomView } from "@/lib/yula-client-tools";
import {
  isWorkspaceHomePath,
  isConversationOnScreen,
  workspaceIdFromPath,
  workspaceLabelFromPath,
} from "@/lib/workspace-paths";
import {
  useChatsStore,
  type YulaConversation,
} from "@/lib/stores/chats";
import { useYulaGridStore } from "@/lib/stores/grid";
import { slimMessagesForTransport } from "@/lib/context-slim";

/**
 * Yula v2 — referans repo deseninin standart Next karşılığı.
 * Tek kaynak: ai-sdk `useChat` + zustand persist (konuşma geçmişi/model).
 *
 * Konuşma değişimi: dış sağlayıcı yalnız seçim durumunu okur,
 * içte anahtarlanmış (<ChatInstance key>) taze bir chat örneği kurulur;
 * böylece persist edilmiş mesajlar asla çalışan örneğe çift eklenmez.
 */

const YulaChatContext = React.createContext<YulaChatContextValue | null>(
  null,
);

/** Job sonuç görünümü deseni: /<workspace>/<rapor>/<jobId> */
function pathnameMatchJobDetail(pathname: string): boolean {
  const known = [
    "/stock/stock-balance/",
    "/stock/stock-analytics/",
    "/stock/analytics/",
  ];
  return known.some((p) => pathname.startsWith(p) && pathname.length > p.length);
}

/** Statik (`tool-<ad>`) ve dinamik parçaları tek forma indirger */
export interface YulaToolPartInfo {
  toolName: string;
  state: string;
  toolCallId: string;
  input?: unknown;
  output?: unknown;
  /** SDK ToolUIPart "output-error" state'inin kanonik hata metni */
  errorText?: string;
}

export function yulaToolPartInfo(part: unknown): YulaToolPartInfo | null {
  const p = part as { type?: string } | null;
  if (!p?.type) return null;
  if (p.type === "dynamic-tool") {
    const q = p as {
      toolName?: string;
      state?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    return q.toolName && q.state && q.toolCallId
      ? {
          toolName: q.toolName,
          state: q.state,
          toolCallId: q.toolCallId,
          input: q.input,
          output: q.output,
          errorText: q.errorText,
        }
      : null;
  }
  if (p.type.startsWith("tool-")) {
    const q = p as {
      state?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    if ("state" in q && "toolCallId" in q) {
      return {
        toolName: p.type.slice("tool-".length),
        state: String(q.state),
        toolCallId: String(q.toolCallId),
        input: (q as { input?: unknown }).input,
        output: (q as { output?: unknown }).output,
        errorText: (q as { errorText?: string }).errorText,
      };
    }
  }
  return null;
}

/**
 * SDK `sendAutomaticallyWhen` sözleşmesi (cookbook: call-tools, human-in-the-loop,
 * call-tools-multiple-steps) — SDK bu fonksiyonu İKİ anda çağırır:
 *   (a) her akış bittiğinde (ai Chat: `shouldSendAutomatically` finally bloğu),
 *   (b) addToolOutput ile çıktı eklendikten sonra.
 * True dönmesi → SDK geçmişi OLDUĞU GİBİ yeniden gönderir (resubmit).
 *
 * Canonical semantik (ai: lastAssistantMessageIsCompleteWithToolCalls):
 * yalnızca SON adım (son `step-start` sonrası) değerlendirilir. Tüm mesajı
 * taramak HATALIDIR: sunucu çok-adımlı yanıtta son cevabı metinle bitirirken
 * önceki adımlarda tamamlanmış araçlar bulunur; tüm-mesaj taraması cevap
 * verildikten sonra da resubmit tetikler → modelin aynı cevabı tekrar tekrar
 * yazmasına yol açar (sonsuz döngü).
 */
/**
 * Manual agent loop bütçesi (cookbook: manual-agent-loop — "Custom Loop Control"):
 * kullanıcı mesajı başına otomatik devam adımı üst sınırı; sonsuz araç döngüsünü
 * keser. Adım = araç içeren bir asistan mesajı (her resubmit yeni mesaj açar);
 * mesaj geçmişinden türetildiği için reload sonrası da doğru sayılır.
 * 4 — model cevabı genelde 1-2 araçta tamamlar; kuyruk turları görünür gecikme
 * ürettiği için bütçe sıkı tutulur.
 */
const MAX_AUTO_STEPS = 4

function toolStepCountSinceLastUser(messages: YulaMessage[]): number {
  let count = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m.role === "user") break
    if (
      m.role === "assistant" &&
      m.parts.some((p) => yulaToolPartInfo(p) !== null)
    ) {
      count += 1
    }
  }
  return count
}

export function isFailedToolInfo(info: YulaToolPartInfo): boolean {
  if (info.state === "output-error") return true;
  if (info.state === "output-available" && info.output && typeof info.output === "object") {
    const status = (info.output as { status?: string }).status;
    if (status === "error" || status === "validation-error") return true;
  }
  return false;
}

function isFinalToolState(state: string): boolean {
  return state === "output-available" || state === "output-error";
}

/** Anahtar sırasından bağımsız, kararlı JSON imzası (tekrar-çağrı dedupe'ı). */
function stableSignature(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableSignature).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableSignature(obj[k])}`)
    .join(",")}}`;
}

/** Dedupe sinyali — hata metni bu önekle başlar (predicate ile paylaşılır). */
const DEDUPE_SKIP_MARKER = "Bu araç aynı girdiyle bu turda zaten çalıştırıldı";

function shouldContinueAfterToolOutputs(messages: YulaMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;

  // Canonical: yalnızca son adımın araçlarına bak.
  const lastStepStart = last.parts.reduce(
    (idx, part, index) => (part.type === "step-start" ? index : idx),
    -1,
  );
  const lastStep = last.parts.slice(lastStepStart + 1);
  const toolInfos = lastStep
    .map((p) => yulaToolPartInfo(p))
    .filter((info): info is NonNullable<typeof info> => info !== null);
  if (toolInfos.length === 0) return false;
  if (!toolInfos.every((info) => isFinalToolState(info.state))) return false;

  // Ekran güncelleyen/görselleştiren nihai araçlar YALNIZCA BAŞARILI OLDUĞUNDA durur:
  // Araç hata aldıysa (örn: DuckDB Binder Error), modelin hata mesajını ve hint'i okuyup
  // kendini düzeltmesi için (Self-Correction Turn) otomatik olarak 2. tur tetiklenir!
  const hasSuccessfulTerminalScreenTool = toolInfos.some(
    (i) =>
      ["filter_current_grid", "set_grid_query", "run_report", "visualize_grid_data"].includes(i.toolName) &&
      !isFailedToolInfo(i),
  );
  if (hasSuccessfulTerminalScreenTool) return false;

  // Anti-loop: son araçtan SONRA anlamlı metin varsa model çıktıyı
  // yanıtlamış demektir — devam isteği yoktur.
  const lastToolIndex = lastStep.reduce(
    (idx, part, index) => (yulaToolPartInfo(part) !== null ? index : idx),
    -1,
  );
  const answeredAfterTools = lastStep
    .slice(lastToolIndex + 1)
    .some(
      (p) =>
        p.type === "text" &&
        ((p as { text?: string }).text ?? "").trim().length > 0,
    );
  if (answeredAfterTools) return false;

  // Mesajda zaten yanıt metni varsa ve araçlar başarıyla tamamlandıysa,
  // 2. LLM turuna gerek yoktur (model cevabını metin + araçla birlikte verdi).
  const hasAnswerText = lastStep.some(
    (p) =>
      p.type === "text" &&
      ((p as { text?: string }).text ?? "").trim().length > 0,
  );
  if (hasAnswerText) {
    return false;
  }

  // Bütçe tükendi: model sonuçlarla devam edemez; kullanıcı yeni mesajla sürdürür.
  return toolStepCountSinceLastUser(messages) < MAX_AUTO_STEPS;
}

export function useYulaChat() {
  const ctx = React.useContext(YulaChatContext);
  if (!ctx) {
    throw new Error("useYulaChat must be used within <YulaChatProvider>");
  }
  return ctx;
}

interface YulaChatContextValue
  extends Pick<
    UseChatHelpers<YulaMessage>,
    "messages" | "status" | "stop" | "error" | "addToolOutput"
  > {
  busy: boolean;
  sendMessageText: (text: string) => void;
  /** Kullanıcı yanıtı durdurdu mu (retry butonu görünürlüğü için) */
  stopped: boolean;
  /** Durdurulan/hatalı yanıtı yeniden dene (SDK regenerate/sendMessage seçimi) */
  retryResponse: () => Promise<void>;
  /** dynamic-tool parçasını istemcide çalıştırıp akışı devam ettirir */
  runPendingTool: (part: {
    toolCallId: string;
    toolName: string;
    input?: unknown;
    state?: string;
  }) => void;
  conversations: YulaConversation[];
  activeId: string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  newConversation: () => void;
  model: string;
  setModel: (model: string) => void;
  /** Asistan mesaj id -> yanıt süresi (saniye) */
  responseDurations: Record<string, number>;
  /** Asistan mesaj id -> LLM tur/çağrı sayısı */
  llmStepCounts: Record<string, number>;
}

const RESPONSE_TIMEOUT_MS = 45000; // 45 saniye azami yanıt süresi eşiği (yerel Ollama model soğuk yükleme payı)

const customFetchWithTimeout: typeof fetch = async (url, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Yula AI yanıt süresi azami eşiği (45s) aşıldı."));
  }, RESPONSE_TIMEOUT_MS);

  if (init?.signal) {
    init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason));
  }

  const startMs = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.info(
      `🤖 [Yula Response Telemetry] Stream response started in ${Math.round(performance.now() - startMs)} ms.`,
    );
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      console.warn(
        `🤖 [Yula Timeout Telemetry] Request aborted due to 45s timeout threshold.`,
      );
      throw new Error("Yula yanıt süresi eşiği (45s) aşıldı. Lütfen tekrar deneyin.");
    }
    throw err;
  }
};

/** Konuşma başına tek taze chat örneği — key değiştikçe sıfırdan kurulur. */
function ChatInstance({
  conversationId,
  onContextReady,
}: {
  conversationId: string;
  onContextReady: (helpers: Omit<
    YulaChatContextValue,
    | "conversations" | "activeId" | "selectConversation"
    | "deleteConversation" | "newConversation"
    | "model" | "setModel"
  >) => void;
}) {
  const router = useRouter();
  const saveMessages = useChatsStore((s) => s.saveMessages);
  const renameFromFirstMessage = useChatsStore(
    (s) => s.renameFromFirstMessage,
  );

  const initialMessages = React.useMemo(
    () => useChatsStore.getState().messagesById[conversationId] ?? [],
    [conversationId],
  );

  const requestStartMsRef = React.useRef<number | null>(null);
  const [responseDurations, setResponseDurations] = React.useState<Record<string, number>>({});

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        fetch: customFetchWithTimeout,
        prepareSendMessagesRequest: async ({ messages }) => {
          if (requestStartMsRef.current === null) {
            requestStartMsRef.current = performance.now();
          }
          const pathname =
            typeof window !== "undefined" ? window.location.pathname : "/";
          const store = useYulaGridStore.getState();
          let spec = store.spec;

          // EVRE TÜRETİMİ — Yula hangi ekranda olduğunu buradan bilir:
          //   job detay + grid hazır             → "results"
          //   job detay + tablo henüz yükleniyor → "results-loading"
          //   diğer (form/ana ekran)             → "workspace"
          const jobDetail = pathnameMatchJobDetail(pathname);

          // Öz-düzeltme: grid veriyi gösteriyor ama kayıt boş/eksikse
          // DuckDB şemasından anında tamamla (hangi sıra bozulursa bozulsun).
          const jobIdSeg = jobDetail ? pathname.split("/").pop() ?? "" : "";
          const expectedTable = jobIdSeg
            ? `report_${jobIdSeg.replace(/[^a-zA-Z0-9_]/g, "_")}`
            : "";

          if (
            jobDetail &&
            (!spec || spec.columns.length === 0) &&
            expectedTable
          ) {
            try {
              const { duckDbClient } = await import("@/services/duckdb");
              const { deriveColumnKind } = await import(
                "@/features/jobs/lib/column-type-utils"
              );
              const cols = await duckDbClient.describeTable(expectedTable);
              if (cols.length > 0) {
                store.register({
                  tableName: expectedTable,
                  title: "Stok Bakiye Raporu",
                  columns: cols.map((c) => c.name),
                  rowCount: null,
                  reportScope: "stock-balance",
                  columnTypes: Object.fromEntries(
                    cols.map((c) => [
                      c.name,
                      deriveColumnKind(c.duckType, c.isNumeric),
                    ]),
                  ),
                });
                spec = useYulaGridStore.getState().spec;
              }
            } catch (err) {
              console.warn(
                "[Yula transport] self-heal describeTable başarısız:",
                err,
              );
            }
          }

          const phase: "results" | "results-loading" | "workspace" =
            jobDetail
              ? spec && spec.columns.length > 0
                ? "results"
                : "results-loading"
              : "workspace";

          // DuckDB WASM Vector RAG araması (all-minilm + array_cosine_distance)
          let ragContext: Array<{ scope: string; content: string; metadata?: Record<string, unknown>; distance?: number }> = [];
          const lastUserMsg = messages.filter((m) => m.role === "user").pop();
          const lastTextPart = lastUserMsg?.parts.find((p) => p.type === "text") as { text?: string } | undefined;
          if (lastTextPart?.text) {
            try {
              const { searchVectorContext } = await import("@/services/duckdb-vector");
              ragContext = await searchVectorContext(lastTextPart.text, 3);
            } catch (err) {
              console.warn("[Yula RAG] Vector search error:", err);
            }
          }

          const isHome = isWorkspaceHomePath(pathname);
          const workspaceId = workspaceIdFromPath(pathname);
          const workspaceLabel = workspaceLabelFromPath(pathname);
          const mode: "main" | "dock" = isHome ? "main" : "dock";

          return {
            body: {
              messages: slimMessagesForTransport(messages),
              model: useChatsStore.getState().model,
              context: {
                pathname,
                mode,
                workspaceId,
                workspaceLabel,
                phase,
                grid:
                  spec && spec.columns.length > 0
                    ? {
                        ...spec,
                        filters: useYulaGridStore.getState().filters,
                        customQuerySql: useYulaGridStore.getState().customQuerySql,
                        customQueryTitle: useYulaGridStore.getState().customQueryTitle,
                      }
                    : null,
                ragContext,
              },
            },
          };
        },
      }),
    [],
  );

  // Kullanıcı "durdur" bayrağı — bir sonraki kullanıcı mesajına kadar otomatik
  // devam döngüsünü (sendAutomaticallyWhen + araç yürütme) kilitler.
  const userStoppedRef = React.useRef(false);
  // UI-reaktif kopya (durdurulan kısmi metin akışlarında retry butonu için)
  const [stopped, setStopped] = React.useState(false);
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
    onError: (err) => {
      console.warn("🤖 [Yula Chat Error]", err);
      userStoppedRef.current = true;
      setStopped(true);
    },
    // Cookbook/Client-Tools deseni: araç çıktısı eklendiğinde akış kendiliğinden
    // devam etsin (manuel sendMessage yerine SDK köprüsü).
    sendAutomaticallyWhen: ({ messages }) =>
      !userStoppedRef.current && shouldContinueAfterToolOutputs(messages),
  });

  const status = chat.status;

  // Storage Buckets & DuckDB WASM Vector RAG şema indeksleyicisi
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

  // Konuşma kalıcılığı (localStorage / zustand persist)
  React.useEffect(() => {
    if (!conversationId || status !== "ready") return;
    const currentPath = typeof window !== "undefined" ? window.location.pathname : undefined;
    saveMessages(conversationId, chat.messages, currentPath);
    const firstUser = chat.messages.find((m) => m.role === "user");
    const textPart = firstUser?.parts.find(
      (p): p is Extract<(typeof p), { type: "text" }> => p.type === "text",
    );
    const text =
      textPart && textPart.type === "text" ? textPart.text : "";
    if (text) renameFromFirstMessage(conversationId, text);
  }, [status, chat.messages, conversationId, saveMessages, renameFromFirstMessage]);

  const runPendingTool = React.useCallback(
    async (part: {
      toolCallId: string;
      toolName: string;
      input?: unknown;
      state?: string;
    }) => {
      if (part.state && part.state !== "input-available") return;
      // Yürütme tamamen patlarsa bile SDK kanonik hata çıktısı ekle
      // (state:"output-error" + errorText) — aksi halde satır "Çalışıyor…"da
      // asılı kalır ve resubmit hatalı geçmişle sunucuda patlar.
      // Tekrar-çağrı kesici: aynı araç + aynı girdi bu turda zaten koştuysa
      // yeniden ÇALIŞTIRMA; modele düzeltme sinyali ver (SDK sözleşmesi:
      // state:"output-error" + errorText).
      const callSignature = `${part.toolName}:${stableSignature(part.input ?? null)}`;
      if (executedCallsRef.current.has(callSignature)) {
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText:
            DEDUPE_SKIP_MARKER +
            " ve sonuç değişmez. " +
            "Aynı aracı tekrar çağırma; eldeki sonuçlarla nihai yanıtını tek seferde ver.",
        });
        return;
      }

      let output: unknown;
      let errorText: string | undefined;
      try {
        output = await executeClientTool(part.toolName, part.input);
      } catch (err) {
        console.warn("[Yula exec] araç yürütme hatası:", part.toolName, err);
        output = undefined;
        errorText = err instanceof Error ? err.message : String(err);
      }
      executedCallsRef.current.set(callSignature, "");

      if (part.toolName === "run_report") {
        // Statik araç → outputSchema tipiyle birebir (cast yok)
        chat.addToolOutput({
          tool: "run_report",
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as YulaTools["run_report"]["output"],
        });
      } else if (errorText !== undefined) {
        // SDK ToolUIPart sözleşmesi: hata → state:"output-error" + errorText
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText,
        });
      } else {
        // Dinamik grid araçları → runtime şema; isim cast'i SDK deseni
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as never,
        });
      }

      const execOut =
        typeof output === "object" && output !== null
          ? (output as Record<string, unknown>)
          : undefined;

      // Gerçek job açıldıysa sonucu görüntüleme evresine geç
      if (
        execOut?.status === "executed" &&
        typeof execOut.navigateTo === "string"
      ) {
        void router.push(execOut.navigateTo);
      }
      // sendAutomaticallyWhen=true → resubmission SDK tarafında otomatik
    },
    [chat, router],
  );

  // İstemci-tarafı araç döngüsü (cookbook "client tools"):
  // asistan turu bittiğinde bekleyen YÜRÜTÜLEBİLİR araç varsa otomatik koştur.
  // Kriter kartı katmanı kaldırıldı; rapor çalıştırma yalnız run_report ile.
  const handledToolsRef = React.useRef<Set<string>>(new Set());

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
                !handledToolsRef.current.has(info.toolCallId),
            )
        : [],
    );
    if (pending.length === 0) return;
    pending.forEach((info) => handledToolsRef.current.add(info.toolCallId));

    void (async () => {
      for (const info of pending) {
        // Kullanıcı bu sırada durdurduysa kalan araçları koşturma
        if (userStoppedRef.current) break;
        // Manual agent loop telemetrisi (cookbook: "custom logging")
        console.info(
          `[Yula Agent Loop] adım ${toolStepCountSinceLastUser(chat.messages) + 1}/${MAX_AUTO_STEPS} → ${info.toolName}`,
        );
        await runPendingTool({
          toolCallId: info.toolCallId,
          toolName: info.toolName,
          input: info.input,
          state: info.state,
        });
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

  // Kullanıcı mesajı gönderdiği an bekleme süresi başlar (Gerçek kullanıcı bekleme süresi)
  React.useEffect(() => {
    if (status === "submitted" && requestStartMsRef.current === null) {
      requestStartMsRef.current = performance.now();
    }
  }, [status]);

  // Akış tamamen bittiğinde (ready) kullanıcının GERÇEK bekleme süresini kaydet
  React.useEffect(() => {
    if (status === "ready" && requestStartMsRef.current !== null) {
      const durationSec = Number(
        ((performance.now() - requestStartMsRef.current) / 1000).toFixed(1),
      );
      const assistantMsgs = chat.messages.filter((m) => m.role === "assistant");
      const lastAssis = assistantMsgs[assistantMsgs.length - 1];
      if (lastAssis?.id && !responseDurations[lastAssis.id]) {
        const finalDuration = durationSec > 0 ? durationSec : 0.1;
        setResponseDurations((prev) => ({ ...prev, [lastAssis.id]: finalDuration }));
      }
      requestStartMsRef.current = null;
    }
  }, [status, chat.messages, responseDurations]);

  const [llmStepCounts, setLlmStepCounts] = React.useState<Record<string, number>>({});

  // Asistan mesajlarındaki LLM tur sayısını (step-start veya tur parçaları) hesapla
  React.useEffect(() => {
    const assistantMsgs = chat.messages.filter((m) => m.role === "assistant");
    const counts: Record<string, number> = {};
    for (const msg of assistantMsgs) {
      const stepStarts = msg.parts.filter((p) => p.type === "step-start").length;
      if (stepStarts > 0) {
        counts[msg.id] = stepStarts;
      } else {
        const toolCalls = msg.parts.filter((p) => yulaToolPartInfo(p) !== null).length;
        const hasText = msg.parts.some(
          (p) => p.type === "text" && (p.text ?? "").trim().length > 0,
        );
        const total = toolCalls + (hasText && toolCalls > 0 ? 1 : 0);
        counts[msg.id] = total > 0 ? total : 1;
      }
    }
    setLlmStepCounts(counts);
  }, [chat.messages]);

  const value = React.useMemo(() => ({
    messages: chat.messages,
    status: chat.status,
    stop: stopResponse,
    error: chat.error,
    busy: status === "submitted" || status === "streaming",
    stopped,
    retryResponse,
    addToolOutput: chat.addToolOutput,
    responseDurations,
    llmStepCounts,
    sendMessageText: (text: string) => {
      // Yeni kullanıcı mesajı → durdurma kilidini kaldır, tur sıfırdan başlar
      userStoppedRef.current = false;
      setStopped(false);
      executedCallsRef.current.clear();
      void chat.sendMessage({ text });
    },
    runPendingTool,
  }), [chat, status, runPendingTool, stopResponse, retryResponse, stopped, responseDurations, llmStepCounts]);

  // Üst sağlayıcıya canlı yardımcıları duyur (imza-eşikli)
  React.useEffect(() => {
    onContextReady(value);
  }, [onContextReady, value]);

  return null;
}

export function YulaChatProvider({ children }: { children: React.ReactNode }) {
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const model = useChatsStore((s) => s.model);
  const setModel = useChatsStore((s) => s.setModel);

  const pathname = usePathname();

  // Dock açıldığında aktif konuşmanın varlığını garanti et
  React.useEffect(() => {
    useChatsStore.getState().ensureActiveConversation();
  }, []);

  // Ekran bazlı aktif sohbet yönetimi:
  // Sayfa değişiminde (veya sayfa yüklendiğinde) aktif sohbetin O EKRANA ait olup olmadığını denetler.
  // Eğer aktif sohbet o ekrana ait değilse:
  //   1) O ekrana ait kaydedilmiş geçmiş sohbet varsa onu seçer,
  //   2) Yoksa taze yeni sohbet başlatır.
  const activePathRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (activePathRef.current === pathname) return;
    activePathRef.current = pathname;

    const store = useChatsStore.getState();
    const currentActiveId = store.activeId;
    const conversations = store.conversations;
    const activeConv = conversations.find((c) => c.id === currentActiveId);
    const activeMsgs = currentActiveId ? store.messagesById[currentActiveId] ?? [] : [];

    const isValidForScreen = activeConv
      ? isConversationOnScreen(activeConv.pathname, pathname)
      : activeMsgs.length === 0;

    if (!isValidForScreen) {
      const screenConv = conversations.find((c) => isConversationOnScreen(c.pathname, pathname));
      if (screenConv) {
        store.selectConversation(screenConv.id);
      } else {
        store.newConversation();
      }
    }
  }, [pathname]);

  // Soğuk başlangıç ısıtması: dock açılır açılmaz Ollama modeli belleğe
  // yüklenir (models route'u boş-prompt warmup tetikler) → ilk mesaj hızlı.
  React.useEffect(() => {
    void fetch("/api/agent/models").catch(() => {
      // Isıtma best-effort
    });
  }, []);

  const router = useRouter();
  const selectConversation = React.useCallback(
    (id: string) => {
      const store = useChatsStore.getState();
      store.selectConversation(id);
      const target = store.conversations.find((c) => c.id === id);
      if (
        target?.pathname &&
        typeof window !== "undefined" &&
        window.location.pathname !== target.pathname
      ) {
        router.push(target.pathname);
      }
    },
    [router],
  );
  const deleteConversation = React.useCallback(
    (id: string) => useChatsStore.getState().deleteConversation(id),
    [],
  );
  const newConversation = React.useCallback(() => {
    // Devam eden akış/araç döngüsünü KES — aksi halde eski tur arka planda
    // sürmeye devam eder ve "yeni sohbet" tam hissettirmez.
    helpersRef.current?.stop();
    // Özel grid görünümünü (set_grid_query) de sıfırla — tam temiz başlangıç
    void resetGridCustomView();
    useChatsStore.getState().newConversation();
  }, []);

  const helpersRef = React.useRef<Omit<
    YulaChatContextValue,
    | "conversations" | "activeId" | "selectConversation"
    | "deleteConversation" | "newConversation" | "model" | "setModel"
  > | null>(null);
  const [, bump] = React.useReducer((x) => x + 1, 0);
  const lastSigRef = React.useRef("");

  const setLiveHelpersStable = React.useCallback((h: NonNullable<typeof helpersRef.current>) => {
    helpersRef.current = h;
    // Sadece anlamlı değişimde (durum / mesaj sayısı / hata) yeniden yayınla;
    // akış delta'ları children'ın kendi hook'u üzerinden zaten akar.
    const sig = `${h.status}:${h.messages.length}:${Boolean(h.error)}:${h.busy}`;
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      bump();
    }
  }, []);

  const value = React.useMemo<YulaChatContextValue | null>(() => {
    if (!activeId || !helpersRef.current) return null;
    return {
      ...helpersRef.current,
      conversations,
      activeId,
      selectConversation,
      deleteConversation,
      newConversation,
      model,
      setModel,
    };
    // helpersRef.current render sırasında okunur — ref güncel olduğu sürece
    // context değeri taze kalır; imza-eşikli bump yeniden hesaplamayı tetikler.
  }, [helpersRef.current?.status, helpersRef.current?.messages.length, activeId, conversations, model, setModel, selectConversation, deleteConversation, newConversation]);

  return (
    <>
      {activeId ? (
        <ChatInstance
          key={activeId}
          conversationId={activeId}
          onContextReady={setLiveHelpersStable}
        />
      ) : null}
      {value ? (
        <YulaChatContext.Provider value={value}>
          {children}
        </YulaChatContext.Provider>
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-sm opacity-60">
          Sohbet hazırlanıyor…
        </div>
      )}
    </>
  );
}

// Not: context örneği null iken çocuklar render edilmez; dock açılışı
// ensureActiveConversation garanti ettiği için pratikte anlık olur.
