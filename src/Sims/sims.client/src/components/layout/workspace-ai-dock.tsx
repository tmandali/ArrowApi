import * as React from "react"
import {
  AIChatPanel,
  AIChatPanelTitle,
} from "@/components/layout/ai-chat-assistant"
import { YULA } from "@/components/layout/yula-brand-data"
import { Button } from "@/components/ui/button"
import {
  pageContentGutterClass,
  panelCardClass,
  panelHeaderClass,
} from "@/components/layout/panel-chrome"
import { WorkspaceSidePanelLayout } from "@/components/layout/workspace-side-panel"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import { cn } from "@/utils/cn"
import { ChevronRight, Maximize2, Minimize2 } from "lucide-react"

type WorkspaceAiDockProps = {
  children: React.ReactNode
  className?: string
  /** Open Yula as full content instead of the side dock. */
  startExpanded?: boolean
  /** Hide the Yula panel header bar (title / expand / collapse). */
  hideHeader?: boolean
  /** Transparent, borderless panel card (for empty pages). */
  transparent?: boolean
  /** Copilot-style centered intro on the empty chat. */
  centeredIntro?: boolean
  /** Open Yula automatically when the dock mounts. */
  defaultOpen?: boolean
}

function YulaExpandToggle() {
  const { expanded, toggleExpanded, sideDockAllowed } = useWorkspaceAiChat()

  if (!sideDockAllowed) return null

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
 * Open + desktop: resizable side dock (or expanded full content).
 * Open + tablet/phone (<1024px): full content only; always closable.
 */
export function WorkspaceAiDock({
  children,
  className,
  startExpanded = false,
  hideHeader = false,
  transparent = false,
  centeredIntro = false,
  defaultOpen = false,
}: WorkspaceAiDockProps) {
  const { open, setOpen, expanded, setExpanded, sideDockAllowed } =
    useWorkspaceAiChat()

  React.useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen, setOpen])

  React.useEffect(() => {
    if (startExpanded && open) {
      setExpanded(true)
    }
  }, [startExpanded, open, setExpanded])

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

  if (expanded || !sideDockAllowed) {
    return (
      <aside
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent",
          pageContentGutterClass,
          className
        )}
        aria-label={YULA.name}
      >
        <div
          className={cn(
            transparent
              ? "flex min-h-0 flex-col overflow-hidden"
              : panelCardClass,
            "flex-1"
          )}
        >
          {!hideHeader ? (
            <div className={cn(panelHeaderClass, "gap-1")}>
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold tracking-tight text-primary dark:text-sidebar-primary">
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
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AIChatPanel centeredIntro={centeredIntro} />
          </div>
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
      panel={<AIChatPanel centeredIntro={centeredIntro} />}
      defaultSizePercent={34}
      minSizePercent={32}
      maxSizePercent={50}
      mainMinSizePercent={40}
      mainClassName="overflow-y-auto overscroll-contain"
      className={cn("min-h-0 flex-1 overflow-hidden", className)}
    >
      {children}
    </WorkspaceSidePanelLayout>
  )
}
