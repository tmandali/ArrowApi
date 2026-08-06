import * as React from "react"

import { WorkspaceSearchDialog } from "@/components/layout/workspace-search-dialog"

type WorkspaceSearchContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  registerTrigger: (active: boolean) => void
}

const WorkspaceSearchContext =
  React.createContext<WorkspaceSearchContextValue | null>(null)

export function WorkspaceSearchProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [triggerCount, setTriggerCount] = React.useState(0)

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const registerTrigger = React.useCallback((active: boolean) => {
    setTriggerCount((count) => Math.max(0, count + (active ? 1 : -1)))
  }, [])

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((current) => !current),
      registerTrigger,
    }),
    [open, registerTrigger]
  )

  const hasHeaderTrigger = triggerCount > 0

  return (
    <WorkspaceSearchContext.Provider value={value}>
      {children}
      {!hasHeaderTrigger ? (
        <WorkspaceSearchDialog open={open} onOpenChange={setOpen} />
      ) : null}
    </WorkspaceSearchContext.Provider>
  )
}

export function useWorkspaceSearch() {
  const context = React.useContext(WorkspaceSearchContext)
  if (!context) {
    throw new Error(
      "useWorkspaceSearch must be used within WorkspaceSearchProvider"
    )
  }
  return context
}
