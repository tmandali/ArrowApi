import { AppLayout } from "@/components/layout/app-layout";
import { AgentManagementView, RequireAdmin } from "@/features/system";

export default function SystemAgentsPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <RequireAdmin>
          <AgentManagementView />
        </RequireAdmin>
      </div>
    </AppLayout>
  );
}
