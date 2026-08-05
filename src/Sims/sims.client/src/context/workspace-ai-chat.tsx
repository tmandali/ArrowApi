import * as React from "react"

type WorkspaceAiChatContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const WorkspaceAiChatContext =
  React.createContext<WorkspaceAiChatContextValue | null>(null)

export function WorkspaceAiChatProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((current) => !current),
    }),
    [open]
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
