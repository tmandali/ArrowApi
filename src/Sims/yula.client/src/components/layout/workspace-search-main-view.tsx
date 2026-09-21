"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Package,
  Loader2,
  X,
  MessagesSquare,
} from "lucide-react";
import { useWorkspaceSearch } from "@/context/workspace-search-context";
import { resolveCategoryLabel, useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks";
import {
  useWorkspaceRagSearch,
  type WorkspaceSearchResultGroup,
} from "@/hooks/use-workspace-rag-search";
import { usePinnedWorkspaceItems } from "@/hooks/use-pinned-workspace-items";
import { WORKSPACE_SEARCH_CONFIGS } from "@/lib/workspace-search-catalog";
import { useChatsStore } from "@/lib/stores/chats";
import { useYulaDockStore } from "@/lib/stores/dock";
import { cn } from "@/utils/cn";
import { SearchResultRow } from "./workspace-search-result-row";

export function WorkspaceSearchMainView({ className }: { className?: string }) {
  const t = useTranslations("SearchMainView");
  const tCat = useTranslations("SearchCats");
  const tRail = useTranslations("WorkspaceRail");
  const router = useRouter();
  const { setOpen, query, setQuery } = useWorkspaceSearch();
  const { workspace } = useWorkspaceSearchMeta();
  const { groupedResults, isSearching } = useWorkspaceRagSearch(query, workspace);
  const { isPinned, togglePin } = usePinnedWorkspaceItems(workspace);
  const config = WORKSPACE_SEARCH_CONFIGS[workspace] || WORKSPACE_SEARCH_CONFIGS.stock;

  // İki kolon: sol = menü/modül grupları, sağ = sohbet geçmişi. İkisi de aynı
  // sorguyla canlı filtrelenir (fast path senkron, RAG 100ms debounce ile eklenir).
  const menuGroups = React.useMemo(
    () =>
      groupedResults
        .map((group) => ({
          category: group.category,
          items: group.items.filter((item) => item.source !== "conversation"),
        }))
        .filter((group) => group.items.length > 0),
    [groupedResults]
  );

  const chatGroups = React.useMemo(
    () =>
      groupedResults
        .map((group) => ({
          category: group.category,
          items: group.items.filter((item) => item.source === "conversation"),
        }))
        .filter((group) => group.items.length > 0),
    [groupedResults]
  );

  const menuCount = menuGroups.reduce((count, group) => count + group.items.length, 0);
  const chatCount = chatGroups.reduce((count, group) => count + group.items.length, 0);

  // Klavye gezinme sırası görsel sırayı izler: sol kolon (menüler) → sağ kolon (sohbetler)
  const flatItems = React.useMemo(
    () => [...menuGroups, ...chatGroups].flatMap((group) => group.items),
    [menuGroups, chatGroups]
  );

  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [syncedFlatItems, setSyncedFlatItems] = React.useState(flatItems);
  if (syncedFlatItems !== flatItems) {
    setSyncedFlatItems(flatItems);
    setSelectedIndex(0);
  }
  const activeItemRef = React.useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");

  const handleStartRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (e: React.FormEvent | React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingTitle.trim()) {
      useChatsStore.getState().renameConversation(id, editingTitle);
    }
    setEditingId(null);
  };

  // Seçili öğeyi ekranda görünür tut
  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  const handleSelect = React.useCallback((url: string, conversationId?: string) => {
    setOpen(false);
    setQuery("");
    // Sohbet sonucuysa dock'ta o konuşmayı aktif et, sonra ekranına git
    if (conversationId) {
      const msgs = useChatsStore.getState().messagesById[conversationId] ?? [];
      console.info(
        `🤖 [Yula History Select] sohbet=${conversationId} · ${msgs.length} mesaj · hedef=${url}`,
      );
      useChatsStore.getState().selectConversation(conversationId);
      // Geçmiş/arama modunda kalmasın; hedef sayfada sohbet görünür olsun
      useChatsStore.setState({ isHistoryOpen: false, isSearchingHistory: false });
      // Hedef sayfada Yula paneli kapalıysa açılsın
      useYulaDockStore.getState().setOpen(true);
    }
    if (url && url !== "#") {
      router.push(url);
    }
  }, [router, setOpen, setQuery]);

  // Klavye yön tuşları (Yukarı, Aşağı), Enter ve Escape dinleyicisi
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Yeniden adlandırma düzenlemesi sırasında liste kısayolları kapalı
      if (editingId) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setQuery("");
        return;
      }

      if (flatItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = flatItems[selectedIndex];
        if (selected) {
          handleSelect(selected.url, selected.conversationId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatItems, selectedIndex, editingId, setOpen, setQuery, handleSelect]);

  const renderColumnGroups = (groups: WorkspaceSearchResultGroup[], showGroupHeader: boolean) =>
    groups.map((group) => (
      <div key={group.category} className="space-y-1">
        {showGroupHeader ? (
          <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            {resolveCategoryLabel(group.category, tCat)}
          </div>
        ) : null}
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const itemIndex = flatItems.findIndex((f) => f.id === item.id);
            return (
              <SearchResultRow
                key={item.id}
                item={item}
                isSelected={itemIndex === selectedIndex}
                activeRef={itemIndex === selectedIndex ? activeItemRef : undefined}
                query={query}
                itemIsPinned={isPinned(item.id)}
                isEditing={!!item.conversationId && item.conversationId === editingId}
                editingTitle={editingTitle}
                onEditingTitleChange={setEditingTitle}
                onStartRename={handleStartRename}
                onSaveRename={handleSaveRename}
                onCancelEdit={() => setEditingId(null)}
                onSelect={() => handleSelect(item.url, item.conversationId)}
                onHover={() => setSelectedIndex(itemIndex)}
                onTogglePin={(e) => {
                  e.stopPropagation();
                  togglePin({
                    id: item.id,
                    title: item.title,
                    titleTr: item.titleTr,
                    url: item.url,
                    category: item.category,
                    workspace: item.workspace,
                  });
                }}
              />
            );
          })}
        </div>
      </div>
    ));

  const isIdle = menuCount === 0 && chatCount === 0;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background/50 p-3 md:p-5 select-none animate-in fade-in-50 duration-150",
        className
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col">
        {/* Results Header Bar */}
        <div className="flex items-center justify-between px-2 pb-2 text-xs border-b border-border/40 mb-2 shrink-0">
          <span className="font-medium text-foreground/80 text-[11.5px] flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-amber-500" />
            <span
              className="rounded bg-muted/50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground/80"
              title={t("search_scope", {
                name: tRail.has(workspace) ? tRail(workspace) : config.name,
              })}
            >
              {tRail.has(workspace) ? tRail(workspace) : config.name}
            </span>
            {query.trim() ? (
              <span>{t("search_results", { query })} ({flatItems.length})</span>
            ) : (
              <span>{t("menu_chats")} ({flatItems.length})</span>
            )}
          </span>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer bg-transparent border-0 outline-none"
            title={t("close_search")}
          >
            <X className="size-3.5 text-muted-foreground/70 group-hover:text-foreground" />
            <kbd className="font-mono text-[9px] text-muted-foreground/70 bg-muted/60 px-1 py-0.5 rounded border-0 font-medium">
              ESC
            </kbd>
          </button>
        </div>

        {/* Results Body */}
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          {isSearching && flatItems.length === 0 ? (
            <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar">
              <div className="py-12 text-center text-xs text-muted-foreground/70 font-medium flex flex-col items-center justify-center gap-2">
                <Loader2 className="size-6 animate-spin text-amber-500/90" />
                <p>{t("results_loading")}</p>
              </div>
            </div>
          ) : isIdle ? (
            <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar">
              <div className="py-12 text-center text-xs text-muted-foreground/80 font-medium flex flex-col items-center justify-center gap-2.5">
                <Sparkles className="size-8 text-primary/40" />
                {query.trim() ? (
                  <p className="max-w-[340px] leading-relaxed text-[12.5px] text-foreground/80 text-center">
                    <span className="font-semibold text-foreground">"{query}"</span> {t("no_result_found", { query })}
                  </p>
                ) : (
                  <p className="max-w-[340px] leading-relaxed text-[12.5px] text-foreground/80 text-center">
                    {t("no_conversation_yet")}
                  </p>
                )}
                <p className="max-w-[360px] text-[11.5px] text-muted-foreground/75 leading-relaxed text-center">
                  {t("search_hint")} {t("examples_sentence", {
                    examples: config.examples.map((ex) => `"${ex}"`).join(", "),
                    menus: t("menus_label"),
                    chats: t("chats_label"),
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden md:grid-cols-2">
              {/* Sol kolon: Menüler / Modüller */}
              <section className="flex min-h-0 flex-col overflow-hidden rounded-md">
                <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Package className="size-3" />
                    {t("menus_label")}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/50">{menuCount}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-1 no-scrollbar">
                  {menuGroups.length === 0 ? (
                    <div className="py-10 text-center text-[11px] text-muted-foreground/60">
                      {t("no_modules")}
                    </div>
                  ) : (
                    renderColumnGroups(menuGroups, true)
                  )}
                </div>
              </section>

              {/* Sağ kolon: Sohbet Geçmişi */}
              <section className="flex min-h-0 flex-col overflow-hidden rounded-md">
                <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <MessagesSquare className="size-3" />
                    {t("chats_label")}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/50">{chatCount}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-1 no-scrollbar">
                  {chatGroups.length === 0 ? (
                    <div className="py-10 text-center text-[11px] text-muted-foreground/60">
                      {query.trim() ? t("no_chats_found") : t("no_chats_yet")}
                    </div>
                  ) : (
                    renderColumnGroups(chatGroups, false)
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
