"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart2Icon } from "lucide-react";
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

export default function AccountingHomePage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WorkspacePageShell
          showSearch={true}
          searchPlaceholder="Accounting modüllerinde ara (ör: General Ledger, Balance Sheet)..."
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/accounting">Accounting</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
          actions={<AIChatAssistant />}
        >
          <BlankWorkspaceLanding
            title="Accounting Workspace"
            description="Finansal muhasebe, bilanço, kâr-zarar, mizan ve genel defter (General Ledger) modüllerine erişebilirsiniz."
            icon={BarChart2Icon}
          />
        </WorkspacePageShell>
      </div>
    </AppLayout>
  );
}
