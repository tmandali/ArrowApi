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
  hasGridFilterEvidence,
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
import { FAST_ROUTE_CONFIDENCE_THRESHOLD, recordFastGateOutcome } from "@/lib/ai-confidence-gate";
import { autoReportCardConfigs, getColumnAliasesForScope } from "@/lib/auto-report-registry";
import { buildCriteriaDigest } from "@/features/report-criteria/lib/build-criteria-digest";
import { resolveColumnCandidates } from "@/lib/grid-filter-resolver";

export type {
  ChatMessage,
  YulaConversationSession,
  ScreenContext,
  ProcessStatus,
  AiProviderConfig,
  ActiveReportMemory,
  SidecarEvent,
  SkillInfo,
} from "./yula/types";

import type {
  ChatMessage,
  YulaConversationSession,
  ScreenContext,
  ProcessStatus,
  AiProviderConfig,
  ActiveReportMemory,
  SidecarEvent,
  SkillInfo,
} from "./yula/types";
import {
  loadStoredConversations,
  saveStoredConversations,
  loadActiveConversationId,
  saveActiveConversationId,
  loadHistoryOpen,
  saveHistoryOpen,
  createNewSession,
  generateConversationTitle,
} from "./yula/history-storage";

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
  /** Rapor scope'u → son AI doldurmasında yazılan kriter alan adları (sayfa formu vurgusu) */
  aiFilledCriteria: Record<string, { names: string[]; at: number }>;
  lastActiveReport: ActiveReportMemory | null;
  aiConfig: AiProviderConfig;
  /** Sidecar skill klasörleri (skills_list event'i ile doldurulur). */
  skills: SkillInfo[];
  /** Önkoşulu eksik kalan skill çağrısı (örn. tablo kapalıydı); kısa onayda LLM'siz yeniden denenir. */
  pendingSkillRetry: { tool: string; args: Record<string, any> } | null;
  /** Kalıcı sistem bilgileri (~/.yula/system_facts.json; system_facts_result ile dolar). */
  systemFacts: Record<string, string>;
  /** Kullanıcı onaylı kalıcı bilgi işlemleri (sidecar system_facts protokolü). */
  loadSystemFacts: () => boolean;
  saveSystemFact: (key: string, value: string) => boolean;
  deleteSystemFact: (key: string) => boolean;
  /** Sidecar stdin'e ham satır yazar; bağlı değilse false döner. */
  writeToSidecar: (line: string) => boolean;
  setAiConfig: (config: Partial<AiProviderConfig>) => void;
  setScreenContext: (ctx: ScreenContext) => void;
  setAiFilledCriteria: (scope: string, names: string[]) => void;
  clearScreenContext: (screenId?: string) => void;
  appendMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  sendPrompt: (promptText: string) => Promise<void>;
  ensureStarted: () => Promise<void>;
  /** Geçmiş sohbet oturumları listesi */
  conversations: YulaConversationSession[];
  activeConversationId: string | null;
  isHistoryOpen: boolean;
  toggleHistory: () => void;
  setHistoryOpen: (open: boolean) => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, newTitle: string) => void;
  clearAllConversations: () => void;
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

/** Sidecar'a tek satır JSON yazar; bağlı değilse false döner (protokol yardımcısı). */
function writeToSidecarLine(payload: Record<string, unknown>): boolean {
  if (!sharedChildProcess) return false;
  sharedChildProcess
    .write(JSON.stringify(payload) + "\n")
    .catch((err: any) => console.error("[Sidecar Write Error]:", err));
  return true;
}

const CONFIG_STORAGE_KEY = "yula_ai_config";

/**
  * localStorage'dan yapılandırmayı okur. API anahtarı BURADA TUTULMAZ —
  * o, güvenli depoda yaşar (secure-config.ts) ve hidrasyon sırasında eklenir.
  */
/**
 * Son bilinen kriter sindirimi: kriter formu unmount olup screenContext
 * temizlendiğinde (örn. kullanıcı Yula ana ekranına döndüğünde) dahi son
 * raporun alan tanımlarını bağlamda tutar.
 */
let lastKnownCriteriaDigest: Array<Record<string, unknown>> | null =
  loadPersistedCriteriaDigest();
