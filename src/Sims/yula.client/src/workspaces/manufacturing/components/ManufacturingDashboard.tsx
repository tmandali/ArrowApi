"use client";

import * as React from "react";
import { FactoryIcon } from "lucide-react";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function ManufacturingDashboard() {
  return (
    <WorkspacePageShell hideHeader>
      <BlankWorkspaceLanding
        withoutShell
        title="Manufacturing Dashboard"
        description="Üretim planları, iş emirleri, ürün reçeteleri (BOM), iş kartları ve kapasite özet panosu."
        icon={FactoryIcon}
      />
    </WorkspacePageShell>
  );
}
