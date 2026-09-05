import { AppLayout } from "@/components/layout/app-layout";
import { StockBalanceForm } from "@/workspaces/stock";

export default function StockBalancePage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <StockBalanceForm />
      </div>
    </AppLayout>
  );
}
