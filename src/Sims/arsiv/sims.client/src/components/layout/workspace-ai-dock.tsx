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
import { YulaHistorySidebar } from "@/components/layout/yula-history-sidebar"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import { useAgentBridgeStore } from "@/hooks/useAgentBridge"
import { cn } from "@/utils/cn"
import { ChevronRight, History, Maximize2, Minimize2, SquarePen } from "lucide-react"

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

function YulaNewChatButton() {
  const newConversation = useAgentBridgeStore((s) => s.newConversation)
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={newConversation}
      title="Yeni Sohbet Başlat"
      aria-label="Yeni Sohbet Başlat"
    >
      <SquarePen className="size-3.5" />
    </Button>
  )
}

export function YulaHistoryToggle() {
  const isHistoryOpen = useAgentBridgeStore((s) => s.isHistoryOpen)
  const toggleHistory = useAgentBridgeStore((s) => s.toggleHistory)

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "size-7 shrink-0 transition-colors",
        isHistoryOpen
          ? "text-primary bg-primary/10 dark:bg-primary/20"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={toggleHistory}
      title={isHistoryOpen ? "Sohbet Geçmişini Gizle" : "Sohbet Geçmişini Göster"}
      aria-label={isHistoryOpen ? "Sohbet Geçmişini Gizle" : "Sohbet Geçmişini Göster"}
    >
      <History className="size-3.5" />
    </Button>
  )
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
  const isHistoryOpen = useAgentBridgeStore((s) => s.isHistoryOpen)

  const mountedRef = React.useRef(false)
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      if (defaultOpen) {
        setOpen(true)
      }
      if (startExpanded) {
        setExpanded(true)
      }
    }
  }, [defaultOpen, startExpanded, setOpen, setExpanded])

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

  const isMainMode = expanded || !sideDockAllowed || startExpanded

  if (isMainMode) {
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
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold tracking-tight text-primary dark:text-sidebar-primary">
                <YulaHistoryToggle />
                <AIChatPanelTitle />
              </div>
              <YulaNewChatButton />
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
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {isHistoryOpen ? <YulaHistorySidebar /> : null}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {hideHeader && !isHistoryOpen ? (
                <div className="absolute left-3 top-3 z-20">
                  <YulaHistoryToggle />
                </div>
              ) : null}
              <AIChatPanel centeredIntro={centeredIntro} />
            </div>
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
      headerActions={
        <div className="flex items-center gap-0.5">
          <YulaNewChatButton />
          <YulaExpandToggle />
        </div>
      }
      panel={<AIChatPanel centeredIntro={centeredIntro} />}
      defaultSizePercent={32}
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

