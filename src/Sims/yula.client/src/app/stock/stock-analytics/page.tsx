import { AppLayout } from "@/components/layout/app-layout";
import { StockAnalyticsForm } from "@/features/stock/stock-analytics";

export default function StockAnalyticsPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <StockAnalyticsForm />
      </div>
    </AppLayout>
  );
}
