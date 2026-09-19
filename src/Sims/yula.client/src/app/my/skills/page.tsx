import { AppLayout } from "@/components/layout/app-layout";
import { RequireSession } from "@/workspaces/my";
import { SkillManagementView } from "@/features/system";

/**
 * `/my/skills` — Beceriler & Slash Komutları Yönetimi.
 *
 * Kullanıcının ve sistemin tanımladığı slash komutları ve becerileri
 * master-detail düzeninde yönetir. Oturum zorunludur.
 */
export default function MySkillsPage() {
  return (
    <AppLayout>
      <RequireSession>
        <SkillManagementView />
      </RequireSession>
    </AppLayout>
  );
}
