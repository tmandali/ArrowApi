"use client";

import * as React from "react";
import { FactoryIcon } from "lucide-react";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function ManufacturingDashboard() {
  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>Manufacturing Dashboard</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
      actions={<AIChatAssistant />}
    >
      <BlankWorkspaceLanding
        withoutShell
        title="Manufacturing Dashboard"
        description="Üretim planları, iş emirleri, ürün reçeteleri (BOM), iş kartları ve kapasite özet panosu."
        icon={FactoryIcon}
      />
    </WorkspacePageShell>
  );
}
