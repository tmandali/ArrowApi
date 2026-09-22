import type { YulaMessage } from "@/app/api/agent/chat/route";
import { getMessageText } from "@my-agent/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { extractJobIdFromHref, resolveConversationPathname } from "@/lib/workspace-paths";

export interface YulaBranchInfo {
  name: string;
  parentBranch?: string;
  createdAt: number;
}

export interface YulaConversation {
  id: string;
  title: string;
  createdAt: number;
  pathname?: string;
  /** Sonuç analizi sohbeti ise job GUID (pathname ile uyumlu). */
  jobId?: string;
  /** Ayrı ajan oturumu ise ajan id'si; null/undefined = varsayılan Yula. */
  agentId?: string | null;
  /** Aktif dal adı (varsayılan: "main") */
  activeBranch?: string;
  /** Konuşmanın dallanma kataloğu */
  branches?: Record<string, YulaBranchInfo>;
}

interface ChatsState {
  conversations: YulaConversation[];
  activeId: string | null;
  messagesById: Record<string, YulaMessage[]>;
  /** Sohbet kendi navigasyonuyla sayfa değiştirirken hedefe varışta kaydı bağlamak için (transient). */
  followNav: { id: string; at: number } | null;
  model: string;
  isHistoryOpen: boolean;
  searchQuery: string;
  isSearchingHistory: boolean;
  historyFilter: "all" | "screen";
  toggleHistory: (filter?: "all" | "screen") => void;
  setHistoryOpen: (open: boolean, filter?: "all" | "screen") => void;
  setHistoryFilter: (filter: "all" | "screen") => void;
  setSearchQuery: (query: string) => void;
  setSearchingHistory: (active: boolean) => void;
  ensureActiveConversation: () => void;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  deleteConversations: (ids: string[]) => void;
  renameConversation: (id: string, title: string) => void;
  renameFromFirstMessage: (id: string, text: string, agentId?: string | null) => void;
  clearAllConversations: () => void;
  saveMessages: (id: string, messages: YulaMessage[], pathname?: string, agentId?: string | null) => void;
  forkBranch: (conversationId: string, branchName: string) => void;
  switchBranch: (conversationId: string, branchName: string) => void;
  getBranchMessages: (conversationId: string, branchName?: string) => YulaMessage[];
  beginConversationFollow: (id: string) => void;
  followArrivedConversation: (id: string, href?: string, agentId?: string | null) => void;
  isThinkingEnabled: boolean;
  setThinkingEnabled: (enabled: boolean) => void;
  setModel: (model: string) => void;
}


