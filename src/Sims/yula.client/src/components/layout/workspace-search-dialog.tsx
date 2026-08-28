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

/** Central modal search dialog opened on ⌘K or header search trigger click. */
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
        className="top-[15%] translate-y-0 max-w-lg sm:max-w-xl md:max-w-2xl overflow-hidden rounded-xl p-0 border-border/40 shadow-2xl"
        showCloseButton={false}
      >
        <WorkspaceSearchPanel
          onSelect={handleSelect}
          className="rounded-xl border-0"
        />
      </DialogContent>
    </Dialog>
  )
}
