import * as React from "react"
import { useLocation } from "react-router-dom"
import { useMediaQuery } from "@/hooks/use-media-query"
import { isWorkspaceHomePath } from "@/lib/empty-module"
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
  const { pathname } = useLocation()
  const isHomePage = isWorkspaceHomePath(pathname)
  const prevIsHomePageRef = React.useRef(isHomePage)

  React.useEffect(() => {
    if (prevIsHomePageRef.current && !isHomePage) {
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
      if (!sideDockAllowed && open && !next) return
      setExpandedState(next)
    },
    [sideDockAllowed, open]
  )

  const toggleExpanded = React.useCallback(() => {
    setExpandedState((current) => {
      const next = !current
      if (!sideDockAllowed && open && !next) return current
      return next
    })
  }, [sideDockAllowed, open])

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
