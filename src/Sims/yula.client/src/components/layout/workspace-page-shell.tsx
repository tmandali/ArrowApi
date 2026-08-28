"use client";

import type { ReactNode } from "react"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
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
 */
export function WorkspacePageShell({
  breadcrumb,
  actions,
  startExtra,
  searchPlaceholder,
  showSearch = false,
  headerSearch,
  children,
  className,
  contentClassName,
}: WorkspacePageShellProps) {
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
      <WorkspaceAiDock className={contentClassName}>{children}</WorkspaceAiDock>
    </div>
  )
}
