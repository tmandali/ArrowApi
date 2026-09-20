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
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useChatsStore, type YulaConversation } from "@/lib/stores/chats";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { workspaceLabelFromPath } from "@/lib/workspace-paths";
import { navigateToConversationScreen } from "@/lib/yula-history-navigation";
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
  const { newConversation } = useOptionalYulaChat() ?? {};

  const [expandedGroups, setExpandedGroups] = React.useState<
    Record<string, boolean>
  >({ Yula: true });
  const [showAllPerGroup, setShowAllPerGroup] = React.useState<
    Record<string, boolean>
  >({});

  // Group conversations by workspace name
  const projectGroups = React.useMemo(() => {
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
      navigateToConversationScreen(
        session,
        (href) => router.push(href),
        useChatsStore.getState().messagesById[session.id],
      );
      onSelectConversation?.(session.id);
    },
    [selectConversation, router, onSelectConversation],
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
          onClick={() => router.push("/my/history")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <History className="size-3.5" />
          <span>{t("conversation_history")}</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/system/jobs")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <Clock className="size-3.5" />
          <span>{t("scheduled_tasks")}</span>
        </button>
      </div>

      {/* Projects Section Header */}
      <div className="mt-2 flex items-center justify-between px-4 py-1 text-[11px] font-medium text-muted-foreground">
        <span>{t("projects_header")}</span>
        <div className="flex items-center gap-1">
          <ListFilter className="size-3 text-muted-foreground/60" />
        </div>
      </div>

      {/* Projects Tree List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 overscroll-contain">
        {projectGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground/60">
            <MessageSquare className="size-6 text-muted-foreground/30 mb-1" />
            <span>{t("no_conversations_yet")}</span>
          </div>
        ) : (
          projectGroups.map((group) => {
            const isExpanded = expandedGroups[group.name] ?? true;
            const showAll = showAllPerGroup[group.name] ?? false;
            const visibleItems = showAll ? group.items : group.items.slice(0, 5);
            const hasMore = group.items.length > 5;

            return (
              <div key={group.name} className="space-y-0.5">
                {/* Project Folder Row */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.name)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3 text-muted-foreground/60" />
                  ) : (
                    <ChevronRight className="size-3 text-muted-foreground/60" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="size-3.5 text-amber-500/80" />
                  ) : (
                    <Folder className="size-3.5 text-amber-500/80" />
                  )}
                  <span className="truncate">{group.name}</span>
                </button>

                {/* Group Conversation Items */}
                {isExpanded ? (
                  <div className="space-y-0.5 pl-3">
                    {visibleItems.map((conv) => {
                      const isActive = conv.id === activeId;
                      const timeAgo = formatTimeAgo(conv.createdAt);

                      return (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => handleSelect(conv)}
                          className={cn(
                            "flex w-full items-center justify-between gap-1.5 rounded-md px-2.5 py-1 text-xs text-left transition-colors cursor-pointer group",
                            isActive
                              ? "bg-background font-medium text-foreground shadow-2xs border border-border/40"
                              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                          )}
                        >
                          <span className="truncate flex-1">
                            {conv.title || "Untitled Session"}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground">
                            {timeAgo}
                          </span>
                        </button>
                      );
                    })}

                    {hasMore ? (
                      <button
                        type="button"
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
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        >
          <Settings className="size-3.5" />
          <span>{t("settings")}</span>
        </Link>
      </div>
    </aside>
  );
}
