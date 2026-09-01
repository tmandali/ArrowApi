"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChatsStore, type YulaConversation } from "@/lib/stores/chats";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { isConversationOnScreen, formatPathnameLabel } from "@/lib/workspace-paths";
import { navigateToConversationScreen } from "@/lib/yula-history-navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  MessageSquare,
  Search,
  Trash2,
  Check,
  X,
  Pencil,
  Sparkles,
  History,
} from "lucide-react";

export interface YulaHistorySidebarProps {
  className?: string;
  onSelectConversation?: () => void;
}

function groupConversationsByDate(items: YulaConversation[]) {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterdayStart = todayStart - 86400000;
  const lastWeekStart = todayStart - 7 * 86400000;

  const today: YulaConversation[] = [];
  const yesterday: YulaConversation[] = [];
  const lastWeek: YulaConversation[] = [];
  const older: YulaConversation[] = [];

  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);

  for (const item of sorted) {
    if (item.createdAt >= todayStart) {
      today.push(item);
    } else if (item.createdAt >= yesterdayStart) {
      yesterday.push(item);
    } else if (item.createdAt >= lastWeekStart) {
      lastWeek.push(item);
    } else {
      older.push(item);
    }
  }

  return [
    { label: "Bugün", items: today },
    { label: "Dün", items: yesterday },
    { label: "Geçen Hafta", items: lastWeek },
    { label: "Daha Eski", items: older },
  ].filter((group) => group.items.length > 0);
}

