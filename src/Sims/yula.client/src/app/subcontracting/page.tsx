"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";

export default function SubcontractingHomePage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WorkspacePageShell
          showSearch={true}
          searchPlaceholder="Subcontracting modüllerinde ara..."
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/subcontracting">Subcontracting</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
          actions={<AIChatAssistant />}
        >
          <BlankWorkspaceLanding
            title="Subcontracting Workspace"
            description="Fason üretim emirleri, dış tedarik ve fason teslimat rotalama modüllerine erişebilirsiniz."
            icon={RefreshCwIcon}
          />
        </WorkspacePageShell>
      </div>
    </AppLayout>
  );
}
