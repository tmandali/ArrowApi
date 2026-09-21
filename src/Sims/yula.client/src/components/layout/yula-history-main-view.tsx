"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { History, MessageSquare, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { useChatsStore, type YulaConversation } from "@/lib/stores/chats";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { formatPathnameLabel, extractAgentIdFromPath } from "@/lib/workspace-paths";
import { navigateToConversationScreen } from "@/lib/yula-history-navigation";
import { groupConversationsByDate } from "./yula-history-group-utils";
import { YulaHistoryItem } from "./yula-history-item";

export function YulaHistoryMainView({ className }: { className?: string }) {
  const t = useTranslations("HistorySidebar");
  const tScreen = useTranslations("ScreenLabels");
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

  const screenLabel = formatPathnameLabel(currentPathname, (k) => tScreen(k)) || t("screen_placeholder");
  const mainStoreActiveAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const mainCurrentAgentId =
    extractAgentIdFromPath(currentPathname) ?? mainStoreActiveAgentId ?? null;

  const filteredSessions = React.useMemo(() => {
    let list = conversations.filter(
      (c) => (c.agentId ?? null) === (mainCurrentAgentId ?? null),
    );
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return list;
  }, [conversations, searchQuery, mainCurrentAgentId]);

  const grouped = React.useMemo(
    () => groupConversationsByDate(filteredSessions, (k) => t(k)),
    [filteredSessions, t]
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

  const handleSaveRename = (e: React.FormEvent | React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingTitle.trim()) {
      renameConversation(id, editingTitle);
    }
    setEditingId(null);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background/50 p-3 md:p-5 select-none animate-in fade-in-50 duration-150",
        className
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col">
        {/* Header Bar */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 pb-3 mb-2">
          <div className="flex items-center gap-2 shrink-0">
            <History className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t("header_title")}</h2>
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
              <span>{t("back_to_chat")}</span>
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
                  ? `"${searchQuery}" ${t("search_no_results").toLowerCase()}`
                  : `${screenLabel} ${t("search_no_conversations").toLowerCase()}`}
              </span>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((session) => (
                    <YulaHistoryItem
                      key={session.id}
                      session={session}
                      isActive={session.id === activeId}
                      isEditing={session.id === editingId}
                      editingTitle={editingTitle}
                      pathLabel={formatPathnameLabel(session.pathname, (k) => tScreen(k))}
                      paddingClassName="px-3 py-2"
                      onSelect={() => handleSelect(session.id, session)}
                      onStartRename={(e) => {
                        e.stopPropagation();
                        setEditingId(session.id);
                        setEditingTitle(session.title);
                      }}
                      onSaveRename={(e) => handleSaveRename(e, session.id)}
                      onCancelRename={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      onEditingTitleChange={setEditingTitle}
                      onDelete={(e) => {
                        e.stopPropagation();
                        deleteConversation(session.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 pt-3 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground/60">
          <span className="font-medium">{t("count_conversations", { count: filteredSessions.length })}</span>
          {confirmClear ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-destructive font-medium">{t("confirm_delete_all")}</span>
              <button
                type="button"
                onClick={() => {
                  clearAllConversations();
                  setConfirmClear(false);
                }}
                className="px-2 py-0.5 rounded bg-destructive/80 hover:bg-destructive text-destructive-foreground font-medium text-[10px] transition-colors"
              >
                {t("yes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2 py-0.5 rounded bg-muted hover:bg-accent text-[10px] font-medium transition-colors"
              >
                {t("no")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="hover:text-destructive transition-colors flex items-center gap-1 text-[10.5px] font-medium"
              title={t("clear_btn")}
            >
              <Trash2 className="size-3" />
              <span>{t("clear_btn")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
