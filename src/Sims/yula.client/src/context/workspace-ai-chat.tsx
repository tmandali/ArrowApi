"use client";

import { usePathname } from "next/navigation";
import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { isWorkspaceHomePath } from "@/lib/workspace-paths"
import { useYulaDockStore } from "@/lib/stores/dock"
import {
  WorkspaceAiChatContext,
  YULA_SIDE_DOCK_MIN_WIDTH,
  type WorkspaceAiChatContextValue,
} from "./workspace-ai-chat-context"

export function WorkspaceAiChatProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const sideDockAllowed = !useMediaQuery(
    `(max-width: ${YULA_SIDE_DOCK_MIN_WIDTH - 1}px)`
  )

  const open = useYulaDockStore((s) => s.open)
  const setOpenStore = useYulaDockStore((s) => s.setOpen)
  const expanded = useYulaDockStore((s) => s.expanded)
  const setExpandedStore = useYulaDockStore((s) => s.setExpanded)

  const pathname = usePathname()
  const isHomePage = isWorkspaceHomePath(pathname)
  const prevIsHomePageRef = React.useRef(isHomePage)

  React.useEffect(() => {
    if (!prevIsHomePageRef.current && isHomePage) {
      setOpenStore(false)
      setExpandedStore(false)
    }
    prevIsHomePageRef.current = isHomePage
  }, [isHomePage, setOpenStore, setExpandedStore])

  React.useEffect(() => {
    if (!sideDockAllowed && open) {
      setExpandedStore(true)
    }
  }, [sideDockAllowed, open, setExpandedStore])

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenStore(next)
      if (!next) {
        setExpandedStore(false)
        return
      }
      if (!sideDockAllowed) {
        setExpandedStore(true)
      }
    },
    [sideDockAllowed, setOpenStore, setExpandedStore]
  )

  const setExpanded = React.useCallback(
    (next: boolean) => {
      setExpandedStore(next)
    },
    [setExpandedStore]
  )

  const toggleExpanded = React.useCallback(() => {
    setExpandedStore(!expanded)
  }, [expanded, setExpandedStore])

  const value = React.useMemo<WorkspaceAiChatContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen(!open),
      expanded: open && (!sideDockAllowed || expanded),
      setExpanded,
      toggleExpanded,
      sideDockAllowed,
    }),
    [
      open,
      setOpen,
      expanded,
      setExpanded,
      toggleExpanded,
      sideDockAllowed,
    ]
  )

  return (
    <WorkspaceAiChatContext.Provider value={value}>
      {children}
    </WorkspaceAiChatContext.Provider>
  )
}
