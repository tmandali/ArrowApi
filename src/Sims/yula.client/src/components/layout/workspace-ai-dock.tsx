"use client";

import * as React from "react"
import { usePathname } from "next/navigation"
import { isWorkspaceHomePath, isConversationOnScreen } from "@/lib/workspace-paths"
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
import { useYulaChat } from "@/hooks/use-yula-chat"
import { useChatsStore } from "@/lib/stores/chats"
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
  const { newConversation } = useYulaChat()
  const setHistoryOpen = useChatsStore((s) => s.setHistoryOpen)
  const setSearchingHistory = useChatsStore((s) => s.setSearchingHistory)

  const handleNew = () => {
    setSearchingHistory(false)
    setHistoryOpen(false)
    newConversation()
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={handleNew}
      title="Yeni Sohbet Başlat"
      aria-label="Yeni Sohbet Başlat"
    >
      <SquarePen className="size-3.5" />
    </Button>
  )
}

export function YulaScreenHistoryButton() {
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const historyFilter = useChatsStore((s) => s.historyFilter)
  const toggleHistory = useChatsStore((s) => s.toggleHistory)
  const conversations = useChatsStore((s) => s.conversations)
  const pathname = usePathname()

  const screenCount = React.useMemo(() => {
    return conversations.filter((c) => isConversationOnScreen(c.pathname, pathname)).length
  }, [conversations, pathname])

  const isActive = isHistoryOpen && historyFilter === "screen"

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "relative size-7 shrink-0 transition-colors",
        isActive
          ? "text-primary bg-primary/10 dark:bg-primary/20"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => toggleHistory("screen")}
      title={`Bu Ekranın Yazışmaları (${screenCount})`}
      aria-label={`Bu Ekranın Yazışmaları (${screenCount})`}
    >
      <History className="size-3.5" />
      {screenCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8.5px] font-bold text-primary-foreground">
          {screenCount > 9 ? "9+" : screenCount}
        </span>
      ) : null}
    </Button>
  )
}

export function YulaHistoryToggle() {
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const historyFilter = useChatsStore((s) => s.historyFilter)
  const toggleHistory = useChatsStore((s) => s.toggleHistory)

  const isActive = isHistoryOpen && historyFilter === "all"

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "size-7 shrink-0 transition-colors",
        isActive
          ? "text-primary bg-primary/10 dark:bg-primary/20"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => toggleHistory("all")}
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
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const pathname = usePathname()
  const isHomePage = isWorkspaceHomePath(pathname)

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

  if (isHomePage || !open) {
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
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-0.5 py-1 text-left text-sm font-semibold tracking-tight text-primary dark:text-sidebar-primary transition-colors hover:bg-muted/40"
                aria-label={YULA.collapseLabel}
              >
                <AIChatPanelTitle />
              </button>
              <YulaScreenHistoryButton />
              <YulaNewChatButton />
              <YulaExpandToggle />
            </div>
          ) : null}
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <AIChatPanel mode="main" centeredIntro={centeredIntro} />
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
          <YulaScreenHistoryButton />
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

