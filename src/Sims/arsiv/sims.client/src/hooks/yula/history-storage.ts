import type { ChatMessage, YulaConversationSession } from "./types";

export const STORAGE_KEY_CONVERSATIONS = "sims:yula-conversations-v1";
export const STORAGE_KEY_ACTIVE_ID = "sims:yula-active-conversation-id";
export const STORAGE_KEY_HISTORY_OPEN = "sims:yula-history-open";

export const DEFAULT_INITIAL_MESSAGE: ChatMessage = {
  id: "init-1",
  sender: "system",
  content: "Yula AI hazır (Intent Rule Engine & Pydantic AI Multi-Provider).",
  timestamp: new Date().toLocaleTimeString("tr-TR"),
};

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

export function generateConversationTitle(promptText: string): string {
  if (!promptText) return "Yeni Sohbet";
  const clean = promptText
    .replace(/^\/[a-z0-9_-]+\s*/i, "") // Remove slash commands if any
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Yeni Sohbet";
  const firstSentence = clean.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length <= 40) {
    return firstSentence;
  }
  return firstSentence.slice(0, 37) + "...";
}

export function createNewSession(
  workspaceId?: string,
  title = "Yeni Sohbet"
): YulaConversationSession {
  const now = Date.now();
  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: now,
    updatedAt: now,
    workspaceId,
    messages: [DEFAULT_INITIAL_MESSAGE],
  };
}

export function loadStoredConversations(): YulaConversationSession[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY_CONVERSATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s) => s && typeof s === "object" && typeof s.id === "string"
    );
  } catch {
    return [];
  }
}

export function saveStoredConversations(
  conversations: YulaConversationSession[]
): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations));
  } catch (err) {
    console.warn("[YulaHistoryStorage] Sohbet geçmişi kaydedilemedi:", err);
  }
}

export function loadActiveConversationId(): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(STORAGE_KEY_ACTIVE_ID);
  } catch {
    return null;
  }
}

export function saveActiveConversationId(id: string | null): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    if (id) {
      storage.setItem(STORAGE_KEY_ACTIVE_ID, id);
    } else {
      storage.removeItem(STORAGE_KEY_ACTIVE_ID);
    }
  } catch {
    // ignore
  }
}

export function loadHistoryOpen(): boolean {
  const storage = getLocalStorage();
  if (!storage) return true;
  try {
    const raw = storage.getItem(STORAGE_KEY_HISTORY_OPEN);
    if (raw === null) return true; // Default open in main mode
    return raw === "true";
  } catch {
    return true;
  }
}

export function saveHistoryOpen(open: boolean): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_HISTORY_OPEN, String(open));
  } catch {
    // ignore
  }
}

export function groupSessionsByDate(sessions: YulaConversationSession[]) {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterdayStart = todayStart - 86400000;
  const lastWeekStart = todayStart - 7 * 86400000;

  const today: YulaConversationSession[] = [];
  const yesterday: YulaConversationSession[] = [];
  const lastWeek: YulaConversationSession[] = [];
  const older: YulaConversationSession[] = [];

  // Sort descending by updatedAt
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const session of sorted) {
    if (session.updatedAt >= todayStart) {
      today.push(session);
    } else if (session.updatedAt >= yesterdayStart) {
      yesterday.push(session);
    } else if (session.updatedAt >= lastWeekStart) {
      lastWeek.push(session);
    } else {
      older.push(session);
    }
  }

  return [
    { label: "Bugün", items: today },
    { label: "Dün", items: yesterday },
    { label: "Geçen Hafta", items: lastWeek },
    { label: "Daha Eski", items: older },
  ].filter((group) => group.items.length > 0);
}
