import { AppLayout } from "@/components/layout/app-layout";
import { SystemUsersView } from "@/features/system";

export default function SystemUsersPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <SystemUsersView />
      </div>
    </AppLayout>
  );
}
