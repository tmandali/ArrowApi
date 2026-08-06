import * as React from "react"

type WorkspaceAiChatContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** Full content area (between header and nav). Off by default — side dock opens first. */
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  toggleExpanded: () => void
}

const WorkspaceAiChatContext =
  React.createContext<WorkspaceAiChatContextValue | null>(null)

export function WorkspaceAiChatProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpenState] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  const setOpen = React.useCallback((next: boolean) => {
    setOpenState(next)
    if (!next) setExpanded(false)
  }, [])

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen(!open),
      expanded,
      setExpanded,
      toggleExpanded: () => setExpanded((current) => !current),
    }),
    [open, setOpen, expanded]
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
