"use client";

import * as React from "react";
import Link from "next/link";
import { FactoryIcon } from "lucide-react";
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

export default function ManufacturingHomePage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WorkspacePageShell
          showSearch={true}
          searchPlaceholder="Manufacturing modüllerinde ara (ör: BOM, Work Order)..."
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/manufacturing">Manufacturing</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
          actions={<AIChatAssistant />}
        >
          <BlankWorkspaceLanding
            title="Manufacturing Workspace"
            description="Üretim planlama, iş emirleri (Work Order), ürün reçeteleri (BOM) ve iş istasyonları modüllerine erişebilirsiniz."
            icon={FactoryIcon}
          />
        </WorkspacePageShell>
      </div>
    </AppLayout>
  );
}
