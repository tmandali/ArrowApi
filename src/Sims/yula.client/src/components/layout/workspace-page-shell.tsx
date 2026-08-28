"use client";

import type { ReactNode } from "react"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { WorkspaceSearchMainView } from "@/components/layout/workspace-search-main-view"
import { useWorkspaceSearch } from "@/context/workspace-search-context"
import { cn } from "@/utils/cn"

type WorkspacePageShellProps = {
  /** Breadcrumb content rendered inside the page header. */
  breadcrumb: ReactNode
  /** Toolbar actions (right side of the header). */
  actions?: ReactNode
  /** Extra content in the left cluster after the breadcrumb. */
  startExtra?: ReactNode
  /** Search box placeholder. Defaults to disabled (no search). */
  searchPlaceholder?: string
  showSearch?: boolean
  headerSearch?: ReactNode
  /** Page body rendered inside the AI dock (below the header). */
  children: ReactNode
  className?: string
  /** Extra classes for the inner dock children container. */
  contentClassName?: string
}

/**
 * Shared workspace page scaffold: floating header (breadcrumb + actions +
 * search) followed by the Yula-aware AI dock around the page body.
 * When workspace search is open, main content switches to WorkspaceSearchMainView.
 */
export function WorkspacePageShell({
  breadcrumb,
  actions,
  startExtra,
  searchPlaceholder,
  showSearch = true,
  headerSearch,
  children,
  className,
  contentClassName,
}: WorkspacePageShellProps) {
  const { open } = useWorkspaceSearch()

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden",
        className
      )}
    >
      <WorkspacePageHeader
        showSearch={showSearch}
        searchPlaceholder={searchPlaceholder}
        headerSearch={headerSearch}
        startExtra={startExtra}
        actions={actions}
      >
        {breadcrumb}
      </WorkspacePageHeader>
      <WorkspaceAiDock className={contentClassName}>
        {open ? <WorkspaceSearchMainView /> : children}
      </WorkspaceAiDock>
    </div>
  )
}
