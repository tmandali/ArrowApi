import * as React from "react"
import {
  AIChatPanel,
  AIChatPanelTitle,
} from "@/components/layout/ai-chat-assistant"
import { YULA } from "@/components/layout/yula-brand"
import { Button } from "@/components/ui/button"
import { WorkspaceSidePanelLayout } from "@/components/layout/workspace-side-panel"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat"
import { cn } from "@/utils/cn"
import { ChevronRight, Maximize2, Minimize2 } from "lucide-react"

type WorkspaceAiDockProps = {
  children: React.ReactNode
  className?: string
}

function YulaExpandToggle() {
  const { expanded, toggleExpanded } = useWorkspaceAiChat()

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0"
      onClick={toggleExpanded}
      aria-pressed={expanded}
      aria-label={expanded ? YULA.restoreLabel : YULA.expandLabel}
      title={expanded ? YULA.restoreLabel : YULA.expandLabel}
    >
      {expanded ? (
        <Minimize2 className="size-3.5 text-muted-foreground" />
      ) : (
        <Maximize2 className="size-3.5 text-muted-foreground" />
      )}
    </Button>
  )
}

/**
 * Page body under the workspace header.
 * Closed: page content.
 * Open (default): resizable side dock.
 * Expanded (header button): full content between header and nav.
 */
export function WorkspaceAiDock({ children, className }: WorkspaceAiDockProps) {
  const { open, setOpen, expanded } = useWorkspaceAiChat()

  if (!open) {
    return (
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain",
          className
        )}
      >
        {children}
      </div>
    )
  }

  if (expanded) {
    return (
      <aside
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
          className
        )}
        aria-label={YULA.name}
      >
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-sm font-semibold">
            <AIChatPanelTitle />
          </div>
          <YulaExpandToggle />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={() => setOpen(false)}
            aria-label={YULA.collapseLabel}
          >
            <ChevronRight className="size-4 text-muted-foreground" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AIChatPanel />
        </div>
      </aside>
    )
  }

  return (
    <WorkspaceSidePanelLayout
      open={open}
      onOpenChange={setOpen}
      title={<AIChatPanelTitle />}
      collapseLabel={YULA.collapseLabel}
      headerActions={<YulaExpandToggle />}
      panel={<AIChatPanel />}
      defaultSizePercent={34}
      minSizePercent={32}
      maxSizePercent={50}
      mainMinSizePercent={40}
      mainClassName="overflow-y-auto overscroll-contain"
      panelClassName="border-l bg-background"
      className={cn("min-h-0 flex-1 overflow-hidden", className)}
    >
      {children}
    </WorkspaceSidePanelLayout>
  )
}
