"use client";

import { useState, useEffect, useTransition } from "react";
import { ALL_WORKSPACE_MENU_ITEMS, type WorkspaceMenuItem } from "@/features/stock/lib/stock-menu-registry";
import { searchVectorContext } from "@/services/duckdb-vector";
import { useChatsStore, type YulaConversation } from "@/lib/stores/chats";
import type { YulaMessage } from "@/app/api/agent/chat/route";

export interface WorkspaceSearchResultItem {
  id: string;
  title: string;
  titleTr: string;
  url: string;
  category: string;
  workspace: string;
  score: number; // 0 - 100
  isExactMatch: boolean;
  sourceText?: string;
  /** Sonuç kaynağı: menü/modül mü, sohbet geçmişi mi? */
  source?: "menu" | "conversation";
  /** Sohbet sonuçlarında dokunulduğunda dock'ta açılacak konuşma kimliği. */
  conversationId?: string;
}

export interface WorkspaceSearchResultGroup {
  category: string;
  items: WorkspaceSearchResultItem[];
}

const TURKISH_STOP_WORDS = new Set([
  "hangi", "var", "neler", "göster", "bana", "listele", "bul", "ve", "veya",
  "bir", "için", "ile", "mi", "mı", "mu", "mü", "olan", "tüm", "hepsi",
  "nasıl", "nerede", "nedir", "görürüm", "bakabilirim", "sayfası", "ekranı",
  "varı", "yok", "tane", "şeyi", "şeyler", "türlü", "çeşit", "var"
]);

const CHAT_HISTORY_CATEGORY = "Sohbet Geçmişi";

/** Sohbetin ilk kullanıcı mesajının metnini döner (geçmiş arama bağlamı için). */
function firstUserText(messages: YulaMessage[] | undefined): string {
  const firstUser = messages?.find((m) => m.role === "user");
  const textPart = firstUser?.parts.find(
    (p): p is Extract<(typeof p), { type: "text" }> => p.type === "text",
  );
  return textPart && textPart.type === "text" ? (textPart.text ?? "") : "";
}

/** Token setinin (kök eki temizlemeli) metinle eşleşip eşleşmediğini kontrol eder. */
function matchesSearchTokens(searchableText: string, activeTokens: string[]): boolean {
  return activeTokens.every((token) => {
    if (searchableText.includes(token)) return true;
    // Basit kök eki temizleme (ör: 'raporlar' -> 'rapor')
    if (token.length > 4) {
      const stem = token.replace(/(larını|lerini|ları|leri|lar|ler|da|de|ta|te|ını|ini|nı|ni)$/, "");
      if (stem.length >= 3 && searchableText.includes(stem)) return true;
    }
    return false;
  });
}

/** Konuşmayı ortak arama listesi öğesine çevirir. */
function conversationResultItem(
  conv: YulaConversation,
  snippet: string,
  score: number,
  isExactMatch: boolean,
): WorkspaceSearchResultItem {
  return {
    id: `conv_${conv.id}`,
    title: conv.title || "Sohbet",
    titleTr: "",
    url: conv.pathname || "/",
    category: CHAT_HISTORY_CATEGORY,
    workspace: "chats",
    score,
    isExactMatch,
    source: "conversation",
    conversationId: conv.id,
    sourceText: snippet || undefined,
  };
}

/** Zustand store'daki içi dolu konuşmaları (başlık + ilk kullanıcı mesajı) okur. */
function readChatConversations(): Array<{ conv: YulaConversation; snippet: string }> {
  const store = useChatsStore.getState();
  return store.conversations
    .map((conv) => ({ conv, snippet: firstUserText(store.messagesById[conv.id]).slice(0, 400) }))
    .filter((entry) => entry.snippet.trim().length > 0);
}

