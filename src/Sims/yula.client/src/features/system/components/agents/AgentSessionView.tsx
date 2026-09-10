"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { AIChatPanel } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { useUserAgentsStore } from "@/lib/stores/user-agents";

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
  // içinde gerçek durum okunur.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    const persistApi = useUserAgentsStore.persist;
    if (persistApi?.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persistApi?.onFinishHydration(() => setHydrated(true));
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
    <WorkspacePageShell hideHeader>
      <AIChatPanel mode="main" />
    </WorkspacePageShell>
  );
}
