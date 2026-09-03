"use client";

import * as React from "react"
import Link from "next/link";
import { FilePlus2 } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { ArrowJobResultPanel } from "@/features/jobs/components/ArrowJobResultPanel"

const RETAIL_SALES_PATH = "/stock/retail-sales-report"
const DEFAULT_REPORT_TITLE = "Retail Sales"

type RetailSalesJobViewProps = {
  jobId: string
}

/**
 * Dedicated Retail Sales result page (`/stock/retail-sales-report/{guid}`).
 * Spreadsheet result only — Query panel lives on the criteria page.
 */
export function RetailSalesJobView({ jobId }: RetailSalesJobViewProps) {
  const shortId = jobId.slice(0, 8)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              <Link href={RETAIL_SALES_PATH}>
                <FilePlus2 className="size-3.5" />
                New
              </Link>
            </Button>
            <AIChatAssistant />
          </div>
        }
      >
        <Breadcrumb className="min-w-0 overflow-hidden">
          <BreadcrumbList className="flex-nowrap text-xs">
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbLink asChild>
                <Link href="/stock">Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbPage className="text-foreground">Reports</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <Link href={RETAIL_SALES_PATH}>Retail Sales</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="block truncate font-semibold text-foreground">
                {shortId}…
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>

      <WorkspaceAiDock className="overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-2 pb-2 pt-0">
          <ArrowJobResultPanel
            jobId={jobId}
            title={DEFAULT_REPORT_TITLE}
            className="min-h-0 flex-1"
          />
        </div>
      </WorkspaceAiDock>
    </div>
  )
}
