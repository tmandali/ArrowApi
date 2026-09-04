"use client";

import * as React from "react";
import { BarChart2Icon } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";

export default function AccountingDashboardPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WorkspacePageShell
          showSearch={true}
          searchPlaceholder="Accounting modüllerinde ara (ör: General Ledger, Balance Sheet)..."
          title={<PageHeaderTitle>Dashboard</PageHeaderTitle>}
          actions={<AIChatAssistant />}
        >
          <BlankWorkspaceLanding
            title="Accounting Dashboard"
            description="Finansal muhasebe, bilanço, kâr-zarar, mizan ve genel defter (General Ledger) özet panosu."
            icon={BarChart2Icon}
          />
        </WorkspacePageShell>
      </div>
    </AppLayout>
  );
}
