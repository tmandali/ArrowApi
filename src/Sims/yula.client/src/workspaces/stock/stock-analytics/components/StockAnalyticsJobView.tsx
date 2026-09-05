"use client";

import Link from "next/link";
import { FilePlus2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { PageHeaderTitle } from "@/components/layout/page-header-title"
import { ModuleNavPane } from "@/components/layout/module-nav-pane"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { ArrowJobResultPanel } from "@/features/jobs/components/ArrowJobResultPanel"

const STOCK_ANALYTICS_PATH = "/stock/stock-analytics"
const DEFAULT_REPORT_TITLE = "Stock Analytics"

type StockAnalyticsJobViewProps = {
  jobId: string
}

/**
 * Dedicated Stock Analytics result page (`/stock/stock-analytics/{guid}`).
 * Standard OPFS report grid — Criteria lives on the entry page.
 */
export function StockAnalyticsJobView({ jobId }: StockAnalyticsJobViewProps) {
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
              <Link href={STOCK_ANALYTICS_PATH}>
                <FilePlus2 className="size-3.5" />
                New
              </Link>
            </Button>
            <AIChatAssistant />
          </div>
        }
      >
        <PageHeaderTitle>
          {DEFAULT_REPORT_TITLE} · {shortId}…
        </PageHeaderTitle>
      </WorkspacePageHeader>

      <WorkspaceAiDock className="overflow-hidden">
        <ModuleNavPane>
          <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
            <ArrowJobResultPanel
              jobId={jobId}
              title={DEFAULT_REPORT_TITLE}
              className="min-h-0 flex-1"
            />
          </div>
        </ModuleNavPane>
      </WorkspaceAiDock>
    </div>
  )
}
