import { useEffect } from "react";
import { create } from "zustand";
import { toolRegistry } from "../lib/tool-registry";
import { isTauriEnv } from "@/lib/api-url";
import { loadSecret, saveSecret } from "@/lib/secure-config";
import { workspaceIdFromPath } from "@/hooks/use-active-workspace";
import { resolveGenericToolIntent } from "@/lib/generic-nlp-resolver";
import {
  logAiTelemetry,
} from "./yula/telemetry";
import {
  detectGridIntent,
  isAskingNewReport,
  resolveGridFastRoute,
} from "./yula/grid-intent";
import {
  parseSidecarLine,
  isStaleEvent,
  applyViewingStateGuard,
  synthesizeGridFilterArgs,
  ensureChartType,
} from "./yula/sidecar-protocol";
import { composeToolResultMessage } from "./yula/tool-result";
import { extractCleanFilterValue } from "@/lib/bc-filter-synthesizer";
import { resolveColumnCandidates } from "@/lib/grid-filter-resolver";

export type {
  ChatMessage,
  ScreenContext,
  ProcessStatus,
  AiProviderConfig,
  ActiveReportMemory,
  SidecarEvent,
} from "./yula/types";

import type {
  ChatMessage,
  ScreenContext,
  ProcessStatus,
  AiProviderConfig,
  ActiveReportMemory,
  SidecarEvent,
} from "./yula/types";

interface AgentBridgeStore {
  status: ProcessStatus;
  messages: ChatMessage[];
  /** LLM üretim sırasında canlı akan düşünme zinciri (yanıt tamamlanınca temizlenir). */
  streamingThinking: string;
  /** LLM üretim sırasında canlı akan metin yanıtı (yanıt tamamlanınca temizlenir). */
  streamingContent: string;
  isProcessing: boolean;
  /** Güvenli depodan API anahtarı yüklendi mi (Ayarlar formu bu bayrağa kadar kilitli kalır). */
  configHydrated: boolean;
  lastPrompt: string;
  screenContext: ScreenContext | null;
  lastActiveReport: ActiveReportMemory | null;
  aiConfig: AiProviderConfig;
  setAiConfig: (config: Partial<AiProviderConfig>) => void;
  setScreenContext: (ctx: ScreenContext) => void;
  clearScreenContext: (screenId?: string) => void;
  appendMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  sendPrompt: (promptText: string) => Promise<void>;
  ensureStarted: () => Promise<void>;
  newConversation: () => void;
}

let sharedChildProcess: any = null;
let isStartingProcess = false;
let processingTimeout: any = null;
let activeRequestId: string | null = null;
let configHydratedOnce = false;
let unsubscribeToolRegistry: (() => void) | null = null;

