"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { resetGridCustomView } from "@/lib/yula-client-tools";
import {
  YulaChatContext,
  type YulaChatContextValue,
} from "./yula-chat-context";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { navigateToConversationScreen, healConversationRecords } from "@/lib/yula-history-navigation";
import { yulaModelsApiUrl } from "@/lib/yula-ai-client-config";
import { ChatInstance } from "./yula-chat/yula-chat-instance";
import {
  firstUserMessageText,
  getActiveConversationId,
  type LiveHelpers,
} from "./yula-chat/chat-shared";
import { installPiTraceBridge } from "@/lib/my-agent-pi-bridge";
import { useConversationRouteSync } from "./yula-chat/use-conversation-route-sync";
import { reconciliationEngine } from "@my-agent/core";
import { registerDefaultYulaPlugins } from "@/lib/plugins/yula-plugins";

/**
 * Yula v2 — referans repo deseninin standart Next karşılığı.
 * Tek kaynak: ai-sdk `useChat` + zustand persist (konuşma geçmişi/model).
 *
 * Konuşma değişimi: dış sağlayıcı yalnız seçim durumunu okur,
 * içte anahtarlanmış (<ChatInstance key>) taze bir chat örneği kurulur;
 * böylece persist edilmiş mesajlar asla çalışan örneğe çift eklenmez.
 */

