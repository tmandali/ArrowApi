"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { ManufacturingDashboard } from "@/workspaces/manufacturing";

export default function ManufacturingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <ManufacturingDashboard />
      </div>
    </AppLayout>
  );
}
