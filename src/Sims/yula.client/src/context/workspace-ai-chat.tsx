"use client";

import { usePathname } from "next/navigation";
import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { isWorkspaceHomePath } from "@/lib/workspace-paths"
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
  const [open, setOpenState] = React.useState(false)
  const [expanded, setExpandedState] = React.useState(false)

  // Never carry the home page's auto-opened Yula onto a real/404 page.
  const pathname = usePathname()
  const isHomePage = isWorkspaceHomePath(pathname)
  const prevIsHomePageRef = React.useRef(isHomePage)

  React.useEffect(() => {
    if (prevIsHomePageRef.current && !isHomePage) {
      setOpenState(true)
      setExpandedState(false)
    } else if (!prevIsHomePageRef.current && isHomePage) {
      setOpenState(false)
      setExpandedState(false)
    }
    prevIsHomePageRef.current = isHomePage
  }, [isHomePage])

  React.useEffect(() => {
    if (!sideDockAllowed && open) {
      setExpandedState(true)
    }
  }, [sideDockAllowed, open])

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next)
      if (!next) {
        setExpandedState(false)
        return
      }
      if (!sideDockAllowed) {
        setExpandedState(true)
      }
    },
    [sideDockAllowed]
  )

  const setExpanded = React.useCallback(
    (next: boolean) => {
      setExpandedState((current) => {
        if (!sideDockAllowed && !next) return current
        return next
      })
    },
    [sideDockAllowed]
  )

  const toggleExpanded = React.useCallback(() => {
    setExpandedState((current) => {
      const next = !current
      if (!sideDockAllowed && !next) return current
      return next
    })
  }, [sideDockAllowed])

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
