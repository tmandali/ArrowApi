"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { BarChart2Icon } from "lucide-react";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function AccountingDashboard() {
  const t = useTranslations("Dashboards");
  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>{t("accounting_title")}</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
      actions={<AIChatAssistant />}
    >
      <BlankWorkspaceLanding
        withoutShell
        title={t("accounting_title")}
        description={t("accounting_description")}
        icon={BarChart2Icon}
      />
    </WorkspacePageShell>
  );
}
