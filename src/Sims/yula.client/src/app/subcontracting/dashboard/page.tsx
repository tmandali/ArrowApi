"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export default function SubcontractingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WorkspacePageShell showSearch={false} frameless>
          <BlankWorkspaceLanding
            title="Subcontracting Dashboard"
            description="Fason üretim emirleri, dış tedarik ve fason teslimat rotalama özet panosu."
            icon={RefreshCwIcon}
          />
        </WorkspacePageShell>
      </div>
    </AppLayout>
  );
}
