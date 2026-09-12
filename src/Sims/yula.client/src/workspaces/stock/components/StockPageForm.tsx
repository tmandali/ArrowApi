"use client";

import * as React from "react";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { indexWorkspaceMenus } from "@/services/duckdb-vector";
import { useTranslations } from "next-intl";
import { StockDashboard } from "./StockDashboard";

export function StockPageForm() {
  const t = useTranslations("Stock");
  React.useEffect(() => {
    // Arka planda Stock workspace menülerini WASM RAG vektör store'a indeksle
    void indexWorkspaceMenus();
  }, []);

  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>{t("page_dashboard")}</PageHeaderTitle>}
      showSearch={false}
      transparentHeader
      navOverlay
      actions={<AIChatAssistant />}
    >
      <StockDashboard />
    </WorkspacePageShell>
  );
}
