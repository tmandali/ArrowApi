import type { YulaMessage } from "@/app/api/agent/chat/route";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface YulaConversation {
  id: string;
  title: string;
  createdAt: number;
  pathname?: string;
}

interface ChatsState {
  conversations: YulaConversation[];
  activeId: string | null;
  messagesById: Record<string, YulaMessage[]>;
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
  isThinkingEnabled: boolean;
  setThinkingEnabled: (enabled: boolean) => void;
  setModel: (model: string) => void;
}

function makeId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useChatsStore = create<ChatsState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      messagesById: {},
      model: process.env.NEXT_PUBLIC_YULA_MODEL ?? "gemma4:12b-mlx",
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
          const currentPath = typeof window !== "undefined" ? window.location.pathname : undefined;
          if (existingIndex === -1) {
            return {
              conversations: [
                { id, title, createdAt: Date.now(), pathname: currentPath },
                ...s.conversations,
              ],
            };
          }
          return {
            conversations: s.conversations.map((c) =>
              c.id === id && c.title === "Yeni Sohbet"
                ? { ...c, title, pathname: c.pathname || currentPath }
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

          const currentPath =
            pathname ||
            (typeof window !== "undefined" ? window.location.pathname : undefined);

          if (userMsgs.length > 0) {
            const existingIndex = conversations.findIndex((c) => c.id === id);
            const textPart = userMsgs[0].parts.find((p) => p.type === "text");
            const firstText = textPart && "text" in textPart ? String(textPart.text) : "";
            const derivedTitle = firstText.slice(0, 40) || "Yeni Sohbet";

            if (existingIndex === -1) {
              conversations = [
                { id, title: derivedTitle, createdAt: Date.now(), pathname: currentPath },
                ...conversations,
              ];
            } else {
              conversations = conversations.map((c) => {
                if (c.id !== id) return c;
                const updatedTitle = c.title === "Yeni Sohbet" ? derivedTitle : c.title;
                const updatedPath = c.pathname || currentPath;
                return { ...c, title: updatedTitle, pathname: updatedPath };
              });
            }
          }

          return { messagesById, conversations };
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
