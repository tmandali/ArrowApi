"use client";

import * as React from "react";
import { BarChart2Icon } from "lucide-react";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function AccountingDashboard() {
  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>Accounting Dashboard</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
      actions={<AIChatAssistant />}
    >
      <BlankWorkspaceLanding
        withoutShell
        title="Accounting Dashboard"
        description="Bilanço, gelir tablosu, nakit akışı, genel mizan ve finansal ekstreler özet panosu."
        icon={BarChart2Icon}
      />
    </WorkspacePageShell>
  );
}
