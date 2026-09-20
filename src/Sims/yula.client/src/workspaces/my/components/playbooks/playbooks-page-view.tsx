"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { AIChatAssistant } from "@/components/layout/ai-chat/ai-chat-assistant";
import { panelCardClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { PlaybooksManagementView } from "./playbooks-management-view";

export function PlaybooksPageView() {
  const t = useTranslations("Playbooks");

  return (
    <WorkspacePageShell
      title={
        <div className="flex items-center gap-2.5">
          <PageHeaderTitle>{t("title")}</PageHeaderTitle>
          <span className="text-[11px] font-normal text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/60">
            LLM Wiki
          </span>
        </div>
      }
      showSearch={false}
      actions={<AIChatAssistant />}
    >
      <div className={cn(panelCardClass, "h-full min-h-0 flex-1 overflow-hidden")}>
        <PlaybooksManagementView />
      </div>
    </WorkspacePageShell>
  );
}
