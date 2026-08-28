import { AppLayout } from "@/components/layout/app-layout";
import { StockPageForm } from "@/features/stock";

export default function StockDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <StockPageForm />
      </div>
    </AppLayout>
  );
}
