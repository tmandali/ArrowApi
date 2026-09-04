import { AppLayout } from "@/components/layout/app-layout";
import { ItemFormShell } from "@/features/stock/item";

export default function StockItemPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <ItemFormShell />
      </div>
    </AppLayout>
  );
}
