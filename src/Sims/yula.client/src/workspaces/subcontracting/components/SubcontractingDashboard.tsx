"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RefreshCwIcon } from "lucide-react";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function SubcontractingDashboard() {
  const t = useTranslations("Dashboards");
  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>{t("subcontracting_title")}</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
      actions={<AIChatAssistant />}
    >
      <BlankWorkspaceLanding
        withoutShell
        title={t("subcontracting_title")}
        description={t("subcontracting_description")}
        icon={RefreshCwIcon}
      />
    </WorkspacePageShell>
  );
}
