import { describe, it, expect, beforeEach } from "vitest";
import {
  generateConversationTitle,
  createNewSession,
  groupSessionsByDate,
  loadStoredConversations,
  saveStoredConversations,
} from "./history-storage";

// Mock localStorage for node environment
const memoryStore = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => memoryStore.set(key, value),
  removeItem: (key: string) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
  length: 0,
  key: () => null,
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

describe("Yula History Storage Helpers", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("generates clean conversation titles from prompt text", () => {
    expect(generateConversationTitle("")).toBe("Yeni Sohbet");
    expect(generateConversationTitle("/new")).toBe("Yeni Sohbet");
    expect(generateConversationTitle("Stok bakiye raporunu aç ve filtrelere bak")).toBe(
      "Stok bakiye raporunu aç ve filtrelere..."
    );
    expect(generateConversationTitle("Ankara deposu satışları")).toBe(
      "Ankara deposu satışları"
    );
  });

  it("creates new session with default initial message", () => {
    const session = createNewSession("stock", "Test Sohbet");
    expect(session.id).toContain("session-");
    expect(session.title).toBe("Test Sohbet");
    expect(session.workspaceId).toBe("stock");
    expect(session.messages.length).toBe(1);
    expect(session.messages[0].id).toBe("init-1");
  });

  it("saves and loads stored conversations", () => {
    const session1 = createNewSession("stock", "Sohbet 1");
    saveStoredConversations([session1]);

    const loaded = loadStoredConversations();
    expect(loaded.length).toBe(1);
    expect(loaded[0].title).toBe("Sohbet 1");
  });

  it("groups sessions chronologically by date", () => {
    const now = Date.now();
    const sessionToday = {
      ...createNewSession("stock", "Bugün Sohbet"),
      updatedAt: now,
    };
    const sessionYesterday = {
      ...createNewSession("selling", "Dün Sohbet"),
      updatedAt: now - 86400000 * 1.5,
    };
    const sessionOlder = {
      ...createNewSession("accounting", "Eski Sohbet"),
      updatedAt: now - 86400000 * 10,
    };

    const grouped = groupSessionsByDate([
      sessionToday,
      sessionYesterday,
      sessionOlder,
    ]);

    expect(grouped.length).toBeGreaterThanOrEqual(2);
    const todayGroup = grouped.find((g) => g.label === "Bugün");
    expect(todayGroup?.items[0].title).toBe("Bugün Sohbet");
  });
});
