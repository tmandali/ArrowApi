import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"

/**
 * Below `lg` (1024px) the side dock is too narrow for page + Yula.
 * Tablet/phone: open Yula only as full content; always closable.
 */
export const YULA_SIDE_DOCK_MIN_WIDTH = 1024

type WorkspaceAiChatContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** Full content area (between header and nav). Off by default — side dock opens first. */
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  toggleExpanded: () => void
  /** False on tablet/phone — only full-content mode is available. */
  sideDockAllowed: boolean
}

const WorkspaceAiChatContext =
  React.createContext<WorkspaceAiChatContextValue | null>(null)

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

  const value = React.useMemo(
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

export function useWorkspaceAiChat() {
  const context = React.useContext(WorkspaceAiChatContext)
  if (!context) {
    throw new Error(
      "useWorkspaceAiChat must be used within WorkspaceAiChatProvider"
    )
  }
  return context
}
