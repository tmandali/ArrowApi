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
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function ManufacturingDashboardPage() {
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
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
          actions={<AIChatAssistant />}
        >
          <BlankWorkspaceLanding
            title="Manufacturing Dashboard"
            description="Üretim planlama, iş emirleri (Work Order), ürün reçeteleri (BOM) ve iş istasyonları özet panosu."
            icon={FactoryIcon}
          />
        </WorkspacePageShell>
      </div>
    </AppLayout>
  );
}
