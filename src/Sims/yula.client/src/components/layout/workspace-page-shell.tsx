"use client";

import type { ReactNode } from "react"
import { ModuleNavPane } from "@/components/layout/module-nav-pane"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { cn } from "@/utils/cn"

type WorkspacePageShellProps = {
  /** Page title content rendered in the header's left cluster (shell breadcrumb lives in AppHeader). */
  title?: ReactNode
  /** Hide the floating header card entirely (e.g. home screens rely on AppHeader). */
  hideHeader?: boolean
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
 * Shared workspace page scaffold: floating header (page title + actions +
 * search) followed by the Yula-aware AI dock around the page body.
 * Workspace search'in ana görünüme dönüşmesi WorkspaceAiDock içinde merkezden
 * yürütülür — bu shell'i kullanmayan ekranlarda da search çalışır.
 */
export function WorkspacePageShell({
  title,
  hideHeader = false,
  actions,
  startExtra,
  searchPlaceholder,
  showSearch = true,
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
      {hideHeader ? null : (
        <WorkspacePageHeader
          showSearch={showSearch}
          searchPlaceholder={searchPlaceholder}
          headerSearch={headerSearch}
          startExtra={startExtra}
          actions={actions}
        >
          {title}
        </WorkspacePageHeader>
      )}
      <WorkspaceAiDock className={contentClassName}>
        <ModuleNavPane>{children}</ModuleNavPane>
      </WorkspaceAiDock>
    </div>
  )
}