export function YulaChatProvider({ children }: { children: React.ReactNode }) {
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const model = useChatsStore((s) => s.model);
  const setModel = useChatsStore((s) => s.setModel);

  // Dock açıldığında aktif konuşmanın varlığını garanti et
  React.useEffect(() => {
    useChatsStore.getState().ensureActiveConversation();
  }, []);

  // Eski kayıt self-heal: ana sayfaya bağlı kalmış sohbetleri mesajlarındaki
  // son navigasyon hedefine bağla (açılışta bir kez).
  React.useEffect(() => {
    healConversationRecords();
  }, []);

  // my-agent Pi köprüsü: tool_execution_start/end olayları turn-trace'e
  // adım satırı olarak düşer (YulaWorkedAccordion görünümü değişmez).
  React.useEffect(() => {
    installPiTraceBridge(getActiveConversationId);
  }, []);

  // Pi Reconcile: Tarayıcı açılışında askıda kalan kilitlenme veya yarım kalmış oturum işlemlerini toparla
  React.useEffect(() => {
    try {
      const report = reconciliationEngine.reconcile();
      if (report.hasInconsistencies) {
        console.info(`🔄 [Yula Reconcile]: ${report.message}`);
      }
    } catch (e) {
      console.warn("[Yula Reconcile Error]:", e);
    }
  }, []);

  // Pi Plugins: Varsayılan analitik ve tahminleme eklentilerini çalışma zamanına kaydet
  React.useEffect(() => {
    void registerDefaultYulaPlugins().catch((e) => {
      console.warn("[Yula Plugins Register Error]:", e);
    });
  }, []);

  // Ekran bazlı aktif sohbet yönetimi (sayfa değişiminde taze/kayıtlı sohbet seçimi).
  useConversationRouteSync();

  // Soğuk başlangıç ısıtması: dock açılır açılmaz Ollama modeli belleğe
  // yüklenir (models route'u boş-prompt warmup tetikler) → ilk mesaj hızlı.
  React.useEffect(() => {
    void fetch(yulaModelsApiUrl()).catch(() => {
      // Isıtma best-effort
    });
  }, []);

  // Sohbet geçmişini RAG vektör store'a indeksle (ilk yükleme + her yeni
  // sohbet/kayıtta artımlı). Ana sayfa araması menülerle birlikte geçmişi de
  // semantik arayabilsin diye. duckdb-vector'ü tembel yükle (WASM).
  // Ardından yetim taraması: önceki oturumdan kalma silinmiş konuşma
  // vektörleri tabloyu kirletmesin (boş liste asla purge etmez — guard yukarıda).
  React.useEffect(() => {
    if (conversations.length === 0) return;
    const store = useChatsStore.getState();
    const items = conversations
      .map((c) => ({
        id: c.id,
        title: c.title,
        pathname: c.pathname,
        jobId: c.jobId,
        agentId: c.agentId ?? null,
        snippet: firstUserMessageText(store.messagesById[c.id]).slice(0, 400),
      }))
      .filter((i) => i.snippet.trim().length > 0);
    if (items.length === 0) return;
    void import("@/services/duckdb-vector").then(
      ({ indexConversationHistory, purgeOrphanConversationVectors }) => {
        void indexConversationHistory(items)
          .then(() =>
            purgeOrphanConversationVectors(
              useChatsStore.getState().conversations.map((c) => c.id),
            ),
          )
          .catch((err) => {
            // Geçmiş indeksleme/temizlik best-effort — ama görünür olsun.
            console.warn("[Yula RAG] geçmiş indeksleme/temizlik başarısız:", err);
          });
      },
    );
  }, [conversations]);

  const router = useRouter();
  const selectConversation = React.useCallback(
    (id: string) => {
      const store = useChatsStore.getState();
      store.selectConversation(id);
      const target = store.conversations.find((c) => c.id === id);
      if (!target) return;
      // Geçmişten ajan sohbeti seçildiyse persona seçimini de eşitle.
      if (target.agentId) {
        useUserAgentsStore.getState().setActiveAgentId(target.agentId);
      }
      navigateToConversationScreen(
        target,
        (href) => {
          router.push(href);
        },
        store.messagesById[id],
      );
    },
    [router],
  );
  const deleteConversation = React.useCallback(
    (id: string) => useChatsStore.getState().deleteConversation(id),
    [],
  );
  const [liveHelpers, setLiveHelpers] = React.useState<LiveHelpers | null>(null)

  const newConversation = React.useCallback(() => {
    // Devam eden akış/araç döngüsünü KES — aksi halde eski tur arka planda
    // sürmeye devam eder ve "yeni sohbet" tam hissettirmez.
    liveHelpers?.stop();
    // Özel grid görünümünü (set_grid_query) de sıfırla — tam temiz başlangıç
    void resetGridCustomView();
    useChatsStore.getState().newConversation();
  }, [liveHelpers]);

  const [helpersVersion, bump] = React.useReducer((x) => x + 1, 0);
  const lastSigRef = React.useRef("");

  const setLiveHelpersStable = React.useCallback((h: LiveHelpers) => {
    // Canlı akış parçaları (metin token'ları / araç çağrıları) geldikçe imza değişsin ve UI anında güncellensin
    const lastMsg = h.messages[h.messages.length - 1];
    const partsCount = lastMsg?.parts?.length ?? 0;
    const textLen = (lastMsg?.parts ?? []).reduce(
      (acc, p) => acc + (typeof (p as { text?: string }).text === "string" ? (p as { text?: string }).text!.length : 1),
      0
    );
    // Sohbet kimliği imzada: iki sohbet aynı görünümlü durumda olsa bile
    // geçişte panel mutlaka tazelensin (geçmişten açılan sohbetin görünmemesi)
    const sig = `${useChatsStore.getState().activeId}:${h.status}:${h.messages.length}:${partsCount}:${textLen}:${Boolean(h.error)}:${h.busy}:${h.contextUsage?.percent}:${h.isCompacting}:${h.autoCompactEnabled}`;
    // İmza değişmeden state GÜNCELLENMEZ: ChatInstance her render'da yeni bir
    // helpers objesi üretir; koşulsuz setState sonsuz döngü kurar.
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    setLiveHelpers(h);
    bump();
  }, []);

  const isThinkingEnabled = useChatsStore((s) => s.isThinkingEnabled);
  const setThinkingEnabled = useChatsStore((s) => s.setThinkingEnabled);

  const value = React.useMemo<YulaChatContextValue>(() => {
    void helpersVersion; // sig/bump tetikleyicisi — canlı akış tazeliği
    if (!liveHelpers) {
      // liveHelpers henüz yüklenmedi: minimal değer döner, panel boş kalır.
      return {
        messages: [],
        status: 'ready',
        busy: false,
        stopped: false,
        conversations,
        activeId: activeId ?? '',
        selectConversation: () => {},
        deleteConversation: () => {},
        newConversation: () => {},
        model,
        setModel: () => {},
        isThinkingEnabled,
        setThinkingEnabled: () => {},
        stop: async () => {},
        error: undefined,
        addToolOutput: () => {},
        isTurnActive: false,
        responseDurations: {},
        llmStepCounts: {},
        streamErrorTexts: {},
        sendMessageText: () => {},
        undoToUserMessage: () => undefined,
        retryResponse: async () => {},
        runPendingTool: () => {},
        dumpSession: () => {},
        contextUsage: undefined,
        autoCompactEnabled: true,
        setAutoCompactEnabled: () => {},
        isCompacting: false,
        compact: async () => false,
        steer: () => {},
        followUp: () => {},
        steeringQueue: [],
        followUpQueue: [],
        clearSteering: () => {},
        clearFollowUp: () => {},
      };
    }
    return {
      ...liveHelpers,
      conversations,
      activeId: activeId ?? '',
      selectConversation,
      deleteConversation,
      newConversation,
      model,
      setModel,
      isThinkingEnabled,
      setThinkingEnabled,
    };
  }, [
	helpersVersion,
	liveHelpers,
	activeId,
	conversations,
	model,
	setModel,
	isThinkingEnabled,
	setThinkingEnabled,
	selectConversation,
	deleteConversation,
	newConversation
  ]);

  return (
    <>
      {activeId ? (
        <ChatInstance
          key={activeId}
          conversationId={activeId}
          onContextReady={setLiveHelpersStable}
        />
      ) : null}
      <YulaChatContext.Provider value={value}>
        {children}
      </YulaChatContext.Provider>
    </>
  );
}

// Not: Uygulama kabuğu (children) sohbet oturumundan BAĞIMSIZ render edilir;
// context null iken yalnızca sohbet paneli kendi içinde "hazırlanıyor" gösterir
// (AIChatPanel). Panel ~4 sn içinde hazır olmazsa "Uygulama yüklenemedi"
// durumuna düşer (hydration/oturum hatası ihtimali); yenileme aksiyonu sunar.
