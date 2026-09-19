"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { extractAgentIdFromPath } from "@/lib/workspace-paths";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserAgentsStore } from "@/lib/stores/user-agents";

/**
 * Ekran bazlı aktif sohbet yönetimi — orijinal YulaChatProvider effect'inin
 * taşınmış hali:
 * Sayfa değişiminde aktif sohbet KORUNUR (ana ekran ↔ dock tek session);
 * yalnız ajan kimliği URL ile senkronlanır ve sohbetin kendi navigasyonu
 * (followNav) hedef sayfaya bağlanır. Taze sohbet yalnız kullanıcının
 * "yeni sohbet" aksiyonu veya ajan değişimiyle açılır.
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
      }
    }
    // Sayfa değişiminde aktif sohbet korunur — yeni sohbet açılmaz.
    // (Tek session: ana ekran ve dock aynı conversationId'yi paylaşır.)
  }, [pathname]);
}
