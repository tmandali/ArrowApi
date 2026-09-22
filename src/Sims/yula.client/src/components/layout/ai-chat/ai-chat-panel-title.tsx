"use client";

import { usePathname } from "next/navigation";
import * as React from "react";
import { useTranslations } from "next-intl";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { YULA } from "@/components/layout/yula-brand-data";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { useChatsStore } from "@/lib/stores/chats";
import { formatPathnameLabel, isWorkspaceHomePath } from "@/lib/workspace-paths";

import { YulaBranchSelector } from "@/components/layout/yula-branch-selector";

export function AIChatPanelTitle({ hideIcon = false }: { hideIcon?: boolean } = {}) {
  const t = useTranslations("ChatAssistant");
  const tScreen = useTranslations("ScreenLabels");
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen);
  const isSearchingHistory = useChatsStore((s) => s.isSearchingHistory);
  const agents = useUserAgentsStore((s) => s.agents);
  const storeActiveAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const pathname = usePathname();

  const activeConv = React.useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  );

  const screenLabel = formatPathnameLabel(pathname, (k) => tScreen(k)) || tScreen("fallback");

  // Dock başlığı: kayıtlı başlık yoksa (New / "Yeni Sohbet") aktif ajan
  // adı gösterilir; ajan yoksa varsayılan Yula. useDockAgent ile aynı
  // çözüm (konuşma kaydı > global seçim) — ikon ile isim uyumlu kalır.
  const dockAgentName = React.useMemo(() => {
    const id = activeConv?.agentId ?? storeActiveAgentId ?? null;
    if (!id) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  }, [activeConv?.agentId, storeActiveAgentId, agents]);

  let titleText: string = YULA.name;
  if (isHistoryOpen || isSearchingHistory) {
    titleText = isWorkspaceHomePath(pathname) ? t("history_title") : t("screen_chats", { screen: screenLabel });
  } else if (activeConv?.title && activeConv.title !== "Yeni Sohbet") {
    titleText = activeConv.title;
  } else if (dockAgentName) {
    titleText = dockAgentName;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 truncate">
      {hideIcon ? null : <YulaMarkIcon className="size-5 shrink-0" />}
      <span className="truncate text-xs font-semibold">{titleText}</span>
      {!isHistoryOpen && !isSearchingHistory && <YulaBranchSelector />}
    </div>
  );
}

