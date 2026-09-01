"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Package,
  Receipt,
  BarChart2,
  Settings,
  Scale,
  Wrench,
  Loader2,
  Pin,
  Pencil,
  Check,
  Trash2,
  X,
  MessagesSquare,
} from "lucide-react";
import { useWorkspaceSearch } from "@/context/workspace-search-context";
import { useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks";
import { useWorkspaceRagSearch } from "@/hooks/use-workspace-rag-search";
import { usePinnedWorkspaceItems } from "@/hooks/use-pinned-workspace-items";
import { WORKSPACE_SEARCH_CONFIGS } from "@/features/stock/lib/stock-menu-registry";
import { useChatsStore } from "@/lib/stores/chats";
import { useYulaDockStore } from "@/lib/stores/dock";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

function getCategoryIcon(category: string, isRag = false) {
  if (isRag) {
    return <Sparkles className="size-3.5 shrink-0 text-amber-500/90 group-hover:text-amber-600 dark:text-amber-400" />;
  }
  switch (category) {
    case "Sohbet Geçmişi":
      return <MessagesSquare className="size-3.5 shrink-0 text-sky-500/80 group-hover:text-sky-600 dark:text-sky-400" />;
    case "Katalog":
      return <Package className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "İşlemler":
      return <Receipt className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Raporlar":
      return <BarChart2 className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Ayarlar":
      return <Settings className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Seri & Parti":
      return <Scale className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Araçlar":
      return <Wrench className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    default:
      return <Package className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
  }
}

export function WorkspaceSearchMainView({ className }: { className?: string }) {
  const router = useRouter();
  const { setOpen, query, setQuery } = useWorkspaceSearch();
  const { workspace } = useWorkspaceSearchMeta();
  const { groupedResults, isSearching } = useWorkspaceRagSearch(query, workspace);
  const { isPinned, togglePin } = usePinnedWorkspaceItems(workspace);
  const config = WORKSPACE_SEARCH_CONFIGS[workspace] || WORKSPACE_SEARCH_CONFIGS.stock;

  const flatItems = React.useMemo(() => {
    return groupedResults.flatMap((g) => g.items);
  }, [groupedResults]);

  const [selectedIndex, setSelectedIndex] = React.useState(0);
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

  // Arama sonuçları geliştikçe seçili indeksi başa sıfırla
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [flatItems]);

  // Seçili öğeyi ekranda görünür tut
  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  const handleSelect = (url: string, conversationId?: string) => {
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
  };

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
  }, [flatItems, selectedIndex, editingId]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background/50 p-3 md:p-5 select-none animate-in fade-in-50 duration-150",
        className
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col">
        {/* Results Header Bar */}
        <div className="flex items-center justify-between px-2 pb-2 text-xs border-b border-border/40 mb-2 shrink-0">
          <span className="font-medium text-foreground/80 text-[11.5px] flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-amber-500" />
            {query.trim() ? (
              <span>"{query}" Sonuçları ({flatItems.length})</span>
            ) : (
              <span>Son Yazışmalar ({flatItems.length})</span>
            )}
          </span>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer bg-transparent border-0 outline-none"
            title="Aramayı Kapat (ESC)"
          >
            <X className="size-3.5 text-muted-foreground/70 group-hover:text-foreground" />
            <kbd className="font-mono text-[9px] text-muted-foreground/70 bg-muted/60 px-1 py-0.5 rounded border-0 font-medium">
              ESC
            </kbd>
          </button>
        </div>

        {/* Results Body Area */}
        <div className="flex-1 overflow-y-auto min-h-0 p-1 space-y-3 overscroll-contain no-scrollbar">
          {isSearching ? (
            <div className="py-12 text-center text-xs text-muted-foreground/70 font-medium flex flex-col items-center justify-center gap-2">
              <Loader2 className="size-6 animate-spin text-amber-500/90" />
              <p>Sonuçlar getiriliyor...</p>
            </div>
          ) : groupedResults.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground/80 font-medium flex flex-col items-center justify-center gap-2.5">
              <Sparkles className="size-8 text-primary/40" />
              {query.trim() ? (
                <p className="max-w-[340px] leading-relaxed text-[12.5px] text-foreground/80 text-center">
                  <span className="font-semibold text-foreground">"{query}"</span> için uygun bir modül veya yazışma bulunamadı.
                </p>
              ) : (
                <p className="max-w-[340px] leading-relaxed text-[12.5px] text-foreground/80 text-center">
                  Henüz bir yazışma bulunmuyor. Yula ile sohbet başlattığınızda yazışmalarınız burada listelenir.
                </p>
              )}
              <p className="max-w-[360px] text-[11.5px] text-muted-foreground/75 leading-relaxed text-center">
                Yazdığınızda modül, rapor ve sohbet geçmişinde arama yapılır; tam hatırlamıyorsanız yapmak istediğiniz işi tarif edin (ör:{" "}
                {config.examples.map((ex, i) => (
                  <React.Fragment key={ex}>
                    {i > 0 ? ", " : ""}
                    <span className="text-primary font-medium">"{ex}"</span>
                  </React.Fragment>
                ))}). Sohbet eşleşmeleri <span className="text-sky-500 font-medium">Sohbet Geçmişi</span> grubunda listelenir.
              </p>
            </div>
          ) : (
            groupedResults.map((group) => (
              <div key={group.category} className="space-y-1">
                <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group.category}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const itemIndex = flatItems.findIndex((f) => f.id === item.id);
                    const isSelected = itemIndex === selectedIndex;
                    const itemIsPinned = isPinned(item.id);
                    const isEditingConv =
                      item.source === "conversation" &&
                      !!item.conversationId &&
                      item.conversationId === editingId;

                    return (
                      <div
                        key={item.id}
                        ref={isSelected ? activeItemRef : null}
                        onClick={() => {
                          if (!isEditingConv) handleSelect(item.url, item.conversationId);
                        }}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={cn(
                          "group relative flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all cursor-pointer border-0",
                          isSelected
                            ? "bg-primary/10 text-primary font-medium dark:bg-primary/15 ring-1 ring-primary/30"
                            : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {isEditingConv ? (
                          <form
                            onSubmit={(e) => handleSaveRename(e, item.conversationId!)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-1 items-center gap-1 min-w-0"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="flex-1 rounded border border-primary/40 bg-background px-2 py-0.5 text-xs outline-none text-foreground"
                            />
                            <button
                              type="submit"
                              onClick={(e) => handleSaveRename(e, item.conversationId!)}
                              className="p-1 rounded text-primary hover:bg-muted transition-colors"
                              title="Kaydet"
                            >
                              <Check className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(null);
                              }}
                              className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                              title="İptal"
                            >
                              <X className="size-3" />
                            </button>
                          </form>
                        ) : (
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {getCategoryIcon(item.category, !item.isExactMatch)}
                          <span className="truncate text-xs leading-tight font-normal text-foreground/90 group-hover:text-foreground">
                            {item.title}
                          </span>
                          {item.titleTr && item.titleTr !== item.title ? (
                            <span className="text-[10px] text-muted-foreground/50 truncate font-normal">
                              [{item.titleTr}]
                            </span>
                          ) : null}
                        </div>
                        )}

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {item.source === "conversation" && item.conversationId ? (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <button
                                type="button"
                                title="Yeniden Adlandır"
                                aria-label="Yeniden Adlandır"
                                onClick={(e) =>
                                  handleStartRename(e, item.conversationId!, item.title)
                                }
                                className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-foreground transition-colors"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                type="button"
                                title="Yazışmayı Sil"
                                aria-label="Yazışmayı Sil"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.conversationId) {
                                    useChatsStore.getState().deleteConversation(item.conversationId);
                                  }
                                }}
                                className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-destructive transition-colors"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          ) : null}

                          {query.trim() && item.isExactMatch ? (
                            <span className="text-[10px] text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded font-normal">
                              {item.category}
                            </span>
                          ) : query.trim() && !item.isExactMatch ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/25 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[9px] px-1.5 py-0.5 font-medium rounded-md flex items-center gap-1"
                            >
                              <Sparkles className="size-2.5" /> %{item.score} Eşleşme
                            </Badge>
                          ) : null}

                          {item.source === "conversation" ? null : (
                            <button
                              type="button"
                              title={itemIsPinned ? "İğneyi Kaldır" : "Ana Ekrana İğnele"}
                              onClick={(e) => {
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
                              className={cn(
                                "rounded p-1 bg-transparent border-0 outline-none transition-all cursor-pointer",
                                itemIsPinned
                                  ? "text-amber-500 opacity-100 hover:text-amber-600"
                                  : "opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-amber-500"
                              )}
                            >
                              <Pin className={cn("size-3", itemIsPinned && "fill-amber-500/40 text-amber-500")} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