export function YulaHistorySidebar({
  className,
  onSelectConversation,
}: YulaHistorySidebarProps) {
  const router = useRouter();
  const currentPathname = usePathname();
  const { setOpen } = useWorkspaceAiChat();
  const conversations = useChatsStore((s) => s.conversations);
  const activeId = useChatsStore((s) => s.activeId);
  const setHistoryOpen = useChatsStore((s) => s.setHistoryOpen);
  const selectConversation = useChatsStore((s) => s.selectConversation);
  const deleteConversation = useChatsStore((s) => s.deleteConversation);
  const renameConversation = useChatsStore((s) => s.renameConversation);
  const clearAllConversations = useChatsStore((s) => s.clearAllConversations);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [confirmClear, setConfirmClear] = React.useState(false);

  const screenLabel = formatPathnameLabel(currentPathname) || "Bu Ekran";

  const filteredSessions = React.useMemo(() => {
    let list = conversations.filter((c) => isConversationOnScreen(c.pathname, currentPathname));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return list;
  }, [conversations, currentPathname, searchQuery]);

  const grouped = React.useMemo(
    () => groupConversationsByDate(filteredSessions),
    [filteredSessions]
  );

  const handleStartRename = (
    e: React.MouseEvent,
    id: string,
    currentTitle: string
  ) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (e: React.FormEvent | React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingTitle.trim()) {
      renameConversation(id, editingTitle);
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full shrink-0 flex-col bg-transparent select-none",
        className
      )}
    >
      {/* Header: Search Box */}
      <div className="flex shrink-0 items-center p-3 pb-1 bg-transparent">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ekran sohbetlerinde ara..."
            className="w-full rounded-lg border-0 bg-muted/40 py-1.5 pl-8 pr-2.5 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:bg-muted/60 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      {/* History Session Groups */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-3 overscroll-contain no-scrollbar">
        {grouped.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground/70 font-medium flex flex-col items-center justify-center gap-2">
            <MessageSquare className="size-7 text-muted-foreground/30" />
            <p className="max-w-[200px]">
              {searchQuery
                ? "Aramayla eşleşen sohbet bulunamadı."
                : `${screenLabel} ekranına ait henüz bir yazışma bulunmuyor.`}
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((session) => {
                  const isActive = session.id === activeId;
                  const isEditing = session.id === editingId;
                  const pathLabel = formatPathnameLabel(session.pathname);

                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        if (!isEditing) {
                          selectConversation(session.id);
                          navigateToConversationScreen(
                            session,
                            (href) => {
                              router.push(href);
                            },
                            useChatsStore.getState().messagesById[session.id],
                          );
                          setOpen(true);
                          setHistoryOpen(false);
                          onSelectConversation?.();
                        }
                      }}
                      className={cn(
                        "group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer border-0",
                        isActive
                          ? "bg-primary/10 text-primary dark:bg-primary/15 font-medium"
                          : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
                      )}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => handleSaveRename(e, session.id)}
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
                            className="flex-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-xs outline-none text-foreground"
                          />
                          <button
                            type="submit"
                            onClick={(e) => handleSaveRename(e, session.id)}
                            className="p-1 rounded text-primary hover:bg-muted transition-colors"
                            title="Kaydet"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                            title="İptal"
                          >
                            <X className="size-3.5" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                            {isActive ? (
                              <Sparkles className="size-3.5 shrink-0 text-primary/80" />
                            ) : (
                              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                            )}
                            <span className="truncate text-[11.5px] leading-tight font-normal flex-1">
                              {session.title}
                            </span>
                            {pathLabel ? (
                              <span
                                className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground/70"
                                title={session.pathname}
                              >
                                {pathLabel}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <button
                              type="button"
                              onClick={(e) =>
                                handleStartRename(e, session.id, session.title)
                              }
                              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-foreground transition-colors"
                              title="Yeniden adlandır"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(e, session.id)}
                              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-destructive transition-colors"
                              title="Sohbeti sil"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 p-2.5 flex items-center justify-between text-[11px] text-muted-foreground/60 bg-transparent border-t border-border/30">
        <span className="font-medium">{filteredSessions.length} sohbet</span>
        {confirmClear ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-destructive font-medium">Emin misiniz?</span>
            <button
              type="button"
              onClick={() => {
                clearAllConversations();
                setConfirmClear(false);
              }}
              className="px-1.5 py-0.5 rounded bg-destructive/80 hover:bg-destructive text-destructive-foreground font-medium text-[10px] transition-colors"
            >
              Evet
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-[10px] font-medium transition-colors"
            >
              Hayır
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="hover:text-destructive transition-colors flex items-center gap-1 text-[10.5px] font-medium"
            title="Tüm sohbet geçmişini temizle"
          >
            <Trash2 className="size-3" />
            <span>Temizle</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function YulaHistoryMainView({ className }: { className?: string }) {
  const router = useRouter();
  const currentPathname = usePathname();
  const { setOpen } = useWorkspaceAiChat();
  const conversations = useChatsStore((s) => s.conversations);
  const activeId = useChatsStore((s) => s.activeId);
  const searchQuery = useChatsStore((s) => s.searchQuery);
  const setSearchingHistory = useChatsStore((s) => s.setSearchingHistory);
  const setHistoryOpen = useChatsStore((s) => s.setHistoryOpen);
  const selectConversation = useChatsStore((s) => s.selectConversation);
  const deleteConversation = useChatsStore((s) => s.deleteConversation);
  const renameConversation = useChatsStore((s) => s.renameConversation);
  const clearAllConversations = useChatsStore((s) => s.clearAllConversations);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [confirmClear, setConfirmClear] = React.useState(false);

  const screenLabel = formatPathnameLabel(currentPathname) || "Bu Ekran";

  // Main modda TÜM sohbet geçmişi listelenir
  const filteredSessions = React.useMemo(() => {
    let list = conversations;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return list;
  }, [conversations, searchQuery]);

  const grouped = React.useMemo(
    () => groupConversationsByDate(filteredSessions),
    [filteredSessions]
  );

  const handleSelect = (id: string, target?: YulaConversation) => {
    selectConversation(id);
    const session =
      target ?? useChatsStore.getState().conversations.find((c) => c.id === id);
    if (session) {
      console.info(
        `🤖 [Yula History Select] sohbet=${session.id} · ${(useChatsStore.getState().messagesById[session.id] ?? []).length} mesaj · hedef=${session.pathname}`,
      );
      navigateToConversationScreen(
        session,
        (href) => {
          router.push(href);
        },
        useChatsStore.getState().messagesById[id],
      );
    }
    setOpen(true);
    setSearchingHistory(false);
    setHistoryOpen(false);
  };

  const handleStartRename = (
    e: React.MouseEvent,
    id: string,
    currentTitle: string
  ) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (e: React.FormEvent | React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingTitle.trim()) {
      renameConversation(id, editingTitle);
    }
    setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background/50 p-3 md:p-5 select-none animate-in fade-in-50 duration-150",
        className
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col">
        {/* Header Bar — arama girişi header'daki YulaHeaderSearch'te (aynı searchQuery store'u) */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 pb-3 mb-2">
          <div className="flex items-center gap-2 shrink-0">
            <History className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Sohbet Geçmişi</h2>
            <span className="text-xs font-medium text-muted-foreground/60">({filteredSessions.length})</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchingHistory(false);
                setHistoryOpen(false);
              }}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
            >
              <X className="size-3.5" />
              <span>Yazışmaya Dön</span>
            </Button>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 overscroll-contain">
          {grouped.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground/70 font-medium flex flex-col items-center justify-center gap-2">
              <MessageSquare className="size-8 text-muted-foreground/30" />
              <span>
                {searchQuery
                  ? `"${searchQuery}" aramasıyla eşleşen sohbet bulunamadı.`
                  : `${screenLabel} ekranına ait henüz bir yazışma bulunmuyor.`}
              </span>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((session) => {
                    const isActive = session.id === activeId;
                    const isEditing = session.id === editingId;
                    const pathLabel = formatPathnameLabel(session.pathname);

                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          if (!isEditing) handleSelect(session.id, session);
                        }}
                        className={cn(
                          "group relative flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer border-0",
                          isActive
                            ? "bg-primary/10 text-primary dark:bg-primary/15 font-medium"
                            : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {isEditing ? (
                          <form
                            onSubmit={(e) => handleSaveRename(e, session.id)}
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
                              onClick={(e) => handleSaveRename(e, session.id)}
                              className="p-1 rounded text-primary hover:bg-muted transition-colors"
                              title="Kaydet"
                            >
                              <Check className="size-3.5" />
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
                              <X className="size-3.5" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5 truncate min-w-0 flex-1">
                              {isActive ? (
                                <Sparkles className="size-3.5 shrink-0 text-primary/80" />
                              ) : (
                                <MessageSquare className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                              )}
                              <span className="truncate text-xs font-normal flex-1">
                                {session.title}
                              </span>
                              {pathLabel ? (
                                <span
                                  className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground/70"
                                  title={session.pathname}
                                >
                                  {pathLabel}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleStartRename(e, session.id, session.title)
                                }
                                className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-foreground transition-colors"
                                title="Yeniden adlandır"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDelete(e, session.id)}
                                className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-destructive transition-colors"
                                title="Sohbeti sil"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 pt-3 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground/60">
          <span className="font-medium">{filteredSessions.length} sohbet</span>
          {confirmClear ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-destructive font-medium">Tümü silinsin mi?</span>
              <button
                type="button"
                onClick={() => {
                  clearAllConversations();
                  setConfirmClear(false);
                }}
                className="px-2 py-0.5 rounded bg-destructive/80 hover:bg-destructive text-destructive-foreground font-medium text-[10px] transition-colors"
              >
                Evet
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2 py-0.5 rounded bg-muted hover:bg-accent text-[10px] font-medium transition-colors"
              >
                Hayır
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="hover:text-destructive transition-colors flex items-center gap-1 text-[10.5px] font-medium"
              title="Tüm sohbet geçmişini temizle"
            >
              <Trash2 className="size-3" />
              <span>Geçmişi Temizle</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
