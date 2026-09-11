"use client";

import * as React from "react";
import { ShoppingCartIcon } from "lucide-react";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function SellingDashboard() {
  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>Selling Dashboard</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
      actions={<AIChatAssistant />}
    >
      <BlankWorkspaceLanding
        withoutShell
        title="Selling Dashboard"
        description="Satış siparişleri, müşteri teklifleri, faturalar ve satış analitiği özet panosu."
        icon={ShoppingCartIcon}
      />
    </WorkspacePageShell>
  );
}
