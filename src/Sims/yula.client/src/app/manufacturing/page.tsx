import { AppLayout } from "@/components/layout/app-layout";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export default function ManufacturingPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <BlankWorkspaceLanding />
      </div>
    </AppLayout>
  );
}