export function useWorkspaceRagSearch(query: string, workspace = "stock") {
  const [results, setResults] = useState<WorkspaceSearchResultItem[]>([]);
  const [groupedResults, setGroupedResults] = useState<WorkspaceSearchResultGroup[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isSearchingRag, setIsSearchingRag] = useState(false);
  // Silme/ekleme sonrası listenin tazelenmesi için store'a abone ol
  const conversations = useChatsStore((s) => s.conversations);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();

    const isItemInWorkspace = (item: WorkspaceMenuItem) => {
      if (workspace === "all" || workspace === "system") return true;
      if (item.workspace === workspace) return true;
      if (workspace === "selling" && item.workspace === "subcontracting") return true;
      if (workspace === "subcontracting" && item.workspace === "selling") return true;
      if (workspace === "financial-reports" && item.workspace === "accounting") return true;
      return false;
    };

    if (!trimmed) {
      // Boş sorgu (default): yalnız yazışmalar listelenir; menülere yazınca aranılır.
      const recentConversations = readChatConversations()
        .sort((a, b) => b.conv.createdAt - a.conv.createdAt)
        .map((entry) => conversationResultItem(entry.conv, entry.snippet, 100, true));

      startTransition(() => {
        setResults(recentConversations);
        setGroupedResults(groupItems(recentConversations));
      });
      setIsSearchingRag(false);
      return;
    }

    // Doğal dil durak kelimelerini (hangi, var, neler, göster vb.) filtrele
    const rawTokens = trimmed.split(/\s+/).filter(Boolean);
    const meaningfulTokens = rawTokens.filter((t) => !TURKISH_STOP_WORDS.has(t));
    const activeTokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;

    // 1) Anlık Akıllı Token & Kök Eşleşmesi (Fast Path - 0 ms)
    const exactMatches: WorkspaceSearchResultItem[] = ALL_WORKSPACE_MENU_ITEMS
      .filter((item) => {
        if (!isItemInWorkspace(item)) return false;

        const searchableText = `${item.title} ${item.titleTr} ${item.category} ${item.description} ${item.keywords.join(" ")}`.toLowerCase();

        return matchesSearchTokens(searchableText, activeTokens);
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        titleTr: item.titleTr,
        url: item.url,
        category: item.category,
        workspace: item.workspace,
        score: 100,
        isExactMatch: true,
        source: "menu" as const,
      }));

    // 1b) Sohbet geçmişi hızlı yol: başlık + ilk kullanıcı mesajında token eşleşmesi
    const conversationMatches = readChatConversations()
      .filter(({ conv, snippet }) =>
        matchesSearchTokens(`${conv.title} ${snippet}`.toLowerCase(), activeTokens),
      )
      .sort((a, b) => b.conv.createdAt - a.conv.createdAt)
      .slice(0, 10)
      .map((entry) => conversationResultItem(entry.conv, entry.snippet, 100, true));

    const exactAll = [...exactMatches, ...conversationMatches];

    // Anlık eşleşmeleri ilk etapta göster
    startTransition(() => {
      setResults(exactAll);
      setGroupedResults(groupItems(exactAll));
    });

    // 2) Asenkron DuckDB WASM Vektör Semantik Arama (3-5 ms)
    let isCancelled = false;
    setIsSearchingRag(true);

    const timer = setTimeout(async () => {
      try {
        const startTime = performance.now();
        const ragItems = await searchVectorContext(query, 20);
        if (isCancelled) return;

        // Silinmiş yazışmalar semantik sonuçlarda tekrar listelenmesin
        const existingConvIds = new Set(
          useChatsStore.getState().conversations.map((c) => c.id),
        );

        const vectorResults: WorkspaceSearchResultItem[] = [];
        const seenIds = new Set(exactAll.map((m) => m.id));

        for (const ragItem of ragItems) {
          const meta = ragItem.metadata as {
            type?: string;
            title?: string;
            titleTr?: string;
            url?: string;
            category?: string;
            workspace?: string;
            pathname?: string;
            conversationId?: string;
          };

          // Benzerlik skoru hesabı (Cosine distance)
          const distance = ragItem.distance ?? 0.5;
          const similarityScore = Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));

          if (meta?.type === "conversation") {
            // Sohbet geçmişi semantik eşleşmesi
            if (
              meta.conversationId &&
              existingConvIds.has(meta.conversationId) &&
              similarityScore >= 50 &&
              !seenIds.has(ragItem.id)
            ) {
              seenIds.add(ragItem.id);
              vectorResults.push({
                id: ragItem.id,
                title: meta.title || "Sohbet",
                titleTr: "",
                url: meta.pathname || "/",
                category: CHAT_HISTORY_CATEGORY,
                workspace: "chats",
                score: similarityScore,
                isExactMatch: false,
                source: "conversation",
                conversationId: meta.conversationId,
                sourceText: ragItem.content,
              });
            }
            continue;
          }

          if (meta?.type === "menu_item" && meta.url) {
            const itemId = ragItem.id.replace(`menu_${workspace}_`, "");

            // Eşik değeri: Rastgele gürültü kelimeleri (ör: 'dedede3e3') engellemek için %50 ve üzeri semantik benzerlik iste
            if (similarityScore >= 50) {
              if (!seenIds.has(itemId)) {
                seenIds.add(itemId);
                vectorResults.push({
                  id: itemId,
                  title: meta.title || ragItem.scope,
                  titleTr: meta.titleTr || meta.title || "",
                  url: meta.url,
                  category: meta.category || "Diğer",
                  workspace: meta.workspace || workspace,
                  score: similarityScore,
                  isExactMatch: false,
                  sourceText: ragItem.content,
                  source: "menu",
                });
              }
            }
          }
        }

        // Exact + Vector sonuçlarını birleştir ve skora göre sırala
        const merged = [...exactAll, ...vectorResults].sort((a, b) => {
          if (a.isExactMatch && !b.isExactMatch) return -1;
          if (!a.isExactMatch && b.isExactMatch) return 1;
          return b.score - a.score;
        });

        const elapsedMs = Math.round(performance.now() - startTime);
        console.info(
          `%c🤖 [Yula Header AI Search Telemetry]%c query: "%c${query}%c" · %c${merged.length} results%c (${elapsedMs} ms)`,
          "color: #10b981; font-weight: bold;",
          "color: inherit;",
          "color: #3b82f6; font-style: italic;",
          "color: inherit;",
          "color: #8b5cf6; font-weight: bold;",
          "color: #6b7280;",
        );

        if (!isCancelled) {
          startTransition(() => {
            setResults(merged);
            setGroupedResults(groupItems(merged));
          });
        }
      } catch (err) {
        console.warn("[useWorkspaceRagSearch] search error:", err);
      } finally {
        if (!isCancelled) {
          setIsSearchingRag(false);
        }
      }
    }, 100); // 100ms debounce

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, workspace, conversations]);

  return {
    results,
    groupedResults,
    isSearching: isPending || isSearchingRag,
  };
}

function groupItems(items: WorkspaceSearchResultItem[]): WorkspaceSearchResultGroup[] {
  const groupsMap = new Map<string, WorkspaceSearchResultItem[]>();

  for (const item of items) {
    const cat = item.category || "Diğer";
    if (!groupsMap.has(cat)) {
      groupsMap.set(cat, []);
    }
    groupsMap.get(cat)!.push(item);
  }

  return Array.from(groupsMap.entries()).map(([category, items]) => ({
    category,
    items,
  }));
}
