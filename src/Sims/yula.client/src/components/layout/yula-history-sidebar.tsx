"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquare, Search, Trash2, X } from "lucide-react";
import { useChatsStore } from "@/lib/stores/chats";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { isConversationVisibleForAgent, formatPathnameLabel, extractAgentIdFromPath } from "@/lib/workspace-paths";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { navigateToConversationScreen } from "@/lib/yula-history-navigation";
import { cn } from "@/utils/cn";
import { groupConversationsByDate } from "./yula-history-group-utils";
import { YulaHistoryItem } from "./yula-history-item";

export { YulaHistoryMainView } from "./yula-history-main-view";

export interface YulaHistorySidebarProps {
  className?: string;
  onSelectConversation?: () => void;
}

export function YulaHistorySidebar({
  className,
  onSelectConversation,
}: YulaHistorySidebarProps) {
  const t = useTranslations("HistorySidebar");
  const tScreen = useTranslations("ScreenLabels");
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

  const screenLabel = formatPathnameLabel(currentPathname, (k) => tScreen(k)) || t("screen_placeholder");
  const storeActiveAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const currentAgentId = extractAgentIdFromPath(currentPathname) ?? storeActiveAgentId ?? null;

  const filteredSessions = React.useMemo(() => {
    let list = conversations.filter((c) =>
      isConversationVisibleForAgent(c, currentPathname, currentAgentId),
    );
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return list;
  }, [conversations, currentPathname, currentAgentId, searchQuery]);

  const grouped = React.useMemo(
    () => groupConversationsByDate(filteredSessions, (k) => t(k)),
    [filteredSessions, t]
  );

  const handleSaveRename = (e: React.FormEvent | React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingTitle.trim()) {
      renameConversation(id, editingTitle);
    }
    setEditingId(null);
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
            placeholder={t("search_ph")}
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
                ? t("search_no_results")
                : t("search_no_conversations", { screenLabel })}
            </p>
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
                    paddingClassName="px-2.5 py-1.5"
                    onSelect={() => {
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
                    }}
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
      <div className="shrink-0 p-2.5 flex items-center justify-between text-[11px] text-muted-foreground/60 bg-transparent border-t border-border/30">
        <span className="font-medium">{t("count_conversations", { count: filteredSessions.length })}</span>
        {confirmClear ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-destructive font-medium">{t("confirm_clear_ask")}</span>
            <button
              type="button"
              onClick={() => {
                clearAllConversations();
                setConfirmClear(false);
              }}
              className="px-1.5 py-0.5 rounded bg-destructive/80 hover:bg-destructive text-destructive-foreground font-medium text-[10px] transition-colors"
            >
              {t("confirm_yes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-[10px] font-medium transition-colors"
            >
              {t("confirm_no")}
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
  );
}
