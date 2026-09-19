import { AppLayout } from "@/components/layout/app-layout";
import { RequireSession, MemoryPageView } from "@/workspaces/my";

/**
 * `/my/memory` — Kalıcı Bellek & Tercihler (Agent Memory).
 *
 * Yula AI görüşmelerinde remember_fact ile saklanan kişisel tercihler
 * ve çalışma parametrelerini yönetir. Oturum zorunludur.
 */
export default function MyMemoryPage() {
  return (
    <AppLayout>
      <RequireSession>
        <MemoryPageView />
      </RequireSession>
    </AppLayout>
  );
}
