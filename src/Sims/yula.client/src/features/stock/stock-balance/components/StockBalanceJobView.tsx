"use client";

import Link from "next/link";
import { FilePlus2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { PageHeaderTitle } from "@/components/layout/page-header-title"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { ArrowJobResultPanel } from "@/features/jobs/components/ArrowJobResultPanel"

const STOCK_BALANCE_PATH = "/stock/stock-balance"
const DEFAULT_REPORT_TITLE = "Stock Balance"

type StockBalanceJobViewProps = {
  jobId: string
}

/**
 * Dedicated Stock Balance result page (`/stock/stock-balance/{guid}`).
 * Spreadsheet result only — Query panel lives on the criteria page.
 */
export function StockBalanceJobView({ jobId }: StockBalanceJobViewProps) {
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
              <Link href={STOCK_BALANCE_PATH}>
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
