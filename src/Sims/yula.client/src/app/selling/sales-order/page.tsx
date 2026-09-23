"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { salesOrderContext } from "@/workspaces/selling";
import { BoundedContextPageContainer } from "@/components/bounded-context";

export default function SalesOrderPage() {
  return (
    <AppLayout>
      <BoundedContextPageContainer
        context={salesOrderContext}
        initialValues={{
          order_id: "SO-2026-001",
          order_date: new Date().toISOString().split("T")[0],
          customer_id: "CUST-001",
          currency: "TRY",
          grand_total: 1500,
        }}
        initialChildrenData={{
          items: [
            {
              item_code: "ITM-001",
              item_name: "Yüksek Performanslı Rulman",
              qty: 1,
              rate: 1500,
              amount: 1500,
            },
          ],
        }}
      />
    </AppLayout>
  );
}
