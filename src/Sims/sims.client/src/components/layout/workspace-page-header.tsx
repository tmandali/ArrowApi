import type { ReactNode } from "react"

import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/utils/cn"

type WorkspacePageHeaderProps = {
  children: ReactNode
  actions?: ReactNode
  className?: string
  /** Extra content in the left cluster after the separator (e.g. badge). */
  startExtra?: ReactNode
  /** Show the workspace search box in the header. Defaults to true. */
  showSearch?: boolean
  searchPlaceholder?: string
}

/**
 * Shared page header: sidebar toggle + title/breadcrumb slot + search + actions.
 */
export function WorkspacePageHeader({
  children,
  actions,
  className,
  startExtra,
  showSearch = true,
  searchPlaceholder,
}: WorkspacePageHeaderProps) {
  return (
    <header
      className={cn(
        "z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 text-xs",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        {children}
        {startExtra}
      </div>

      {showSearch ? (
        <WorkspaceSearchTrigger
          className="shrink-0"
          placeholder={searchPlaceholder}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {actions}
      </div>
    </header>
  )
}
