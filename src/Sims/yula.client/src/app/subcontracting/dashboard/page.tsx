"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";

export default function SubcontractingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WorkspacePageShell
          showSearch={true}
          searchPlaceholder="Subcontracting modüllerinde ara..."
          title={<PageHeaderTitle>Dashboard</PageHeaderTitle>}
          actions={<AIChatAssistant />}
        >
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
