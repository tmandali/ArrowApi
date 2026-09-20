import { AppLayout } from "@/components/layout/app-layout";
import { RequireAdmin } from "@/features/system";
import { PlaybooksManagementView } from "@/workspaces/my/components/playbooks/playbooks-management-view";

export default function SystemPlaybooksPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <RequireAdmin>
          <PlaybooksManagementView defaultTab="proposals" />
        </RequireAdmin>
      </div>
    </AppLayout>
  );
}
