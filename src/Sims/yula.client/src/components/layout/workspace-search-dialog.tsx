"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WorkspaceSearchPanel } from "@/components/layout/workspace-search-panel"
import { useWorkspaceSearchNavigate } from "@/components/layout/workspace-search-hooks"

type WorkspaceSearchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Fallback modal search when no header search box is mounted. */
export function WorkspaceSearchDialog({
  open,
  onOpenChange,
}: WorkspaceSearchDialogProps) {
  const handleSelect = useWorkspaceSearchNavigate(onOpenChange)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search Workspace</DialogTitle>
        <DialogDescription>
          Quick search for pages and commands in the current workspace
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0"
        showCloseButton={false}
      >
        <WorkspaceSearchPanel
          onSelect={handleSelect}
          className="rounded-none"
        />
      </DialogContent>
    </Dialog>
  )
}
