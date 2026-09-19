import { AppLayout } from "@/components/layout/app-layout";
import { RequireSession, PluginsPageView } from "@/workspaces/my";

/**
 * `/my/plugins` — Kurumsal Eklentiler & Modüller (Plugin Registry).
 *
 * Sisteme entegre edilen Python AI sidecar, DuckDB ve ileri analitik
 * eklentilerinin canlı durumu ve araçlarını listeler. Oturum zorunludur.
 */
export default function MyPluginsPage() {
  return (
    <AppLayout>
      <RequireSession>
        <PluginsPageView />
      </RequireSession>
    </AppLayout>
  );
}
