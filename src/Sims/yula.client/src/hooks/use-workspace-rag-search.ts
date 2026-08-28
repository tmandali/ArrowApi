"use client";

import { useState, useEffect, useTransition } from "react";
import { ALL_WORKSPACE_MENU_ITEMS, type WorkspaceMenuItem } from "@/features/stock/lib/stock-menu-registry";
import { searchVectorContext, type RagVectorItem } from "@/services/duckdb-vector";

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

export function useWorkspaceRagSearch(query: string, workspace = "stock") {
  const [results, setResults] = useState<WorkspaceSearchResultItem[]>([]);
  const [groupedResults, setGroupedResults] = useState<WorkspaceSearchResultGroup[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isSearchingRag, setIsSearchingRag] = useState(false);

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
      const defaultMatches: WorkspaceSearchResultItem[] = ALL_WORKSPACE_MENU_ITEMS
        .filter(isItemInWorkspace)
        .map((item) => ({
          id: item.id,
          title: item.title,
          titleTr: item.titleTr,
          url: item.url,
          category: item.category,
          workspace: item.workspace,
          score: 100,
          isExactMatch: true,
        }));

      startTransition(() => {
        setResults(defaultMatches);
        setGroupedResults(groupItems(defaultMatches));
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

        return activeTokens.every((token) => {
          if (searchableText.includes(token)) return true;
          // Basit kök eki temizleme (ör: 'raporlar' -> 'rapor')
          if (token.length > 4) {
            const stem = token.replace(/(larını|lerini|ları|leri|lar|ler|da|de|ta|te|ını|ini|nı|ni)$/, "");
            if (stem.length >= 3 && searchableText.includes(stem)) return true;
          }
          return false;
        });
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
      }));

    // Anlık eşleşmeleri ilk etapta göster
    startTransition(() => {
      setResults(exactMatches);
      setGroupedResults(groupItems(exactMatches));
    });

    // 2) Asenkron DuckDB WASM Vektör Semantik Arama (3-5 ms)
    let isCancelled = false;
    setIsSearchingRag(true);

    const timer = setTimeout(async () => {
      try {
        const startTime = performance.now();
        const ragItems = await searchVectorContext(query, 15);
        if (isCancelled) return;

        const vectorResults: WorkspaceSearchResultItem[] = [];
        const seenIds = new Set(exactMatches.map((m) => m.id));

        for (const ragItem of ragItems) {
          const meta = ragItem.metadata as {
            type?: string;
            title?: string;
            titleTr?: string;
            url?: string;
            category?: string;
            workspace?: string;
          };

          if (meta?.type === "menu_item" && meta.url) {
            const itemId = ragItem.id.replace(`menu_${workspace}_`, "");

            // Benzerlik skoru hesabı (Cosine distance)
            const distance = ragItem.distance ?? 0.5;
            const similarityScore = Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));

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
                });
              }
            }
          }
        }

        // Exact + Vector sonuçlarını birleştir ve skora göre sırala
        const merged = [...exactMatches, ...vectorResults].sort((a, b) => {
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
  }, [query, workspace]);

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
