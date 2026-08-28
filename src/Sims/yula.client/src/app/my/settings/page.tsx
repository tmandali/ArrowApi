import { AppLayout } from "@/components/layout/app-layout";
import { MySettingsForm } from "@/features/system";

export default function MySettingsPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <MySettingsForm />
      </div>
    </AppLayout>
  );
}
