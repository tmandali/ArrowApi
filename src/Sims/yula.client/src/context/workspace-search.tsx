"use client";

import * as React from "react"

import { WorkspaceSearchDialog } from "@/components/layout/workspace-search-dialog"
import {
  WorkspaceSearchContext,
  type WorkspaceSearchContextValue,
} from "./workspace-search-context"

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

  const value = React.useMemo<WorkspaceSearchContextValue>(
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
