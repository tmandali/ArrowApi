"use client";

import * as React from "react";
import { FactoryIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export default function ManufacturingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WorkspacePageShell showSearch={false} frameless>
          <BlankWorkspaceLanding
            title="Manufacturing Dashboard"
            description="Üretim planlama, iş emirleri (Work Order), ürün reçeteleri (BOM) ve iş istasyonları özet panosu."
            icon={FactoryIcon}
          />
        </WorkspacePageShell>
      </div>
    </AppLayout>
  );
}
