"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SquarePen, Settings } from "lucide-react";
import { AIChatPanel } from "@/components/layout/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { WorkspacePinnedItemsGrid } from "@/components/layout/workspace-pinned-items-grid";
import { Button } from "@/components/ui/button";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { YULA } from "@/components/layout/yula-brand-data";

/**
 * Yula ana ekran başlığı — ajan oturumundaki desenin aynısı:
 * "{Ad} – {SohbetAdı} · #KISA_NO". Ad = aktif ajan yoksa "Yula".
 * Kayıtlı başlık yoksa "Yeni Sohbet" gösterilir.
 */
function YulaSessionHeaderTitle({ displayName }: { displayName: string }) {
  const t = useTranslations("SystemHome")
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const activeConv = activeId
    ? conversations.find((c) => c.id === activeId)
    : undefined;
  const chatName = activeConv?.title?.trim() || t("empty_chat_title");
  const shortNo = activeId
    ? (activeId.split("-").pop() || activeId).slice(-6).toUpperCase()
    : null;
  const chatSuffix = shortNo ? `${chatName} · #${shortNo}` : chatName;
  const text = `${displayName} – ${chatSuffix}`;
  return (
    <PageHeaderTitle
      title={activeId ? `${text} (${activeId})` : text}
      className="font-medium text-muted-foreground"
    >
      <span className="font-semibold text-primary">{displayName}</span>
      <span>{` – ${chatSuffix}`}</span>
    </PageHeaderTitle>
  );
}

/**
 * Başlık sağı aksiyonları: Yeni Sohbet + (ajan seçiliyse) Ajan Ayarları.
 */
function YulaSessionHeaderActions({ agentId }: { agentId: string | null }) {
  const t = useTranslations("SystemHome")
  const router = useRouter();
  const yula = useOptionalYulaChat();

  const handleNewChat = () => {
    if (yula) {
      yula.newConversation();
    } else {
      useChatsStore.getState().newConversation();
    }
  };

  const handleSettings = () => {
    if (agentId) router.push(`/system/agents?edit=${encodeURIComponent(agentId)}`);
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-xs"
        onClick={handleNewChat}
        title={t("new_chat_btn")}
        aria-label={t("new_chat_btn")}
      >
        <SquarePen className="size-3.5" />
        <span className="hidden sm:inline">{t("new_chat_short")}</span>
      </Button>
      {agentId ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleSettings}
          title={t("agent_settings_btn")}
          aria-label={t("agent_settings_btn")}
        >
          <Settings className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function SystemHomeView() {
  const pathname = usePathname();
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const agents = useUserAgentsStore((s) => s.agents);
  const storeActiveAgentId = useUserAgentsStore((s) => s.activeAgentId);

  // Yula root (/): tüm pinler yerine aynı kutu biçimiyle çalışma alanları.
  // Workspace root'ları: o çalışma alanına ait pinler (path filtresi).
  const isYulaRoot = pathname === "/";

  // Başlıktaki ad — dock başlığıyla aynı çözüm (konuşma kaydı > global
  // seçim); ajan yoksa varsayılan Yula.
  const { displayName, displayAgentId } = React.useMemo(() => {
    const conv = conversations.find((c) => c.id === activeId);
    const id = conv?.agentId ?? storeActiveAgentId ?? null;
    const agent = id ? (agents.find((a) => a.id === id) ?? null) : null;
    return {
      displayName: agent?.name ?? YULA.name,
      displayAgentId: agent?.id ?? null,
    };
  }, [conversations, activeId, agents, storeActiveAgentId]);

  // Ajan oturumundaki gibi yüzen header kartı: arama AppHeader'daki tetik +
  // Cmd+K ile yürür (arama açıkken header gizlenir).
  return (
    <WorkspacePageShell
      title={<YulaSessionHeaderTitle displayName={displayName} />}
      actions={<YulaSessionHeaderActions agentId={displayAgentId} />}
      showSearch={false}
      transparentHeader
      navOverlay
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
