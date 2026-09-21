"use client";

import * as React from "react";
import { useChatsStore } from "@/lib/stores/chats";
import { getMessageText } from "@my-agent/core";

export type HistorySuggestion = {
  text: string;
  title: string;
  createdAt: number;
  convId: string;
};

/**
 * Kısa göreli zaman ("az önce", "5 dk önce", "1 sa önce", "3 gün önce").
 * Geçmiş öneri satırının yanında rozet olarak gösterilir.
 */
export function formatHistoryAgo(
  createdAt: number,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  const diffMs = Date.now() - createdAt;
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return t("history_just_now");
  if (minutes < 60) return t("history_minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("history_hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("history_days", { count: days });
  if (days < 30) return t("history_weeks", { count: Math.floor(days / 7) });
  const months = Math.floor(days / 30);
  if (months < 12) return t("history_months", { count: months });
  return t("history_years", { count: Math.floor(months / 12) });
}

/**
 * Ajan geçmişi önerileri: yazdıkça bu ajanın kendi kayıtlarındaki
 * kullanıcı sorularından ilk 10 eşleşme (ok tuşlarıyla gezilir).
 * YulaHistoryMainView ile aynı ajan ayrımı: (c.agentId ?? null) eşleşmesi.
 */
export function useHistorySuggestions(
  input: string,
  historyAgentId: string | null,
): HistorySuggestion[] {
  const historyConversations = useChatsStore((s) => s.conversations);
  const historyMessagesById = useChatsStore((s) => s.messagesById);

  return React.useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || q.length < 2 || input.startsWith("/")) return [];
    const seen = new Set<string>();
    const out: HistorySuggestion[] = [];
    const sorted = [...historyConversations]
      .filter((c) => (c.agentId ?? null) === (historyAgentId ?? null))
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const conv of sorted) {
      const msgs = historyMessagesById[conv.id] ?? [];
      if (msgs.length > 0) {
        for (let i = msgs.length - 1; i >= 0 && out.length < 10; i -= 1) {
          const m = msgs[i];
          if (m.role !== "user") continue;
          const text = getMessageText(m);
          if (!text || text.length < 2) continue;
          const key = text.toLowerCase();
          if (key === q || seen.has(key)) continue;
          if (!key.includes(q)) continue;
          seen.add(key);
          out.push({ text, title: conv.title || text.slice(0, 40), createdAt: conv.createdAt, convId: conv.id });
          if (out.length >= 10) break;
        }
      } else {
        // Henüz mesajı yüklenmemiş kayıt: başlık üzerinden eşleşme.
        const title = (conv.title || "").trim();
        if (!title || title === "Yeni Sohbet") continue;
        const key = title.toLowerCase();
        if (key === q || seen.has(key)) continue;
        if (!key.includes(q)) continue;
        seen.add(key);
        out.push({ text: title, title, createdAt: conv.createdAt, convId: conv.id });
      }
      if (out.length >= 10) break;
    }
    return out;
  }, [input, historyConversations, historyMessagesById, historyAgentId]);
}