function makeId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentLocationHref(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search}`;
}

export const useChatsStore = create<ChatsState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      messagesById: {},
      followNav: null,
      model: process.env.NEXT_PUBLIC_YULA_MODEL ?? "gpt-5.4",
      isThinkingEnabled: true,
      setThinkingEnabled: (isThinkingEnabled) => set({ isThinkingEnabled }),
      isHistoryOpen: false,
      searchQuery: "",
      isSearchingHistory: false,
      historyFilter: "all",

      toggleHistory: (filter) =>
        set((s) => {
          const nextFilter = filter ?? s.historyFilter;
          const shouldClose =
            s.isHistoryOpen && (filter ? s.historyFilter === filter : true);
          return {
            isHistoryOpen: !shouldClose,
            historyFilter: nextFilter,
          };
        }),

      setHistoryOpen: (open, filter) =>
        set((s) => ({
          isHistoryOpen: open,
          historyFilter: filter ?? s.historyFilter,
        })),

      setHistoryFilter: (filter) => set({ historyFilter: filter }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchingHistory: (active) => set({ isSearchingHistory: active }),


      ensureActiveConversation: () => {
        const { activeId, conversations } = get();
        if (activeId && (conversations.some((c) => c.id === activeId) || activeId.startsWith("c-"))) return;
        if (conversations.length > 0) {
          set({ activeId: conversations[0].id });
          return;
        }
        set({ activeId: makeId() });
      },

      newConversation: () => {
        set({ activeId: makeId(), isSearchingHistory: false, searchQuery: "" });
      },

      selectConversation: (id) => set({ activeId: id, isSearchingHistory: false }),

      deleteConversation: (id) => {
        // Vektör katmanı temizliği: silinen sohbetin hayalet embedding'i
        // RAG top-K'yu doldurmasın (duckdb-vector tembel yüklenir).
        // Hata sessize gömülmez (console.warn) + yetim taramasıyla uzlaşılır.
        void import("@/services/wasmsql-vector")
          .then(async ({ removeConversationVectors, purgeOrphanConversationVectors }) => {
            try {
              await removeConversationVectors([id]);
            } catch (err) {
              console.warn("[Yula chats] vektör silme başarısız:", err);
            }
            try {
              const remaining = get().conversations.map((c) => c.id);
              await purgeOrphanConversationVectors(remaining);
            } catch (err) {
              console.warn("[Yula chats] yetim vektör taraması başarısız:", err);
            }
          })
          .catch((err) => {
            console.warn("[Yula chats] vektör modülü yüklenemedi:", err);
          });
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          const messagesById = { ...s.messagesById };
          delete messagesById[id];
          // Silinen aktif sohbette başka kayda geçmek yerine taze sohbet açılır.
          const activeId = s.activeId === id ? makeId() : s.activeId;
          return { conversations, messagesById, activeId };
        });
      },

      deleteConversations: (ids) => {
        if (!ids.length) return;
        const idSet = new Set(ids);
        void import("@/services/wasmsql-vector")
          .then(async ({ removeConversationVectors, purgeOrphanConversationVectors }) => {
            try {
              await removeConversationVectors(ids);
            } catch (err) {
              console.warn("[Yula chats] toplu vektör silme başarısız:", err);
            }
            try {
              const remaining = get().conversations.map((c) => c.id).filter((id) => !idSet.has(id));
              await purgeOrphanConversationVectors(remaining);
            } catch (err) {
              console.warn("[Yula chats] yetim vektör taraması başarısız:", err);
            }
          })
          .catch((err) => {
            console.warn("[Yula chats] vektör modülü yüklenemedi:", err);
          });
        set((s) => {
          const conversations = s.conversations.filter((c) => !idSet.has(c.id));
          const messagesById = { ...s.messagesById };
          for (const id of ids) {
            delete messagesById[id];
          }
          const activeId = s.activeId && idSet.has(s.activeId) ? makeId() : s.activeId;
          return { conversations, messagesById, activeId };
        });
      },

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title: title.trim() || c.title } : c,
          ),
        })),

      renameFromFirstMessage: (id, text, agentId) =>
        set((s) => {
          const existingIndex = s.conversations.findIndex((c) => c.id === id);
          const title = text.slice(0, 40) || "Yeni Sohbet";
          const currentPath = currentLocationHref();
          if (existingIndex === -1) {
            return {
              conversations: [
                {
                  id,
                  title,
                  createdAt: Date.now(),
                  pathname: currentPath,
                  jobId: extractJobIdFromHref(currentPath) ?? undefined,
                  agentId: agentId ?? null,
                },
                ...s.conversations,
              ],
            };
          }
          return {
            conversations: s.conversations.map((c) =>
              c.id === id && c.title === "Yeni Sohbet"
                ? {
                    ...c,
                    title,
                    pathname: resolveConversationPathname(c.pathname, currentPath),
                    jobId:
                      extractJobIdFromHref(
                        resolveConversationPathname(c.pathname, currentPath),
                      ) ?? c.jobId,
                    agentId: agentId !== undefined ? (agentId ?? null) : (c.agentId ?? null),
                  }
                : c
            ),
          };
        }),

      clearAllConversations: () => {
        const ids = get().conversations.map((c) => c.id);
        if (ids.length > 0) {
          void import("@/services/wasmsql-vector")
            .then(async ({ removeConversationVectors, purgeOrphanConversationVectors }) => {
              try {
                await removeConversationVectors(ids);
              } catch (err) {
                console.warn("[Yula chats] toplu vektör silme başarısız:", err);
              }
              try {
                await purgeOrphanConversationVectors([]);
              } catch (err) {
                console.warn("[Yula chats] yetim vektör taraması başarısız:", err);
              }
            })
            .catch((err) => {
              console.warn("[Yula chats] vektör modülü yüklenemedi:", err);
            });
        }
        set({
          conversations: [],
          activeId: makeId(),
          messagesById: {},
          isSearchingHistory: false,
          searchQuery: "",
        });
      },

      saveMessages: (id, messages, pathname, agentId) =>
        set((s) => {
          const messagesById = { ...s.messagesById, [id]: messages };
          const userMsgs = messages.filter((m) => m.role === "user");
          let conversations = s.conversations;

          const currentPath = pathname || currentLocationHref();

          if (userMsgs.length > 0) {
            const existingIndex = conversations.findIndex((c) => c.id === id);
            const firstText = getMessageText(userMsgs[0]);
            const derivedTitle = firstText.slice(0, 40) || "Yeni Sohbet";

            if (existingIndex === -1) {
              conversations = [
                {
                  id,
                  title: derivedTitle,
                  createdAt: Date.now(),
                  pathname: resolveConversationPathname(undefined, currentPath),
                  jobId: extractJobIdFromHref(currentPath) ?? undefined,
                  agentId: agentId ?? null,
                },
                ...conversations,
              ];
            } else {
              // İçerik değişmediyse (sohbet geçişi/restor kaydı — navigasyon
              // boşluğunda eski sayfada tetiklenen persist) sayfa bağını
              // KAYDIRMA; pathname yalnız gerçekten yeni mesaj gelince güncellenir.
              const prev = s.messagesById[id];
              const hasNewContent = !prev || prev.length !== messages.length;
              conversations = conversations.map((c) => {
                if (c.id !== id) return c;
                const updatedTitle = c.title === "Yeni Sohbet" ? derivedTitle : c.title;
                const updatedPath = hasNewContent
                  ? resolveConversationPathname(c.pathname, currentPath)
                  : c.pathname;
                return {
                  ...c,
                  title: updatedTitle,
                  pathname: updatedPath,
                  jobId: hasNewContent
                    ? extractJobIdFromHref(updatedPath) ?? c.jobId
                    : c.jobId,
                  agentId: agentId !== undefined ? (agentId ?? null) : (c.agentId ?? null),
                };
              });
            }
          }

          return { messagesById, conversations };
        }),

      forkBranch: (conversationId, branchName) =>
        set((s) => {
          const conv = s.conversations.find((c) => c.id === conversationId);
          if (!conv) return s;
          const currentBranch = conv.activeBranch || "main";
          const currentKey = currentBranch === "main" ? conversationId : `${conversationId}:${currentBranch}`;
          const currentMessages = s.messagesById[currentKey] || [];
          const newBranchKey = `${conversationId}:${branchName}`;

          const updatedBranches = {
            ...(conv.branches || { main: { name: "main", createdAt: conv.createdAt } }),
            [branchName]: {
              name: branchName,
              parentBranch: currentBranch,
              createdAt: Date.now(),
            },
          };

          return {
            conversations: s.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, activeBranch: branchName, branches: updatedBranches }
                : c,
            ),
            messagesById: {
              ...s.messagesById,
              [newBranchKey]: [...currentMessages],
            },
          };
        }),

      switchBranch: (conversationId, branchName) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId ? { ...c, activeBranch: branchName } : c,
          ),
        })),

      getBranchMessages: (conversationId, branchName) => {
        const state = get();
        const conv = state.conversations.find((c) => c.id === conversationId);
        const b = branchName || conv?.activeBranch || "main";
        const key = b === "main" ? conversationId : `${conversationId}:${b}`;
        return state.messagesById[key] || [];
      },

      beginConversationFollow: (id) =>
        set({ followNav: { id, at: Date.now() } }),

      followArrivedConversation: (id, href, agentId) =>
        set((s) => {
          const resolved = href ?? currentLocationHref();
          if (!resolved) return { followNav: null };
          const pathname = resolveConversationPathname(undefined, resolved) ?? resolved;
          const jobId = extractJobIdFromHref(pathname) ?? undefined;
          const existingIndex = s.conversations.findIndex((c) => c.id === id);
          if (existingIndex === -1) {
            return {
              followNav: null,
              conversations: [
                {
                  id,
                  title: "Yeni Sohbet",
                  createdAt: Date.now(),
                  pathname,
                  jobId,
                  agentId: agentId ?? null,
                },
                ...s.conversations,
              ],
            };
          }
          return {
            followNav: null,
            conversations: s.conversations.map((c) =>
              c.id === id
                ? {
                    ...c,
                    pathname,
                    jobId: jobId ?? c.jobId,
                    agentId: agentId !== undefined ? (agentId ?? null) : (c.agentId ?? null),
                  }
                : c,
            ),
          };
        }),

      setModel: (model) => set({ model }),
    }),
    {
      name: "yula-chats",
      partialize: (state) => ({
        conversations: state.conversations,
        activeId: state.activeId,
        messagesById: state.messagesById,
        model: state.model,
        isThinkingEnabled: state.isThinkingEnabled,
      }),
    },
  ),
);

// Aktif sohbeti senkron başlat: persist hydrasyonu asenkron olsa bile
// ilk render'da activeId her zaman dolu olur — fallback gerektirmez.
if (typeof window !== "undefined") {
  useChatsStore.getState().ensureActiveConversation();
}
