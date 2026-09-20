"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  History,
  ListFilter,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useChatsStore, type YulaConversation } from "@/lib/stores/chats";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { workspaceLabelFromPath } from "@/lib/workspace-paths";
import { restoreConversationExecution } from "@/lib/yula-history-navigation";
import { formatTimeAgo } from "./time-ago";
import { YULA } from "@/components/layout/yula-brand-data";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome";

export interface YulaIdeSidebarProps {
  className?: string;
  onNewChat?: () => void;
  onSelectConversation?: (id: string) => void;
}

export function YulaIdeSidebar({
  className,
  onNewChat,
  onSelectConversation,
}: YulaIdeSidebarProps) {
  const t = useTranslations("IdeOverlay");
  const router = useRouter();

  const conversations = useChatsStore((s) => s.conversations);
  const activeId = useChatsStore((s) => s.activeId);
  const selectConversation = useChatsStore((s) => s.selectConversation);
  const deleteConversation = useChatsStore((s) => s.deleteConversation);
  const deleteConversations = useChatsStore((s) => s.deleteConversations);
  const {
    newConversation,
    deleteConversation: chatDeleteConversation,
    deleteConversations: chatDeleteConversations,
  } = useOptionalYulaChat() ?? {};

  const [confirmDeleteGroup, setConfirmDeleteGroup] = React.useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = React.useState<
    Record<string, boolean>
  >({ Yula: true });
  const [showAllPerGroup, setShowAllPerGroup] = React.useState<
    Record<string, boolean>
  >({});

  // Group conversations by workspace name
  const workspaceGroups = React.useMemo(() => {
    const groupsMap: Record<string, YulaConversation[]> = {};

    const sorted = [...conversations].sort((a, b) => b.createdAt - a.createdAt);

    for (const conv of sorted) {
      const rawLabel = (conv.pathname ? workspaceLabelFromPath(conv.pathname) : null) || "Yula";
      const groupName = rawLabel.trim() ? rawLabel : "Yula";
      if (!groupsMap[groupName]) {
        groupsMap[groupName] = [];
      }
      groupsMap[groupName].push(conv);
    }

    // Ensure "Yula" is first if it exists
    const groupNames = Object.keys(groupsMap).sort((a, b) => {
      if (a === "Yula") return -1;
      if (b === "Yula") return 1;
      return a.localeCompare(b);
    });

    return groupNames.map((name) => ({
      name,
      items: groupsMap[name],
    }));
  }, [conversations]);

  const toggleGroup = React.useCallback((name: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [name]: prev[name] === undefined ? false : !prev[name],
    }));
  }, []);

  const toggleShowAll = React.useCallback((name: string) => {
    setShowAllPerGroup((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  }, []);

  const handleNewConversation = React.useCallback(() => {
    newConversation?.();
    onNewChat?.();
  }, [newConversation, onNewChat]);

  const handleSelect = React.useCallback(
    (session: YulaConversation) => {
      selectConversation(session.id);
      restoreConversationExecution(
        session,
        useChatsStore.getState().messagesById[session.id],
      );
      onSelectConversation?.(session.id);
    },
    [selectConversation, onSelectConversation],
  );

  const handleDelete = React.useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (chatDeleteConversation) {
        chatDeleteConversation(id);
      } else {
        deleteConversation(id);
      }
    },
    [chatDeleteConversation, deleteConversation],
  );

  const handleDeleteGroup = React.useCallback(
    (group: { name: string; items: YulaConversation[] }) => {
      const ids = group.items.map((c) => c.id);
      if (ids.length === 0) return;
      if (chatDeleteConversations) {
        chatDeleteConversations(ids);
      } else {
        deleteConversations(ids);
      }
    },
    [chatDeleteConversations, deleteConversations],
  );

  return (
    <aside
      className={cn(
        panelCardClass,
        "h-full w-full select-none text-[12px]",
        className,
      )}
    >
      {/* Sidebar Header Bar (aligned with Column 2 & 3 headers) */}
      <div className={cn(panelHeaderClass, "bg-card")}>
        <div className="flex items-center gap-2">
          <YulaMarkIcon className="size-4" />
          <span className={panelHeaderTitleClass}>{YULA.name}</span>
        </div>
      </div>

      {/* Primary Action: + New Conversation Button */}
      <div className="px-3 py-2">
        <button
          type="button"
          data-ide-action="true"
          onClick={handleNewConversation}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors shadow-2xs cursor-pointer"
        >
          <Plus className="size-3.5 text-muted-foreground" />
          <span>{t("new_conversation")}</span>
        </button>
      </div>

      {/* Navigation Quick Links */}
      <div className="space-y-0.5 px-3 py-1 text-muted-foreground">
        <button
          type="button"
          data-nav="screen"
          onClick={() => router.push("/my/history")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <History className="size-3.5" />
          <span>{t("conversation_history")}</span>
        </button>
        <button
          type="button"
          data-nav="screen"
          onClick={() => router.push("/system/jobs")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <Clock className="size-3.5" />
          <span>{t("scheduled_tasks")}</span>
        </button>
      </div>

      {/* Workspaces Section Header */}
      <div className="mt-2 flex items-center justify-between px-4 py-1 text-[11px] font-medium text-muted-foreground">
        <span>{t("workspaces_header")}</span>
        <div className="flex items-center gap-1">
          <ListFilter className="size-3 text-muted-foreground/60" />
        </div>
      </div>

      {/* Workspaces Tree List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 overscroll-contain">
        {workspaceGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground/60">
            <MessageSquare className="size-6 text-muted-foreground/30 mb-1" />
            <span>{t("no_conversations_yet")}</span>
          </div>
        ) : (
          workspaceGroups.map((group) => {
            const isExpanded = expandedGroups[group.name] ?? true;
            const showAll = showAllPerGroup[group.name] ?? false;
            const visibleItems = showAll ? group.items : group.items.slice(0, 5);
            const hasMore = group.items.length > 5;

            return (
              <div key={group.name} className="space-y-0.5">
                {/* Workspace Folder Row */}
                <div className="group/folder flex w-full items-center justify-between gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                  <button
                    type="button"
                    data-slot="ide-folder-toggle"
                    onClick={() => toggleGroup(group.name)}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3 text-muted-foreground/60 shrink-0" />
                    ) : (
                      <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />
                    )}
                    {isExpanded ? (
                      <FolderOpen className="size-3.5 text-amber-500/80 shrink-0" />
                    ) : (
                      <Folder className="size-3.5 text-amber-500/80 shrink-0" />
                    )}
                    <span className="truncate">{group.name}</span>
                    <span className="text-[10px] text-muted-foreground/50 font-normal">
                      ({group.items.length})
                    </span>
                  </button>

                  {confirmDeleteGroup === group.name ? (
                    <div className="flex items-center gap-1 shrink-0 animate-in fade-in-50 duration-100">
                      <span className="text-[10px] text-destructive font-medium">
                        {t("confirm_clear_ask")}
                      </span>
                      <button
                        type="button"
                        data-ide-action="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group);
                          setConfirmDeleteGroup(null);
                        }}
                        className="px-1.5 py-0.5 rounded bg-destructive/80 hover:bg-destructive text-destructive-foreground font-medium text-[10px] transition-colors cursor-pointer"
                      >
                        {t("confirm_yes")}
                      </button>
                      <button
                        type="button"
                        data-ide-action="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteGroup(null);
                        }}
                        className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        {t("confirm_no")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-ide-action="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteGroup(group.name);
                      }}
                      title={t("delete_folder")}
                      aria-label={t("delete_folder")}
                      className="hidden group-hover/folder:flex group-focus-within/folder:flex size-4 items-center justify-center rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 focus-visible:text-destructive focus-visible:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>

                {/* Group Conversation Items */}
                {isExpanded ? (
                  <div className="space-y-0.5 pl-3">
                    {visibleItems.map((conv) => {
                      const isActive = conv.id === activeId;
                      const timeAgo = formatTimeAgo(conv.createdAt);

                      return (
                        <div
                          key={conv.id}
                          role="button"
                          tabIndex={0}
                          data-slot="ide-conversation-item"
                          onClick={() => handleSelect(conv)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelect(conv);
                            }
                          }}
                          className={cn(
                            "group flex w-full items-center justify-between gap-1.5 rounded-md px-2.5 py-1 text-xs text-left transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            isActive
                              ? "bg-background font-medium text-foreground shadow-2xs border border-border/40"
                              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                          )}
                        >
                          <span className="truncate flex-1 min-w-0">
                            {conv.title || "Untitled Session"}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground/60 group-hover:hidden group-focus-within:hidden">
                              {timeAgo}
                            </span>
                            <button
                              type="button"
                              data-ide-action="true"
                              onClick={(e) => handleDelete(e, conv.id)}
                              title={t("delete_conversation")}
                              aria-label={t("delete_conversation")}
                              className="hidden group-hover:flex group-focus-within:flex size-4 items-center justify-center rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 focus-visible:text-destructive focus-visible:bg-destructive/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {hasMore ? (
                      <button
                        type="button"
                        data-ide-action="true"
                        onClick={() => toggleShowAll(group.name)}
                        className="w-full text-left px-2.5 py-0.5 text-[11px] text-muted-foreground/70 hover:text-foreground cursor-pointer transition-colors"
                      >
                        {showAll
                          ? "Show less"
                          : t("see_all", { count: group.items.length })}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Pinned Footer: Settings */}
      <div className="mt-auto border-t border-border px-3 py-2">
        <Link
          href="/my/settings"
          data-nav="screen"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        >
          <Settings className="size-3.5" />
          <span>{t("settings")}</span>
        </Link>
      </div>
    </aside>
  );
}
