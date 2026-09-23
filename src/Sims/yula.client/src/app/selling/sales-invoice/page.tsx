"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { salesInvoiceContext } from "@/workspaces/selling";
import { BoundedContextPageContainer } from "@/components/bounded-context";

export default function SalesInvoicePage() {
  return (
    <AppLayout>
      <BoundedContextPageContainer
        context={salesInvoiceContext}
        initialValues={{
          invoice_id: "INV-2026-001",
          posting_date: new Date().toISOString().split("T")[0],
          customer_id: "CUST-001",
          currency: "TRY",
          subtotal: 1000,
          tax_total: 200,
          grand_total: 1200,
        }}
        initialChildrenData={{
          items: [
            {
              item_code: "ITM-001",
              item_name: "Endüstriyel Vana",
              qty: 1,
              rate: 1000,
              amount: 1000,
              vat_rate: 20,
              vat_amount: 200,
            },
          ],
        }}
      />
    </AppLayout>
  );
}
