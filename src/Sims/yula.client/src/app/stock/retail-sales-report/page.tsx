import { AppLayout } from "@/components/layout/app-layout";
import { RetailSalesForm } from "@/features/stock/retail-sales-report";

export default function RetailSalesPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <RetailSalesForm />
      </div>
    </AppLayout>
  );
}
