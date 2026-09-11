"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function SubcontractingDashboard() {
  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>Subcontracting Dashboard</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
    >
      <BlankWorkspaceLanding
        withoutShell
        title="Subcontracting Dashboard"
        description="Fason üretim emirleri, dış tedarik ve fason teslimat rotalama özet panosu."
        icon={RefreshCwIcon}
      />
    </WorkspacePageShell>
  );
}
