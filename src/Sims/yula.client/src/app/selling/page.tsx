import { AppLayout } from "@/components/layout/app-layout";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export default function SellingPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <BlankWorkspaceLanding />
      </div>
    </AppLayout>
  );
}
