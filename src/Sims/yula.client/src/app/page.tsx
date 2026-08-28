import { AppLayout } from "@/components/layout/app-layout";
import { SystemHomeView } from "@/features/system";

export default function HomePage() {
  return (
    <AppLayout>
      <SystemHomeView />
    </AppLayout>
  );
}
