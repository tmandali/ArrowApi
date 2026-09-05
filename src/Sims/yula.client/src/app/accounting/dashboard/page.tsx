"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AccountingDashboard } from "@/workspaces/accounting";

export default function AccountingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <AccountingDashboard />
      </div>
    </AppLayout>
  );
}
