"use client";

import { usePathname } from "next/navigation";
import { AIChatAssistant, AIChatPanel } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { WorkspacePinnedItemsGrid } from "@/components/layout/workspace-pinned-items-grid";
import { useChatsStore } from "@/lib/stores/chats";

export function SystemHomeView() {
  const pathname = usePathname();
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const activeConversation = conversations.find((c) => c.id === activeId);
  const activeTitle = activeConversation?.title || "Yeni Sohbet";

  // Yula root (/): tüm pinler yerine aynı kutu biçimiyle çalışma alanları.
  // Workspace root'ları: o çalışma alanına ait pinler (path filtresi).
  const isYulaRoot = pathname === "/";

  // Header araması: shell fallback'i WorkspaceSearchTrigger — menü + rapor +
  // sohbet geçmişini kapsayan birleşik arama (YulaHeaderSearch yalnız geçmişti).
  return (
    <WorkspacePageShell
      breadcrumb={<span className="truncate max-w-48 sm:max-w-64 font-medium text-foreground" title={activeTitle}>{activeTitle}</span>}
      actions={<AIChatAssistant />}
    >
      <AIChatPanel
        mode="main"
        belowInput={
          <WorkspacePinnedItemsGrid
            mode={isYulaRoot ? "workspaces" : "pins"}
            className="w-full"
          />
        }
      />
    </WorkspacePageShell>
  );
}
