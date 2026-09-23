"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { deliveryNoteContext } from "@/workspaces/stock";
import { BoundedContextPageContainer } from "@/components/bounded-context";

export default function StockDeliveryNotePage() {
  return (
    <AppLayout>
      <BoundedContextPageContainer
        context={deliveryNoteContext}
        initialValues={{
          delivery_note_id: "DN-2026-001",
          posting_date: new Date().toISOString().split("T")[0],
          customer_id: "CUST-001",
          warehouse_id: "WH-MAIN",
          total_qty: 10,
        }}
        initialChildrenData={{
          items: [
            {
              item_code: "ITM-001",
              item_name: "Standard Malzeme",
              qty: 10,
            },
          ],
        }}
      />
    </AppLayout>
  );
}