function createRequestId() {
  return `yula-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CONFIG_STORAGE_KEY = "yula_ai_config";

/**
  * localStorage'dan yapılandırmayı okur. API anahtarı BURADA TUTULMAZ —
  * o, güvenli depoda yaşar (secure-config.ts) ve hidrasyon sırasında eklenir.
  */
function loadStoredAiConfig(): AiProviderConfig {
  const defaults: AiProviderConfig = {
    provider: "ollama",
    model: "gemma4:12b-mlx",
    endpoint: "http://127.0.0.1:11434",
    apiKey: "",
  };
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = { ...defaults, ...JSON.parse(raw) } as AiProviderConfig;
      return { ...parsed, apiKey: "" };
    }
  } catch {
    // fallback
  }
  return defaults;
}

/** Yaplandırmayı API anahtarsız olarak kalıcı depoya yazar. */
function persistAiConfigWithoutSecret(config: AiProviderConfig) {
  try {
    const { apiKey: _apiKey, ...sanitized } = config;
    void _apiKey;
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // storage kapalı olabilir
  }
}

function finishProcessing(clearTimeoutFlag = true) {
  if (clearTimeoutFlag && processingTimeout) clearTimeout(processingTimeout);
  useAgentBridgeStore.setState({ isProcessing: false, streamingThinking: "", streamingContent: "" });
}

export const useAgentBridgeStore = create<AgentBridgeStore>((set, get) => ({
  status: "idle",
  lastPrompt: "",
  screenContext: null,
  lastActiveReport: null,
  streamingThinking: "",
  streamingContent: "",
  aiConfig: loadStoredAiConfig(),
  configHydrated: false,

  setAiConfig: (config) => {
    set((state) => {
      const updated = { ...state.aiConfig, ...config };
      // API anahtarı asla düz metin olarak kalıcı depoya yazılmaz
      persistAiConfigWithoutSecret(updated);
      void saveSecret(updated.apiKey || "");
      if (sharedChildProcess) {
        sharedChildProcess
          .write(JSON.stringify({ action: "configure_ai", config: updated }) + "\n")
          .catch(() => {});
      }
      return { aiConfig: updated };
    });
  },

  setScreenContext: (ctx) => set({ screenContext: ctx }),
  clearScreenContext: (screenId) =>
    set((state) => {
      if (!screenId || state.screenContext?.screenId === screenId) {
        return { screenContext: null };
      }
      return {};
    }),

  messages: [
    {
      id: "init-1",
      sender: "system",
      content: "Yula AI Ajan Köprüsü hazır (Needle 2 SLM & Multi-Provider Pydantic AI Engine).",
      timestamp: new Date().toLocaleTimeString("tr-TR"),
    },
  ],
  isProcessing: false,

  newConversation: () => {
    set({
      messages: [
        {
          id: "init-1",
          sender: "system",
          content: "Yula AI hazır (Needle Rule Engine & Pydantic AI Multi-Provider).",
          timestamp: new Date().toLocaleTimeString("tr-TR"),
        },
      ],
      lastActiveReport: null,
      streamingThinking: "",
      streamingContent: "",
      isProcessing: false,
    });

    if (sharedChildProcess) {
      sharedChildProcess
        .write(JSON.stringify({ action: "reset" }) + "\n")
        .catch((err: any) => console.error("[Sidecar Reset Error]:", err));
    }
  },

  appendMessage: (msg) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString("tr-TR"),
        },
      ],
    }));
  },

  ensureStarted: async () => {
    if (sharedChildProcess || isStartingProcess) return;

    // Güvenli depodan API anahtarını yükle (hem masaüstü hem web modunda, sidecar
    // configure_ai gönderilmeden ÖNCE yapılmalı ki anahtar yapılandırmaya dahil olsun).
    if (!configHydratedOnce) {
      configHydratedOnce = true;
      try {
        const current = get().aiConfig;
        const apiKey = (await loadSecret()) ?? "";
        set({ aiConfig: { ...current, apiKey }, configHydrated: true });
        persistAiConfigWithoutSecret(get().aiConfig);
      } catch (err) {
        console.warn("[SecureConfig] Yaplandırma hidrasyonu başarısız:", err);
        set({ configHydrated: true });
      }
    }

    if (!isTauriEnv) {
      set({ status: "browser_fallback" });
      return;
    }

    isStartingProcess = true;
    set({ status: "starting" });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const command = Command.sidecar("binaries/main");

      command.on("close", (data: any) => {
        // İşlem sırasında bekleyen bir istek varsa kullanıcıyı kayıp hakkında bilgilendir
        const hadPendingRequest = Boolean(activeRequestId) && useAgentBridgeStore.getState().isProcessing;
        sharedChildProcess = null;
        unsubscribeToolRegistry?.();
        unsubscribeToolRegistry = null;
        isStartingProcess = false;
        useAgentBridgeStore.setState({ status: "idle", isProcessing: false, streamingThinking: "", streamingContent: "" });
        console.log(`[Sidecar] Süreç kapandı (Kod: ${data.code})`);
        if (hadPendingRequest) {
          get().appendMessage({
            sender: "system",
            content:
              "⚠️ Yula yardımcısı yanıt beklenirken kapandı; son isteğiniz tamamlanamadı. Lütfen isteğinizi tekrar gönderin.",
          });
        }
      });

      command.on("error", (error: any) => {
        sharedChildProcess = null;
        unsubscribeToolRegistry?.();
        unsubscribeToolRegistry = null;
        isStartingProcess = false;
        set({ status: "error", isProcessing: false });
        get().appendMessage({
          sender: "system",
          content: `❌ Sidecar hatası: ${error}`,
        });
      });

      command.stderr.on("data", (err: string) => {
        const trimmed = err.trim();
        if (!trimmed) return;
        if (trimmed.includes("Exception") || trimmed.includes("Traceback") || trimmed.toLowerCase().includes("error:")) {
          console.error("[Sidecar Error]:", trimmed);
        } else {
          console.log("%c[Sidecar Diagnostic]:", "color: #0ea5e9; font-weight: 500;", trimmed);
        }
      });

      command.stdout.on("data", (data: string) => {
        for (const line of data.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          console.log("[Sidecar Stdout]:", trimmed);

          const evt = parseSidecarLine(trimmed);
          if (!evt) continue; // raw text log satırı
          if (isStaleEvent(evt, activeRequestId)) {
            console.warn("[Yula] Eski sidecar yanıtı yok sayıldı:", evt.requestId);
            continue;
          }
          handleSidecarEvent(evt);
        }
      });

      const child = await command.spawn();
      sharedChildProcess = child;
      isStartingProcess = false;
      set({ status: "running" });

      await child.write(JSON.stringify({ action: "configure_ai", config: get().aiConfig }) + "\n");

      const syncScopedTools = () => {
        if (sharedChildProcess) {
          const screen = get().screenContext;
          const syncPayload = JSON.stringify({
            action: "register_tools",
            tools: toolRegistry.getScopedDefinitions(screen?.workspaceId, screen?.screenId),
          });
          sharedChildProcess.write(syncPayload + "\n").catch(() => {});
        }
      };
      syncScopedTools();
      unsubscribeToolRegistry?.();
      unsubscribeToolRegistry = toolRegistry.subscribe(syncScopedTools);
    } catch (err: any) {
      sharedChildProcess = null;
      isStartingProcess = false;
      set({ status: "error", isProcessing: false });
      get().appendMessage({
        sender: "system",
        content: `Sidecar failed to start: ${err?.message || err}`,
      });
    }
  },

  sendPrompt: async (promptText: string) => {
    if (!promptText.trim()) return;

    get().appendMessage({ sender: "user", content: promptText });
    set({ isProcessing: true, lastPrompt: promptText });

    // Sessiz güvenlik ağı: normal akış agent_settled ile daha önce kapanır.
    // Yalnızca sidecar hiçbir şey döndürmezse (process ölümü vb.) spinner'ı serbest bırakır.
    if (processingTimeout) clearTimeout(processingTimeout);
    processingTimeout = setTimeout(() => {
      set({ isProcessing: false, streamingThinking: "", streamingContent: "" });
    }, 120000);

    const effectiveScreen = buildEffectiveScreen();

    // ⚡ Hızlı Router: sonuç tablosu açıkken / net filtre sinyalinde deterministik aksiyon
    const route = resolveGridFastRoute(promptText, effectiveScreen, Boolean(toolRegistry.get("filter_active_grid")));
    if (route.matched) {
      setTimeout(async () => {
        const execution = await toolRegistry.executeTool(route.toolName, route.args);

        logAiTelemetry({
          source: "Deterministic Fast Router (Web Engine)",
          model: "TypeScript Rule & Schema Synthesizer (0 Tokens)",
          userPrompt: promptText,
          context: effectiveScreen,
          toolCall: { tool: route.toolName, arguments: route.args },
          executionResult: execution.result,
          responseContent:
            execution.result?.message || `✓ "${route.toolName}" başarıyla uygulandı.`,
          telemetry: { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 15 },
        });

        if (execution.success && execution.result?.success !== false) {
          get().appendMessage({
            sender: "agent",
            content: execution.result?.message || `✓ "${route.toolName}" başarıyla uygulandı.`,
            customKind: execution.result?.customKind,
            toolResult: execution.result,
            toolDetails: route.args,
          });
        } else {
          get().appendMessage({
            sender: "system",
            content: `❌ ${execution.result?.message || execution.error || "Filtre uygulanamadı."}`,
          });
        }

        finishProcessing();
      }, 50);
      return;
    }

    const scopedTools = toolRegistry.getScopedDefinitions(
      effectiveScreen.workspaceId,
      effectiveScreen.screenId
    );

    // 🌐 Web Tarayıcı Modunda Fast Intent Router — masaüstünde istekler sidecar'a gider.
    if (!isTauriEnv) {
      const fastResolved = resolveGenericToolIntent(promptText, scopedTools, effectiveScreen);
      const hasActionableArgs = Object.keys(fastResolved.arguments || {}).length > 0;
      if (fastResolved.tool && fastResolved.confidence >= 80 && (hasActionableArgs || isAskingNewReport(promptText.toLowerCase()))) {
        setTimeout(async () => {
          const execution = await toolRegistry.executeTool(fastResolved.tool, fastResolved.arguments);

          if (execution.success && (execution.result?.scope || execution.result?.customKind)) {
            set({ lastActiveReport: toReportMemory(fastResolved.tool, execution.result) });
          }

          logAiTelemetry({
            source: "Fast Intent Router (Web Engine)",
            model: "TypeScript Rule & Schema Synthesizer (0 Tokens)",
            userPrompt: promptText,
            context: effectiveScreen,
            tools: scopedTools,
            toolCall: { tool: fastResolved.tool, arguments: fastResolved.arguments },
            executionResult: execution.result,
            responseContent: fastResolved.message || execution.result?.message,
            telemetry: { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 12 },
          });

          if (execution.success) {
            get().appendMessage({
              sender: "agent",
              content:
                fastResolved.message || execution.result?.message || `✓ "${fastResolved.tool}" uygulandı.`,
              customKind: execution.result?.customKind,
              toolResult: execution.result,
              toolDetails: fastResolved.arguments,
            });
          } else {
            get().appendMessage({
              sender: "system",
              content: `❌ Araç çalıştırma hatası (${fastResolved.tool}): ${execution.error}`,
            });
          }

          finishProcessing();
        }, 20);
        return;
      }
    }

    dispatchToSidecar(promptText, effectiveScreen, scopedTools);
  },
}));

/** Sidecar olaylarını store'a işleyen yardımcı (stdout handler'ın gövdesi). */
function handleSidecarEvent(evt: SidecarEvent) {
  const setState = useAgentBridgeStore.setState;
  const getState = useAgentBridgeStore.getState;

  // 1. Tool Call Tetiklendi
  if (evt.type === "tool_call" && evt.tool) {
    let toolName = evt.tool;
    let toolArgs = { ...(evt.arguments || {}) };

    const currentScreen = getState().screenContext;
    const isViewingResults = Boolean(currentScreen?.activeDataSummary?.isViewingResults);
    const lastPrompt = getState().lastPrompt || "";
    const lastPromptLower = lastPrompt.toLowerCase();

    // State-Driven Guard + parametre kesinleştirme
    toolName = applyViewingStateGuard(toolName, lastPromptLower, isViewingResults, isAskingNewReport(lastPromptLower));
    if (toolName === "filter_active_grid") {
      // Needle'ın yanlış çıkarımına karşı deterministik guard:
      // "kaç kayıt var" gibi sayım soruları filtre değeri OLAMAZ → KPI özetine delege edilir.
      if (detectGridIntent(lastPromptLower) === "count") {
        toolName = "analyze_grid_data";
        toolArgs = ensureChartType({}, lastPromptLower);
      } else {
        toolArgs = synthesizeGridFilterArgs(toolArgs, lastPrompt);
      }
    }
    if (toolName === "analyze_grid_data") {
      toolArgs = ensureChartType(toolArgs, lastPromptLower);
    }

    void (async () => {
      // Needle kayıtlı olmayan bir araç adı ürettiyse (örn. kriter formu ekranında
      // grid aracı halüsinasyonu) hata baloncuğu yerine yerel şema çözümleyicisine düş.
      if (!toolRegistry.get(toolName)) {
        console.warn(`[Sidecar] Kayıtsız araç önerildi: "${toolName}" → şema çözümleyicisine düşülüyor.`);
        await browserSchemaFallback(lastPrompt, currentScreen ?? buildEffectiveScreen());
        finishProcessing();
        return;
      }

      const execution = await toolRegistry.executeTool(toolName, toolArgs);

      if (execution.success) {
        const composition = composeToolResultMessage({
          evt,
          toolName,
          executionResult: execution.result,
          lastPrompt,
          currentWorkspace: currentScreen?.workspaceId,
        });

        const customKind = execution.result?.customKind;
        const toolDef = toolRegistry.get(toolName);

        if (
          execution.result?.scope ||
          customKind ||
          toolDef?.scope?.type === "workspace"
        ) {
          setState({ lastActiveReport: toReportMemory(toolName, execution.result, composition.targetWorkspace) });
        }

        logAiTelemetry({
          source: evt.telemetry?.engine || "Needle Engine (On-Device SLM)",
          model: evt.telemetry?.model || "Needle 2 (SLM)",
          userPrompt: lastPrompt,
          systemPrompt: evt.telemetry?.systemPrompt,
          context: currentScreen,
          tools: toolRegistry.getAllDefinitions(),
          toolCall: { tool: toolName, arguments: toolArgs },
          executionResult: execution.result,
          responseContent: composition.messageText,
          reasoningText: composition.llmReasoning,
          telemetry: evt.telemetry,
        });

        getState().appendMessage({
          sender: "agent",
          content: composition.messageText,
          thinking: composition.llmReasoning,
          toolResult: execution.result,
          toolDetails: toolArgs,
          customKind,
        });

        if (sharedChildProcess) {
          await sharedChildProcess.write(
            JSON.stringify({
              action: "tool_result",
              requestId: evt.requestId,
              tool: toolName,
              result: execution.result,
            }) + "\n"
          );
        }
      } else {
        getState().appendMessage({
          sender: "system",
          content: `❌ "${toolName}" execution error: ${execution.error}`,
        });
      }

      finishProcessing();
    })();
    return;
  }

  // 2. Normal Mesaj (Yalnızca önceki mesajla birebir aynı değilse ekle)
  if (evt.type === "message") {
    logAiTelemetry({
      source: evt.telemetry?.engine || "Needle Engine (On-Device SLM)",
      model: evt.telemetry?.model || "Needle 2 (SLM)",
      userPrompt: getState().lastPrompt || "",
      systemPrompt: evt.telemetry?.systemPrompt,
      context: getState().screenContext,
      responseContent: evt.content,
      reasoningText: evt.thinking,
      telemetry: evt.telemetry,
    });

    const lastMsg = getState().messages[getState().messages.length - 1];
    if (!lastMsg || lastMsg.content !== evt.content) {
      getState().appendMessage({
        sender: "agent",
        content: evt.content ?? "",
        thinking: typeof evt.thinking === "string" && evt.thinking.trim() ? evt.thinking : undefined,
      });
    }
    finishProcessing();
    return;
  }

  // 2b. Canlı LLM Deltası (üretim sırasında akan düşünme zinciri)
  if (evt.type === "llm_delta") {
    if (evt.delta_kind === "thinking" && typeof evt.text === "string") {
      useAgentBridgeStore.setState((state) => ({
        streamingThinking: state.streamingThinking + evt.text,
      }));
    } else if (evt.delta_kind === "content" && typeof evt.text === "string") {
      useAgentBridgeStore.setState((state) => ({
        streamingContent: state.streamingContent + evt.text,
      }));
    }
    return;
  }

  // 3. Durum Bildirimi
  if (evt.type === "status") {
    console.log(`[Sidecar Status]: ${evt.status} - ${evt.message || ""}`);
    if (evt.status === "agent_settled") {
      finishProcessing();
    }
    return;
  }

  // 4. Hata Bildirimi
  if (evt.type === "error") {
    getState().appendMessage({
      sender: "system",
      content: `❌ Agent Error: ${evt.message}`,
    });
    finishProcessing();
  }
}

/** Aktif ekran bağlamını path/son rapor belleğiyle birleştirir. */
function buildEffectiveScreen(): ScreenContext {
  const currentScreen = useAgentBridgeStore.getState().screenContext;
  const lastActiveReport = useAgentBridgeStore.getState().lastActiveReport;
  const hasSpecificScreen = Boolean(
    currentScreen?.screenId &&
      currentScreen.screenId !== "home" &&
      currentScreen.screenId !== "item-form"
  );

  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
  const activePathWs = workspaceIdFromPath(currentPath);

  return {
    screenId: hasSpecificScreen
      ? currentScreen!.screenId
      : lastActiveReport?.scope || currentScreen?.screenId || "home",
    screenTitle: hasSpecificScreen
      ? currentScreen!.screenTitle
      : lastActiveReport?.title || currentScreen?.screenTitle || "",
    workspaceId: currentScreen?.workspaceId || activePathWs || lastActiveReport?.workspace || "stock",
    activeReportScope: hasSpecificScreen ? currentScreen!.screenId : lastActiveReport?.scope,
    activeDataSummary: currentScreen?.activeDataSummary,
    activeFilters: currentScreen?.activeFilters,
    quickPrompts: currentScreen?.quickPrompts,
  };
}

/** Yürütme sonucundan son-rapor belleği üretir. */
function toReportMemory(toolName: string, result: any, targetWorkspace?: string): ActiveReportMemory {
  return {
    scope: result?.scope || result?.customKind?.replace(/-report$/, "") || "",
    toolName,
    title: result?.title,
    kind: result?.customKind,
    workspace: targetWorkspace ?? result?.workspace,
    pagePath: result?.pagePath,
  };
}

/**
 * Sidecar'a task payload'ı gönderir; gönderim başarısızsa tarayıcı-tarzı şema
 * çözümleyicisine düşerek kullanıcıyı boş bırakmaz.
 */
function dispatchToSidecar(
  promptText: string,
  effectiveScreen: ScreenContext,
  scopedTools: ReturnType<typeof toolRegistry.getScopedDefinitions>
) {
  // Step-1 (deterministik): şema + örnek kanıtından top-3 kolon adayı.
  // Needle/Gemma yalnızca bu dar listeden seçim yapar (Step-2).
  const summary = (effectiveScreen?.activeDataSummary || {}) as Record<string, any>
  const colNames = Array.isArray(summary.columns) ? (summary.columns as string[]) : []
  let columnCandidates: string[] = []
  if (colNames.length > 0) {
    const clean = extractCleanFilterValue(promptText)
    columnCandidates = resolveColumnCandidates(
      clean.columnHint,
      colNames.map((n) => ({ name: n })),
      clean.value,
      summary.sampleRows
    )
  }
  const enrichedScreen: ScreenContext = {
    ...effectiveScreen,
    activeDataSummary: { ...summary, columnCandidates },
  }

  const requestId = createRequestId();
  const payload = JSON.stringify({
    action: "task",
    requestId,
    prompt: promptText,
    context: {
      active_workspace: effectiveScreen?.workspaceId || "selling",
      current_screen: enrichedScreen,
    },
    tools: scopedTools,
  });

  void (async () => {
    try {
      if (!sharedChildProcess) {
        await useAgentBridgeStore.getState().ensureStarted();
      }
      if (!sharedChildProcess) {
        throw new Error("Sidecar child process is not ready.");
      }
      activeRequestId = requestId;
      await sharedChildProcess.write(payload + "\n");
    } catch (err: any) {
      console.warn("[useAgentBridge] Sidecar dispatch error, falling back to schema resolver:", err);
      await browserSchemaFallback(promptText, effectiveScreen);
    }
  })();
}

/** Web modu ve sidecar-hatası paylaşılan şema çözümleyici düşüşü. */
async function browserSchemaFallback(promptText: string, effectiveScreen: ScreenContext) {
  const scopedTools = toolRegistry.getScopedTools(
    effectiveScreen?.workspaceId,
    effectiveScreen?.screenId
  );
  const resolved = resolveGenericToolIntent(promptText, scopedTools, effectiveScreen);

  if (resolved.tool) {
    const exec = await toolRegistry.executeTool(resolved.tool, resolved.arguments);

    if (exec.success && (exec.result?.scope || exec.result?.customKind)) {
      useAgentBridgeStore.setState({
        lastActiveReport: toReportMemory(resolved.tool, exec.result),
      });
    }

    logAiTelemetry({
      source: "Generic Schema Resolver (Web Engine)",
      model: "TypeScript Rule & Schema Synthesizer (0 Tokens)",
      userPrompt: promptText,
      context: effectiveScreen,
      tools: scopedTools,
      toolCall: { tool: resolved.tool, arguments: resolved.arguments },
      executionResult: exec.result,
      responseContent: exec.result?.message || resolved.message,
      telemetry: { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 40 },
    });

    useAgentBridgeStore.getState().appendMessage({
      sender: "agent",
      content: exec.result?.message || resolved.message,
      customKind: exec.result?.customKind,
      toolResult: exec.result,
      toolDetails: resolved.arguments,
    });
  } else {
    const isViewingGrid = Boolean(effectiveScreen?.activeDataSummary?.isViewingResults);
    const cols = effectiveScreen?.activeDataSummary?.columns || [];

    let content: string;
    if (isViewingGrid && cols.length > 0) {
      const colListStr = cols.slice(0, 6).join(", ");
      content = `Açık olan **${effectiveScreen.screenTitle || "tablo"}** üzerinde **"${promptText}"** ifadesiyle doğrudan eşleşen bir durum veya filtre alanı bulunamadı.\n\nBu ekranda filtreleyebileceğiniz alanlar: \`${colListStr}\`.\nÖrneğin; **"Depo: MAIN"**, **">0 bakiye"** veya belirli bir ürün kodu girerek süzme yapabilirsiniz.`;
    } else {
      content = `İsteğinizi tam olarak anlayamadım. Size ${
        effectiveScreen?.screenTitle ? `**${effectiveScreen.screenTitle}** ekranı` : "bu çalışma alanı"
      } ile ilgili nasıl yardımcı olabilirim? Belirli bir rapor, filtreleme veya analiz talep edebilirsiniz.`;
    }

    useAgentBridgeStore.getState().appendMessage({ sender: "agent", content });
  }

  finishProcessing();
}

export function useAgentBridge() {
  const status = useAgentBridgeStore((s) => s.status);
  const messages = useAgentBridgeStore((s) => s.messages);
  const isProcessing = useAgentBridgeStore((s) => s.isProcessing);
  const streamingThinking = useAgentBridgeStore((s) => s.streamingThinking);
  const streamingContent = useAgentBridgeStore((s) => s.streamingContent);
  const sendPrompt = useAgentBridgeStore((s) => s.sendPrompt);
  const ensureStarted = useAgentBridgeStore((s) => s.ensureStarted);

  useEffect(() => {
    void ensureStarted();
  }, [ensureStarted]);

  return {
    status,
    messages,
    isProcessing,
    streamingThinking,
    streamingContent,
    sendPrompt,
  };
}
