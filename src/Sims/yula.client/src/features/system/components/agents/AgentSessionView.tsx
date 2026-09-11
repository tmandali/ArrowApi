"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Bot, Settings, SquarePen } from "lucide-react";
import { AIChatPanel } from "@/components/layout/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { Button } from "@/components/ui/button";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserAgentsStore } from "@/lib/stores/user-agents";

/**
 * Ajan ana ekran başlığı: "{AjanAdı} – {SohbetAdı} · #KISA_NO".
 * KISA_NO, aktif sohbet id'sinin son 6 hanesidir (belirsizliği önler);
 * başlık boşsa "Yeni Sohbet" gösterilir. Native tooltip'te tam id tutulur.
 */
function AgentSessionHeaderTitle({
  agentName,
}: {
  agentName: string;
}) {
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const activeConv = activeId
    ? conversations.find((c) => c.id === activeId)
    : undefined;
  const chatName = activeConv?.title?.trim() || "Yeni Sohbet";
  const shortNo = activeId
    ? (activeId.split("-").pop() || activeId).slice(-6).toUpperCase()
    : null;
  const chatSuffix = shortNo ? `${chatName} · #${shortNo}` : chatName;
  const text = `${agentName} – ${chatSuffix}`;
  return (
    <PageHeaderTitle
      title={activeId ? `${text} (${activeId})` : text}
      className="font-medium text-muted-foreground"
    >
      <span className="font-semibold text-primary">{agentName}</span>
      <span>{` – ${chatSuffix}`}</span>
    </PageHeaderTitle>
  );
}

/**
 * Başlık sağı aksiyonları: Yeni Sohbet + (custom ajan ise) Ajan Ayarları.
 * Bu ekran yalnız custom user-ajan oturumudur (/agents/<id>), bu yüzden
 * ayar butonu her zaman gösterilir — ajan düzenleme sayfasına gider.
 */
function AgentSessionHeaderActions({ agentId }: { agentId: string }) {
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
    router.push(`/system/agents?edit=${encodeURIComponent(agentId)}`);
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-xs"
        onClick={handleNewChat}
        title="Yeni Sohbet Başlat"
        aria-label="Yeni Sohbet Başlat"
      >
        <SquarePen className="size-3.5" />
        <span className="hidden sm:inline">Yeni Sohbet</span>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleSettings}
        title="Ajan Ayarları"
        aria-label="Ajan Ayarları"
      >
        <Settings className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * Ayrı ajan oturumu (full-screen): /agents/<agentId>.
 * Yula'dan kesin ayrım — kendi URL'i, kendi konuşma geçmişi (agentId),
 * ajan tanımından gelen tool/skill seti.
 */
export function AgentSessionView() {
  const params = useParams<{ agentId?: string | string[] }>();
  const router = useRouter();
  const raw = params?.agentId;
  const agentId = Array.isArray(raw) ? raw[0] : (raw ?? "");
  const agent = useUserAgentsStore((s) => s.agents.find((a) => a.id === agentId));
  const setActiveAgentId = useUserAgentsStore((s) => s.setActiveAgentId);
  // Persist rehydrate olmadan liste boş gelir — "bulunamadı" flash'ını
  // önlemek için hazır olana kadar bekle. NOT: sunucu ön-render'ında
  // `window` yoktur; zustand persist erken döner ve store'da `.persist`
  // oluşmaz — bu yüzden erişim SSR-güvenli (?.) olmalı. İlk render iki
  // ortamda da `false` verir (hydration uyumsuzluğu yok); istemcide effect
  // içinde gerçek durum okunur. Başlangıç değeri lazy okunur, effect yalnız
  // bitmemiş hydration'a abone olur (senkron setState yok).
  const [hydrated, setHydrated] = React.useState(
    () => useUserAgentsStore.persist?.hasHydrated() ?? false,
  );
  React.useEffect(() => {
    if (useUserAgentsStore.persist?.hasHydrated()) return;
    return useUserAgentsStore.persist?.onFinishHydration(() => setHydrated(true));
  }, []);

  // URL oturumu global seçimi besler (provider da aynı kuralı uygular).
  React.useEffect(() => {
    if (agentId) setActiveAgentId(agentId);
  }, [agentId, setActiveAgentId]);

  if (!agentId) return null;

  if (!hydrated) {
    return (
      <WorkspacePageShell hideHeader>
        <div className="flex h-full items-center justify-center p-6 text-sm opacity-60">
          Ajan oturumu hazırlanıyor…
        </div>
      </WorkspacePageShell>
    );
  }

  if (!agent) {
    return (
      <WorkspacePageShell hideHeader>
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-4 pt-20 text-center">
          <Bot className="size-10 text-muted-foreground/50" />
          <h1 className="text-lg font-semibold">Ajan bulunamadı</h1>
          <p className="text-sm text-muted-foreground">
            Bu kimlikte bir ajan yok (silinmiş olabilir). Ajan listesinden yenisini seçin.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Yula&apos;ya dön
            </button>
            <Link
              href="/system/agents"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Ajanları yönet
            </Link>
          </div>
        </div>
      </WorkspacePageShell>
    );
  }

  return (
    <WorkspacePageShell
      title={<AgentSessionHeaderTitle agentName={agent.name} />}
      showSearch={false}
      transparentHeader
      actions={<AgentSessionHeaderActions agentId={agent.id} />}
    >
      <AIChatPanel mode="main" />
    </WorkspacePageShell>
  );
}
