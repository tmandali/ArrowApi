import * as React from "react"

/**
 * Below `lg` (1024px) the side dock is too narrow for page + Yula.
 * Tablet/phone: open Yula only as full content; always closable.
 */
export const YULA_SIDE_DOCK_MIN_WIDTH = 1024

export type WorkspaceAiChatContextValue = {
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

export const WorkspaceAiChatContext =
  React.createContext<WorkspaceAiChatContextValue | null>(null)

export function useWorkspaceAiChat() {
  const context = React.useContext(WorkspaceAiChatContext)
  if (!context) {
    throw new Error(
      "useWorkspaceAiChat must be used within WorkspaceAiChatProvider"
    )
  }
  return context
}
