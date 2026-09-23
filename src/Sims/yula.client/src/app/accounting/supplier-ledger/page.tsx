"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { supplierLedgerContext } from "@/workspaces/accounting";
import { BoundedContextPageContainer } from "@/components/bounded-context";

export default function SupplierLedgerPage() {
  return (
    <AppLayout>
      <BoundedContextPageContainer
        context={supplierLedgerContext}
        initialValues={{
          from_date: "2026-01-01",
          to_date: new Date().toISOString().split("T")[0],
          party_id: "SUPP-001",
          party_type: "supplier",
          include_unposted: false,
        }}
      />
    </AppLayout>
  );
}
