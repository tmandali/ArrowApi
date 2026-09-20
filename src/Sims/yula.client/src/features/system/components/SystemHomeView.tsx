"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YulaFullscreenOverlay } from "@/components/layout/yula-fullscreen-overlay";
import { YulaContextUsageBadge } from "@/components/layout/yula-context-usage-badge";
import { YulaNewChatButton } from "@/components/layout/fullscreen-overlay/yula-dock-controls";
import { useWorkspaceSearch } from "@/context/workspace-search-context";
import { WorkspaceSearchMainView } from "@/components/layout/workspace-search-main-view";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserAgentsStore } from "@/lib/stores/user-agents";

/**
 * SystemHomeView:
 * Ana ekran (/) doğrudan tam ekran Yula IDE (3 sütunlu: Sol Kenar Çubuğu,
 * Merkez Sohbet, Sağ Tuval) modunu kullanır.
 * Zaten ana ekran olduğu için küçültme / kapatma (collapse/close) butonlarına yer verilmez.
 * AppHeader üzerinden veya Cmd+K ile tetiklenen arama açıkken WorkspaceSearchMainView render edilir.
 */
export function SystemHomeView() {
  const t = useTranslations("SystemHome");
  const router = useRouter();
  const { open: searchOpen } = useWorkspaceSearch();

  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const storeActiveAgentId = useUserAgentsStore((s) => s.activeAgentId);

  const displayAgentId = React.useMemo(() => {
    const conv = conversations.find((c) => c.id === activeId);
    return conv?.agentId ?? storeActiveAgentId ?? null;
  }, [conversations, activeId, storeActiveAgentId]);

  const handleSettings = React.useCallback(() => {
    if (displayAgentId) {
      router.push(`/my/agents?edit=${encodeURIComponent(displayAgentId)}`);
    }
  }, [displayAgentId, router]);

  // Global arama açıkken arama görünümü tüm alanı kaplar
  if (searchOpen) {
    return <WorkspaceSearchMainView />;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <YulaFullscreenOverlay
        isOverlay={false}
        hideWindowControls={true}
        headerActions={
          <div className="flex min-w-0 items-center gap-0.5">
            <YulaContextUsageBadge />
            <YulaNewChatButton />
            {displayAgentId ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleSettings}
                title={t("agent_settings_btn")}
                aria-label={t("agent_settings_btn")}
              >
                <Settings className="size-3.5" />
              </Button>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
