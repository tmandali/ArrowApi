import * as React from "react"
import {
  AIChatPanel,
  AIChatPanelTitle,
} from "@/components/layout/ai-chat-assistant"
import { WorkspaceSidePanelLayout } from "@/components/layout/workspace-side-panel"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat"
import { cn } from "@/utils/cn"

type WorkspaceAiDockProps = {
  children: React.ReactNode
  className?: string
}

/**
 * Docks the workspace AI panel beside page content, below the workspace header
 * (same placement model as Stock Analytics Query Criteria).
 */
export function WorkspaceAiDock({ children, className }: WorkspaceAiDockProps) {
  const { open, setOpen } = useWorkspaceAiChat()

  if (!open) {
    return (
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
        {children}
      </div>
    )
  }

  return (
    <WorkspaceSidePanelLayout
      open={open}
      onOpenChange={setOpen}
      title={<AIChatPanelTitle />}
      collapseLabel="Collapse AI assistant"
      panel={<AIChatPanel />}
      className={cn("min-h-0 flex-1", className)}
    >
      {children}
    </WorkspaceSidePanelLayout>
  )
}
