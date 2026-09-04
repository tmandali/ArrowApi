import { AppLayout } from "@/components/layout/app-layout";
import { StockLedgerForm } from "@/features/stock/stock-ledger";

export default function StockLedgerPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <StockLedgerForm />
      </div>
    </AppLayout>
  );
}
