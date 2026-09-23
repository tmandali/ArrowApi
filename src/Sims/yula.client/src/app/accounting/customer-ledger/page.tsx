"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { customerLedgerContext } from "@/workspaces/accounting";
import { BoundedContextPageContainer } from "@/components/bounded-context";

export default function CustomerLedgerPage() {
  return (
    <AppLayout>
      <BoundedContextPageContainer
        context={customerLedgerContext}
        initialValues={{
          from_date: "2026-01-01",
          to_date: new Date().toISOString().split("T")[0],
          party_id: "CUST-001",
          party_type: "customer",
          include_unposted: false,
        }}
      />
    </AppLayout>
  );
}