const CRITERIA_SCOPE_STORAGE_KEY = "sims:last-report-scope";
let lastKnownReportScope: string | null =
  localStorage.getItem(CRITERIA_SCOPE_STORAGE_KEY) || null;

const CRITERIA_DIGEST_STORAGE_KEY = "sims:last-criteria-digest";

function loadPersistedCriteriaDigest(): Array<Record<string, unknown>> | null {
  try {
    const raw = localStorage.getItem(CRITERIA_DIGEST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function persistCriteriaDigest(
  digest: Array<Record<string, unknown>>
): void {
  lastKnownCriteriaDigest = digest;
  try {
    localStorage.setItem(CRITERIA_DIGEST_STORAGE_KEY, JSON.stringify(digest));
    console.debug(
      `[CriteriaDigest] saklandı (${digest.length} alan) → ${CRITERIA_DIGEST_STORAGE_KEY}`
    );
  } catch {
    // Kota dolu vb. — bellek içi önbellek yeterli
  }
}

/**
 * Kriter aracı çalıştığında (örn. ana ekrandan "stok raporu hazırla") raporun
 * şemasını kayıt defterinden bulup sindirimi önbelleğe alır; böylece form
 * mount olmasa bile sonraki "bu rapor ne hakkında" soruları şemadan yanıtlanır.
 */
/**
 * AI kriter aracı çalıştıysa hangi alanları yazdığını rapor scope'uyla işaretle —
 * sayfadaki kriter formu bu isimleri turuncu yazıyla vurgular.
 */
function recordAiFilledCriteria(
  toolName: string,
  args?: Record<string, any>,
  result?: Record<string, any>
): void {
  if (!args || typeof args !== "object") return;
  if (toolName === "filter_active_grid") return;

  // Jenerik sözleşme: { report, criteria: {alan:değer} }
  const scope = normalizeReportScope(
    args.report ?? result?.scope ?? toolName
  ).replace(/_/g, "-");
  const criteriaObj =
    typeof args.criteria === "object" && args.criteria !== null
      ? args.criteria
      : args;
  const keys = Object.keys(criteriaObj).filter(
    (k) =>
      criteriaObj[k] !== undefined &&
      criteriaObj[k] !== null &&
      String(criteriaObj[k]).trim() !== ""
  );
  if (!scope || keys.length === 0) return;
  useAgentBridgeStore.getState().setAiFilledCriteria(scope, keys);
}

function normalizeReportScope(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^filter_/, "");
}

function captureCriteriaDigestFromResult(result?: Record<string, any>): void {
  const scope = String(result?.scope || "").trim();
  if (!scope) return;
  lastKnownReportScope = scope;
  try { localStorage.setItem(CRITERIA_SCOPE_STORAGE_KEY, scope); } catch {}
  const cfg = autoReportCardConfigs.find((c) => c.scope === scope);
  if (!cfg?.schema) return;
  try {
    const digest = buildCriteriaDigest(cfg.schema);
    if (digest.fields.length > 0) {
      persistCriteriaDigest(
        digest.fields as unknown as Array<Record<string, unknown>>
      );
    }
  } catch {
    // Şema çözümlemesi başarısızsa mevcut önbellek korunur
  }
}

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

function initInitialConversations() {
  const stored = loadStoredConversations();
  const activeId = loadActiveConversationId();
  const historyOpen = loadHistoryOpen();

  if (stored.length > 0) {
    const activeSession = stored.find((s) => s.id === activeId) || stored[0];
    return {
      conversations: stored,
      activeConversationId: activeSession.id,
      messages:
        activeSession.messages && activeSession.messages.length > 0
          ? activeSession.messages
          : [
              {
                id: "init-1",
                sender: "system" as const,
                content:
                  "Yula AI Ajan Köprüsü hazır (Intent Rule Engine & Multi-Provider Pydantic AI Engine).",
                timestamp: new Date().toLocaleTimeString("tr-TR"),
              },
            ],
      isHistoryOpen: historyOpen,
    };
  }

  const initialSession = createNewSession();
  saveStoredConversations([initialSession]);
  saveActiveConversationId(initialSession.id);
  return {
    conversations: [initialSession],
    activeConversationId: initialSession.id,
    messages: initialSession.messages,
    isHistoryOpen: historyOpen,
  };
}

const initialConversationsState = initInitialConversations();

function syncActiveConversationMessages(
  set: (fn: (state: AgentBridgeStore) => Partial<AgentBridgeStore>) => void,
  get: () => AgentBridgeStore
) {
  const { activeConversationId, conversations, messages, screenContext } = get();
  if (!activeConversationId) return;

  const userMessages = messages.filter((m) => m.sender === "user");
  if (userMessages.length === 0) return;

  const sessionIndex = conversations.findIndex((s) => s.id === activeConversationId);
  const currentSession = sessionIndex !== -1 ? conversations[sessionIndex] : createNewSession(screenContext?.workspaceId);

  let updatedTitle = currentSession.title;
  if ((!updatedTitle || updatedTitle === "Yeni Sohbet") && userMessages.length > 0) {
    updatedTitle = generateConversationTitle(userMessages[0].content);
  }

  const updatedSession: YulaConversationSession = {
    ...currentSession,
    id: activeConversationId,
    title: updatedTitle,
    messages: [...messages],
    updatedAt: Date.now(),
    workspaceId: screenContext?.workspaceId || currentSession.workspaceId,
  };

  const updatedList = [...conversations];
  if (sessionIndex !== -1) {
    updatedList[sessionIndex] = updatedSession;
  } else {
    updatedList.unshift(updatedSession);
  }

  saveStoredConversations(updatedList);
  set(() => ({ conversations: updatedList }));
}

function finishProcessing(clearTimeoutFlag = true) {
  if (clearTimeoutFlag && processingTimeout) clearTimeout(processingTimeout);
  useAgentBridgeStore.setState({ isProcessing: false, streamingThinking: "", streamingContent: "" });
  syncActiveConversationMessages(
    useAgentBridgeStore.setState,
    useAgentBridgeStore.getState
  );
}

export const useAgentBridgeStore = create<AgentBridgeStore>((set, get) => ({
  status: "idle",
  lastPrompt: "",
  screenContext: null,
  aiFilledCriteria: {},
  lastActiveReport: null,
  streamingThinking: "",
  streamingContent: "",
  aiConfig: loadStoredAiConfig(),
  configHydrated: false,
  conversations: initialConversationsState.conversations,
  activeConversationId: initialConversationsState.activeConversationId,
  isHistoryOpen: initialConversationsState.isHistoryOpen,

  toggleHistory: () => {
    const next = !get().isHistoryOpen;
    saveHistoryOpen(next);
    set({ isHistoryOpen: next });
  },

  setHistoryOpen: (open: boolean) => {
    saveHistoryOpen(open);
    set({ isHistoryOpen: open });
  },

  loadConversation: (id: string) => {
    const state = get();
    if (state.activeConversationId === id) return;
    syncActiveConversationMessages(set, get);

    const target = state.conversations.find((s) => s.id === id);
    if (!target) return;

    saveActiveConversationId(id);
    set({
      activeConversationId: id,
      messages:
        target.messages && target.messages.length > 0
          ? target.messages
          : [
              {
                id: "init-1",
                sender: "system",
                content:
                  "Yula AI hazır (Intent Rule Engine & Pydantic AI Multi-Provider).",
                timestamp: new Date().toLocaleTimeString("tr-TR"),
              },
            ],
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

  deleteConversation: (id: string) => {
    const state = get();
    const filtered = state.conversations.filter((s) => s.id !== id);
    saveStoredConversations(filtered);

    if (state.activeConversationId === id) {
      if (filtered.length > 0) {
        const nextSession = filtered[0];
        saveActiveConversationId(nextSession.id);
        set({
          conversations: filtered,
          activeConversationId: nextSession.id,
          messages: nextSession.messages,
        });
      } else {
        const newSess = createNewSession(state.screenContext?.workspaceId);
        saveStoredConversations([newSess]);
        saveActiveConversationId(newSess.id);
        set({
          conversations: [newSess],
          activeConversationId: newSess.id,
          messages: newSess.messages,
        });
      }
      if (sharedChildProcess) {
        sharedChildProcess
          .write(JSON.stringify({ action: "reset" }) + "\n")
          .catch((err: any) => console.error("[Sidecar Reset Error]:", err));
      }
    } else {
      set({ conversations: filtered });
    }
  },

  renameConversation: (id: string, newTitle: string) => {
    const state = get();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const updated = state.conversations.map((s) =>
      s.id === id ? { ...s, title: trimmed, updatedAt: Date.now() } : s
    );
    saveStoredConversations(updated);
    set({ conversations: updated });
  },

  clearAllConversations: () => {
    const state = get();
    const newSess = createNewSession(state.screenContext?.workspaceId);
    saveStoredConversations([newSess]);
    saveActiveConversationId(newSess.id);
    set({
      conversations: [newSess],
      activeConversationId: newSess.id,
      messages: newSess.messages,
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

  setAiConfig: (config) => {
    set((state) => {
      const updated = { ...state.aiConfig, ...config };
      // API anahtarı asla düz metin olarak kalıcı depoya yazılmaz
      persistAiConfigWithoutSecret(updated);
      void saveSecret(updated.apiKey || "");
      if (sharedChildProcess) {
        sharedChildProcess
          .write(
            JSON.stringify({
              action: "configure_ai",
              confidenceGate: FAST_ROUTE_CONFIDENCE_THRESHOLD,
              config: updated,
            }) + "\n"
          )
          .catch(() => {});
      }
      return { aiConfig: updated };
    });
  },

  setScreenContext: (ctx) => set({ screenContext: ctx }),
  setAiFilledCriteria: (scope, names) =>
    set((state) => ({
      aiFilledCriteria: { ...state.aiFilledCriteria, [scope]: { names, at: Date.now() } },
    })),
  clearScreenContext: (screenId) =>
    set((state) => {
      if (!screenId || state.screenContext?.screenId === screenId) {
        return { screenContext: null };
      }
      return {};
    }),

  messages: initialConversationsState.messages,
  isProcessing: false,
  skills: [],
  pendingSkillRetry: null,
  systemFacts: {},

  loadSystemFacts: () =>
    writeToSidecarLine({ action: "system_facts", op: "get" }),

  saveSystemFact: (key, value) => {
    const k = key.trim();
    const v = value.trim();
    if (!k || !v) return false;
    // İyimser güncelleme: disk onayı system_facts_result ile tazelenir
    set((state) => ({ systemFacts: { ...state.systemFacts, [k]: v } }));
    return writeToSidecarLine({
      action: "system_facts",
      op: "set",
      facts: { [k]: v },
    });
  },

  deleteSystemFact: (key) => {
    const k = key.trim();
    if (!k) return false;
    set((state) => {
      const { [k]: _removed, ...rest } = state.systemFacts;
      void _removed;
      return { systemFacts: rest };
    });
    return writeToSidecarLine({
      action: "system_facts",
      op: "clear",
      keys: [k],
    });
  },

  writeToSidecar: (line) => {
    if (!sharedChildProcess) return false;
    sharedChildProcess
      .write(line.endsWith("\n") ? line : line + "\n")
      .catch((err: any) => console.error("[Sidecar Write Error]:", err));
    return true;
  },

  newConversation: () => {
    syncActiveConversationMessages(set, get);

    // Bellek sıfırlanınca son raporun kriter sindirimi önbelleği de temizlenir
    lastKnownCriteriaDigest = null;
    lastKnownReportScope = null;
    try {
      localStorage.removeItem(CRITERIA_DIGEST_STORAGE_KEY);
      localStorage.removeItem(CRITERIA_SCOPE_STORAGE_KEY);
    } catch {}

    const state = get();
    const wsId = state.screenContext?.workspaceId || "stock";
    const newSess = createNewSession(wsId);

    saveActiveConversationId(newSess.id);

    set({
      activeConversationId: newSess.id,
      messages: newSess.messages,
      lastActiveReport: null,
      pendingSkillRetry: null,
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
    syncActiveConversationMessages(set, get);
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
          // bridge_result kendi requestId'siyle (bridge-*) bekleyen executor'a eşleşir;
          // görev requestId'sinden farklı olduğu için staleness süzgeci ONU yakalamamalı.
          if (evt.type !== "bridge_result" && isStaleEvent(evt, activeRequestId)) {
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

      await child.write(
        JSON.stringify({
          action: "configure_ai",
          confidenceGate: FAST_ROUTE_CONFIDENCE_THRESHOLD,
          config: get().aiConfig,
        }) + "\n"
      );

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

    // 🔁 Bekleyen skill onayı: önceki deneme önkoşul yüzünden başarısızsa
    // (örn. "önce raporu açın") kısa onay ("açtım/tamam/hazır") LLM'siz yeniden dener.
    const pendingRetry = get().pendingSkillRetry;
    if (pendingRetry) {
      const p = promptText.trim().toLocaleLowerCase("tr");
      const isShortConfirm =
        p.length <= 24 &&
        /^(tamam|tamamdır|ok|oldu|hazır|açtım|açıldı|yaptım|evet|devam)\b/.test(p);
      if (isShortConfirm) {
        void (async () => {
          try {
            const { invokeSkillDirect } = await import("@/lib/skills-bridge");
            const outcome = await invokeSkillDirect(pendingRetry.tool, pendingRetry.args);
            const res = outcome.result || {};
            if (outcome.ok && res.file_path) {
              set({ pendingSkillRetry: null });
              const rowsTxt =
                typeof res.rows_written === "number"
                  ? ` (${res.rows_written.toLocaleString("tr-TR")} satır)`
                  : "";
              get().appendMessage({
                sender: "agent",
                content: `📄 Hazır: [[file:${res.file_path}|${res.file_name || "Dosya"}]]${rowsTxt}`,
              });
            } else {
              const errMsg = outcome.error || res.error || "Yeniden denenemedi.";
              get().appendMessage({ sender: "system", content: `⚠️ ${errMsg}` });
            }
          } finally {
            if (processingTimeout) clearTimeout(processingTimeout);
            set({ isProcessing: false });
          }
        })();
        return;
      }
      // Kullanıcı başka bir konuya geçtiyse bekleyen niyeti düşür
      if (p.length > 0) set({ pendingSkillRetry: null });
    }

    let effectiveScreen = buildEffectiveScreen();
    // Şema sözleşmesi: x-ai.columnAliases → Step-1 kavram köprüsü (sözlüksüz)
    {
      const scopeHint =
        effectiveScreen?.activeReportScope ||
        useAgentBridgeStore.getState().lastActiveReport?.scope ||
        undefined;
      const colAliases = getColumnAliasesForScope(scopeHint);
      if (colAliases) {
        effectiveScreen = {
          ...effectiveScreen,
          activeDataSummary: {
            ...(effectiveScreen?.activeDataSummary || {}),
            columnAliases: colAliases,
          },
        } as ScreenContext;
      }
    }

    // ⚡ Hızlı Router: sonuç tablosu açıkken / net filtre sinyalinde deterministik aksiyon
    const route = resolveGridFastRoute(promptText, effectiveScreen, Boolean(toolRegistry.get("filter_active_grid")));
    if (route.matched) {
      setTimeout(async () => {
        const execution = await toolRegistry.executeTool(route.toolName, route.args);

        logAiTelemetry({
          source: "Deterministic Fast Router (Rule Engine)",
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
      const fastGatePassed =
        Boolean(fastResolved.tool) &&
        fastResolved.confidence >= FAST_ROUTE_CONFIDENCE_THRESHOLD &&
        (hasActionableArgs || isAskingNewReport(promptText.toLowerCase()));
      recordFastGateOutcome(fastGatePassed, fastResolved.confidence);
      if (fastGatePassed) {
        setTimeout(async () => {
          const execution = await toolRegistry.executeTool(fastResolved.tool, fastResolved.arguments);

          if (execution.success && (execution.result?.scope || execution.result?.customKind)) {
            set({ lastActiveReport: toReportMemory(fastResolved.tool, execution.result) });
            captureCriteriaDigestFromResult(execution.result);
            recordAiFilledCriteria(fastResolved.tool, fastResolved.arguments, execution.result);
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

    // Pozitif kanıt sözleşmesi: filter_active_grid için veri-eylemi kanıtı yoksa
    // prompt filtre OLMAZ — yerel rehber yanıta düşülür (ifade sözlüğü tutulmaz).
    if (
      evt.tool === "filter_active_grid" &&
      !hasGridFilterEvidence(lastPrompt, currentScreen ?? buildEffectiveScreen(), toolArgs)
    ) {
      void (async () => {
        await browserSchemaFallback(lastPrompt, currentScreen ?? buildEffectiveScreen());
        finishProcessing();
      })();
      return;
    }

    // State-Driven Guard + parametre kesinleştirme
    // Skill araçları (örn. report_export_xlsx) muaftır: sonuç grid'i açıkken bile
    // kendi amacıyla çalışmalı, filter_active_grid'e ezilmemeli.
    const isSkillTool = Boolean(toolRegistry.get(toolName)?.skill);
    if (!isSkillTool) {
      toolName = applyViewingStateGuard(toolName, lastPromptLower, isViewingResults, isAskingNewReport(lastPromptLower));
      if (toolName === "filter_active_grid") {
        // Model GEÇERLİ bir kolon verdiyse deterministik sentez DOKUNMAZ:
        // "pasif olanlar" → Gemma: IsActive/false doğruyken prompt-hint ('status')
        // üzerine yazmak hataya mahkum ediyordu. Sentez yalnızca kolon
        // yok/şemada değilken veya query boşken devreye girer.
        const cols = ((currentScreen?.activeDataSummary?.columns as string[]) || []).map((c) =>
          String(c).toLowerCase()
        );
        const modelCol =
          typeof toolArgs.column === "string" ? toolArgs.column.trim().toLowerCase() : "";
        const modelColValid = modelCol.length > 0 && cols.includes(modelCol);
        if (detectGridIntent(lastPromptLower) === "count") {
          // Sayım soruları filtre değeri OLAMAZ → KPI özetine delege edilir.
          toolName = "analyze_grid_data";
          toolArgs = ensureChartType({}, lastPromptLower);
        } else if (!modelColValid) {
          toolArgs = synthesizeGridFilterArgs(toolArgs, lastPrompt);
        } else if (!String(toolArgs.query ?? "").trim()) {
          toolArgs = synthesizeGridFilterArgs(toolArgs, lastPrompt);
        }
      }
      if (toolName === "analyze_grid_data") {
        toolArgs = ensureChartType(toolArgs, lastPromptLower);
      }
    }

    void (async () => {
      // Model kayıtlı olmayan bir araç adı ürettiyse (örn. kriter formu ekranında
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
          captureCriteriaDigestFromResult(execution.result);
          recordAiFilledCriteria(toolName, toolArgs, execution.result);
        }

        logAiTelemetry({
          source: evt.telemetry?.engine || "Yula Rule Engine",
          model: evt.telemetry?.model || "Yula Intent Engine",
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
              skip_followup: Boolean(execution.result?.skipFollowup),
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
      source: evt.telemetry?.engine || "Yula Rule Engine",
      model: evt.telemetry?.model || "Yula Intent Engine",
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

  // 2b-1. Skill keşfi: klasör listesi store'a + bridged skill'ler toolRegistry'ye
  if (evt.type === "skills_list") {
    const skills = Array.isArray(evt.skills) ? evt.skills : [];
    useAgentBridgeStore.setState({ skills });
    void (async () => {
      try {
        const { syncSkillsTools } = await import("@/lib/skills-bridge");
        syncSkillsTools(skills);
        console.log(`[Skills] ${skills.length} skill klasörü senkronlandı.`);
      } catch (err) {
        console.error("[Skills] toolRegistry senkronizasyonu başarısız:", err);
      }
    })();
    return;
  }

  // 2b-2. Bridged skill yürütme sonucu (skills-bridge bekleyenlerini çöz)
  if (evt.type === "bridge_result") {
    void (async () => {
      const { resolveBridgeWaiter } = await import("@/lib/skills-bridge");
      resolveBridgeWaiter(evt.requestId, {
        ok: Boolean(evt.ok),
        result: evt.result,
        error: evt.error,
      });
    })();
    return;
  }

  // 2b-3. Kalıcı sistem bilgileri anlık görüntüsü (system_facts protokol yanıtı)
  if (evt.type === "system_facts_result") {
    const facts =
      evt.facts && typeof evt.facts === "object" && !Array.isArray(evt.facts)
        ? (evt.facts as Record<string, string>)
        : {};
    setState({ systemFacts: facts });
    return;
  }

  // 2c. Sidecar-içinde yürütülen yetenekler (örn. web_fetch) — DevTools telemetrisi + sohbet bildirimi
  if (evt.type === "internal_tool") {    logAiTelemetry({
      source: "Yula Internal Capability (Sidecar-içi)",
      model: evt.tool || "internal_tool",
      userPrompt: getState().lastPrompt || "",
      context: getState().screenContext,
      toolCall: { tool: evt.tool || "", arguments: evt.arguments },
    });
    const url = typeof evt.arguments?.url === "string" ? evt.arguments.url : "";
    if (evt.tool === "web_fetch" && url) {
      getState().appendMessage({
        sender: "system",
        content: `🌐 Web sayfası çekiliyor: ${url}`,
      });
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
    criteriaDigest: currentScreen?.criteriaDigest,
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
  // Gemma yalnızca bu dar listeden seçim yapar (Step-2).
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

  // Kapalı-enum istisnası (AGENTS md.14): durum niyeti ("pasif olanlar") ve
  // adaylar boşsa şemadaki BOOL kolonlar aday olarak enjekte edilir — IsActive
  // gibi kolonlar durum-enum makinesine böyle ulaşır. Kelime listesi
  // değildir: tetikleyici extractCleanFilterValue'nun kapalı 'status' kavramı,
  // kaynak ise Arrow/DuckDB fiziksel tipleridir.
  if (columnCandidates.length === 0) {
    const pLowerAll = promptText.toLowerCase();
    for (const [col, arr] of Object.entries(
      ((effectiveScreen?.activeDataSummary as Record<string, any>)?.columnAliases as
        | Record<string, string[]>
        | undefined) || {}
    )) {
      if (
        (arr || []).some((a) => {
          const aLow = String(a).toLowerCase();
          return aLow.length >= 3 && pLowerAll.includes(aLow);
        })
      ) {
        columnCandidates = [col];
        break;
      }
    }
  }
  if (columnCandidates.length === 0) {
    const statusHint = extractCleanFilterValue(promptText).columnHint === "status";
    const colTypes = summary.columnTypes as Record<string, string> | undefined;
    if (statusHint && colTypes) {
      columnCandidates = Object.entries(colTypes)
        .filter(([, t]) => String(t).toLowerCase() === "bool")
        .map(([n]) => n);
    }
  }

  // Varsayılan rapor kapsamı: aktif ekran > son çalıştırılan rapor
  const defaultReportScope =
    effectiveScreen?.activeReportScope || lastKnownReportScope || undefined;
  if (defaultReportScope) summary.defaultReportScope = defaultReportScope;

  // Kriter sindirimi: canlı form > önbellek (ana ekran). main.py üst seviyeden okur.
  const liveDigest = effectiveScreen?.criteriaDigest;
  if (Array.isArray(liveDigest) && liveDigest.length > 0) {
    persistCriteriaDigest(liveDigest);
  }
  // Son raporun kriter sindirimi grid görünümünde de değerlidir ("bu rapor
  // ne hakkında" sorusu sonuç ekranında sorulabilir); columnDigest ile çakışmaz.
  const digestOut =
    Array.isArray(liveDigest) && liveDigest.length > 0
      ? liveDigest
      : lastKnownCriteriaDigest ?? undefined;
  console.debug(
    "[SidecarDispatch] giden bağlam:",
    JSON.stringify({
      screenId: effectiveScreen?.screenId,
      criteriaDigest: digestOut ? `${digestOut.length} alan` : "YOK",
      columnDigest: summary.columnDigest ? "var" : "yok",
      columnTypes: summary.columnTypes ? "var" : "yok",
      columnCandidates: columnCandidates.length,
      isViewingResults: Boolean(summary.isViewingResults),
    })
  );

  const enrichedScreen: ScreenContext = {
    ...effectiveScreen,
    activeDataSummary: { ...summary, columnCandidates },
    ...(defaultReportScope ? { defaultReportScope } : {}),
    ...(digestOut ? { criteriaDigest: digestOut } : {}),
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

// Geliştirme doğrulaması: konsoldan __yulaDebug() ile aktif ekran bağlamını incele
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__yulaDebug = () =>
    useAgentBridgeStore.getState().screenContext;
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
