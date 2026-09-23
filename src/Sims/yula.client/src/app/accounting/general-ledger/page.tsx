"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { generalLedgerContext } from "@/workspaces/accounting";
import { BoundedContextPageContainer } from "@/components/bounded-context";

export default function GeneralLedgerPage() {
  return (
    <AppLayout>
      <BoundedContextPageContainer
        context={generalLedgerContext}
        initialValues={{
          from_date: "2026-01-01",
          to_date: new Date().toISOString().split("T")[0],
          account: "100",
          include_unposted: false,
        }}
      />
    </AppLayout>
  );
}
