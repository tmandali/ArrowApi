"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { normalizePath, extractAgentIdFromPath } from "@/lib/workspace-paths";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserAgentsStore } from "@/lib/stores/user-agents";

/**
 * Ekran bazlı aktif sohbet yönetimi — orijinal YulaChatProvider effect'inin
 * birebir taşınmış hali (davranış değişikliği yok):
 * Sayfa değişiminde aktif sohbetin O EKRANA ait olup olmadığını denetler.
 */
export function useConversationRouteSync() {
  const pathname = usePathname();
  const activePathRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (activePathRef.current === pathname) return;
    activePathRef.current = pathname;

    // Ayrı ajan oturumu: URL'deki ajan kimliği global seçimi ezer.
    // Yula kökü (/) her zaman saf Yula'dır: eski ajan seçimi temizlenir,
    // böylece ana ekranda ajan çipi/persona sızıntısı olmaz.
    const routeAgentId = extractAgentIdFromPath(pathname);
    if (routeAgentId) {
      const agentStore = useUserAgentsStore.getState();
      if (agentStore.activeAgentId !== routeAgentId) {
        agentStore.setActiveAgentId(routeAgentId);
      }
    } else if (pathname === "/") {
      const agentStore = useUserAgentsStore.getState();
      if (agentStore.activeAgentId !== null) {
        agentStore.setActiveAgentId(null);
      }
    }

    const store = useChatsStore.getState();
    const currentActiveId = store.activeId;

    // Sohbet KENDİ navigasyonuyla sayfa değiştirdiyse: hedefe VARILDIĞINDA
    // kaydı yeni sayfaya bağla (son açılan sayfa kazanır) ve aktif sohbeti koru.
    // Push'tan ÖNCE bağlamak çalışmaz — persist efekti eski sayfada kaydedip ezer.
    // Ajan kimliği korunur: ajan session'ından rapor sayfasına geçişte persona kaybolmaz.
    const follow = store.followNav;
    if (follow) {
      useChatsStore.setState({ followNav: null });
      if (follow.id === currentActiveId && Date.now() - follow.at < 15_000) {
        const followAgentId =
          store.conversations.find((c) => c.id === follow.id)?.agentId ??
          routeAgentId ??
          useUserAgentsStore.getState().activeAgentId ??
          null;
        store.followArrivedConversation(follow.id, undefined, followAgentId);
        return;
      }
    }

    // Her sayfa değişimi = taze sohbet: aktif sohbet yalnız bu sayfaya BİREBİR
    // bağlıysa VE aynı ajan kimliğini taşıyorsa korunur (history tıklaması da
    // bu eşleşmeyle korunur); aksi halde yeni sohbet açılır.
    const activeConv = store.conversations.find((c) => c.id === currentActiveId);
    const activeMsgs = currentActiveId ? store.messagesById[currentActiveId] ?? [] : [];
    const currentAgentId =
      routeAgentId ?? useUserAgentsStore.getState().activeAgentId ?? null;
    const isSamePage = activeConv
      ? normalizePath(activeConv.pathname ?? "/") === normalizePath(pathname) &&
        (activeConv.agentId ?? null) === (currentAgentId ?? null)
      : activeMsgs.length === 0;

    if (!isSamePage) {
      store.newConversation();
    }
  }, [pathname]);
}
