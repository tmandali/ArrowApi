"use client";

import { usePathname } from "next/navigation";
import * as React from "react"
import { isWorkspaceHomePath } from "@/lib/workspace-paths"
import { useYulaDockStore } from "@/lib/stores/dock"
import {
  WorkspaceAiChatContext,
  type WorkspaceAiChatContextValue,
} from "./workspace-ai-chat-context"

export function WorkspaceAiChatProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const sideDockAllowed = true

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

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenStore(next)
      if (!next) {
        setExpandedStore(false)
      }
    },
    [setOpenStore, setExpandedStore]
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
      expanded: open && expanded,
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
