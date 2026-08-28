"use client";

import { AIChatAssistant, AIChatPanel } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { YulaHeaderSearch } from "@/components/layout/yula-header-search";
import { useChatsStore } from "@/lib/stores/chats";

export function SystemHomeView() {
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const activeConversation = conversations.find((c) => c.id === activeId);
  const activeTitle = activeConversation?.title || "Yeni Sohbet";

  return (
    <WorkspacePageShell
      breadcrumb={<span className="truncate max-w-48 sm:max-w-64 font-medium text-foreground" title={activeTitle}>{activeTitle}</span>}
      headerSearch={<YulaHeaderSearch />}
      actions={<AIChatAssistant />}
    >
      <AIChatPanel mode="main" />
    </WorkspacePageShell>
  );
}
