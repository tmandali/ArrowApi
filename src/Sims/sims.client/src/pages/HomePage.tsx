import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import { WorkspaceDashboard } from "@/features/dashboard/components/WorkspaceDashboard"
import { workspaceLabelFromPath } from "@/lib/empty-module"
import * as React from "react"
import { useLocation } from "react-router-dom"

export default function HomePage() {
  const { pathname, state } = useLocation()
  const { setOpen } = useWorkspaceAiChat()
  const label = workspaceLabelFromPath(pathname)

  // Breadcrumb workspace links arrive with Yula closed.
  const yulaClosed = (state as { yulaClosed?: boolean } | null)?.yulaClosed === true

  React.useEffect(() => {
    if (yulaClosed) setOpen(false)
  }, [yulaClosed, setOpen])

  return (
    <>
      <WorkspacePageHeader
        showSearch={false}
        actions={<AIChatAssistant variant="toolbar" />}
      >
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                {label}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>
      <WorkspaceAiDock
        startExpanded
        hideHeader
        transparent
        centeredIntro
        defaultOpen={!yulaClosed}
      >
        <WorkspaceDashboard pathname={pathname} />
      </WorkspaceAiDock>
    </>
  )
}
