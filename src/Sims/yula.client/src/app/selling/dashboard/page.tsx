"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { SellingDashboard } from "@/workspaces/selling";

export default function SellingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <SellingDashboard />
      </div>
    </AppLayout>
  );
}
