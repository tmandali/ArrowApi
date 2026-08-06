import type { ReactNode } from "react"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/utils/cn"

type WorkspacePageHeaderProps = {
  children: ReactNode
  actions?: ReactNode
  className?: string
  /** Extra content in the left cluster after the separator (e.g. badge). */
  startExtra?: ReactNode
}

/**
 * Shared page header: sidebar toggle + title/breadcrumb slot + actions.
 */
export function WorkspacePageHeader({
  children,
  actions,
  className,
  startExtra,
}: WorkspacePageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 text-xs backdrop-blur",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        {children}
        {startExtra}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
