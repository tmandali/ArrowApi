"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ShoppingCartIcon } from "lucide-react";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function SellingDashboard() {
  const t = useTranslations("Dashboards");
  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>{t("selling_title")}</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
      actions={<AIChatAssistant />}
    >
      <BlankWorkspaceLanding
        withoutShell
        title={t("selling_title")}
        description={t("selling_description")}
        icon={ShoppingCartIcon}
      />
    </WorkspacePageShell>
  );
}
