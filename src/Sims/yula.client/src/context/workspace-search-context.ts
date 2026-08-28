import * as React from "react"

export type WorkspaceSearchContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  registerTrigger: (active: boolean) => void
  query: string
  setQuery: (query: string) => void
}

export const WorkspaceSearchContext =
  React.createContext<WorkspaceSearchContextValue | null>(null)

export function useWorkspaceSearch() {
  const context = React.useContext(WorkspaceSearchContext)
  if (!context) {
    throw new Error(
      "useWorkspaceSearch must be used within WorkspaceSearchProvider"
    )
  }
  return context
}
