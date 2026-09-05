"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { SubcontractingDashboard } from "@/workspaces/subcontracting";

export default function SubcontractingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <SubcontractingDashboard />
      </div>
    </AppLayout>
  );
}
