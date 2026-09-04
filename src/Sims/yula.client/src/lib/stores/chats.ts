import type { YulaMessage } from "@/app/api/agent/chat/route";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { extractJobIdFromHref, resolveConversationPathname } from "@/lib/workspace-paths";

export interface YulaConversation {
  id: string;
  title: string;
  createdAt: number;
  pathname?: string;
  /** Sonuç analizi sohbeti ise job GUID (pathname ile uyumlu). */
  jobId?: string;
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
  renameConversation: (id: string, title: string) => void;
  renameFromFirstMessage: (id: string, text: string) => void;
  clearAllConversations: () => void;
  saveMessages: (id: string, messages: YulaMessage[], pathname?: string) => void;
  beginConversationFollow: (id: string) => void;
  followArrivedConversation: (id: string, href?: string) => void;
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

      deleteConversation: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          const messagesById = { ...s.messagesById };
          delete messagesById[id];
          const activeId =
            s.activeId === id
              ? conversations[0]?.id ?? makeId()
              : s.activeId;
          return { conversations, messagesById, activeId };
        }),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title: title.trim() || c.title } : c,
          ),
        })),

      renameFromFirstMessage: (id, text) =>
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
                  }
                : c
            ),
          };
        }),

      clearAllConversations: () => {
        set({
          conversations: [],
          activeId: makeId(),
          messagesById: {},
          isSearchingHistory: false,
          searchQuery: "",
        });
      },

      saveMessages: (id, messages, pathname) =>
        set((s) => {
          const messagesById = { ...s.messagesById, [id]: messages };
          const userMsgs = messages.filter((m) => m.role === "user");
          let conversations = s.conversations;

          const currentPath = pathname || currentLocationHref();

          if (userMsgs.length > 0) {
            const existingIndex = conversations.findIndex((c) => c.id === id);
            const textPart = userMsgs[0].parts.find((p) => p.type === "text");
            const firstText = textPart && "text" in textPart ? String(textPart.text) : "";
            const derivedTitle = firstText.slice(0, 40) || "Yeni Sohbet";

            if (existingIndex === -1) {
              conversations = [
                {
                  id,
                  title: derivedTitle,
                  createdAt: Date.now(),
                  pathname: resolveConversationPathname(undefined, currentPath),
                  jobId: extractJobIdFromHref(currentPath) ?? undefined,
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
                };
              });
            }
          }

          return { messagesById, conversations };
        }),

      beginConversationFollow: (id) =>
        set({ followNav: { id, at: Date.now() } }),

      followArrivedConversation: (id, href) =>
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
                },
                ...s.conversations,
              ],
            };
          }
          return {
            followNav: null,
            conversations: s.conversations.map((c) =>
              c.id === id ? { ...c, pathname, jobId: jobId ?? c.jobId } : c,
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

// İlk render'da aktif sohbet hazır olsun: persist rehydration'ı senkron
// tamamlanmazsa bile provider ilk boyamada ChatInstance'ı mount edebilir.
if (typeof window !== "undefined") {
  useChatsStore.getState().ensureActiveConversation();
}
