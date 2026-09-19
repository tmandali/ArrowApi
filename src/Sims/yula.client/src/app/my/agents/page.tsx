import { AppLayout } from "@/components/layout/app-layout";
import { RequireSession } from "@/workspaces/my";
import { AgentManagementView } from "@/features/system";

/**
 * `/my/agents` — Personalar & Ajanlar Yönetimi.
 *
 * Kullanıcı tanımlı alt ajanlar ve sistem rollerini master-detail
 * düzeninde yapılandırır ve yönetir. Oturum zorunludur.
 */
export default function MyAgentsPage() {
  return (
    <AppLayout>
      <RequireSession>
        <AgentManagementView />
      </RequireSession>
    </AppLayout>
  );
}
