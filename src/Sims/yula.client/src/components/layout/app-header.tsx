"use client";

import { AppBreadcrumb } from "@/components/layout/app-breadcrumb"
import { NavUser } from "@/components/layout/nav-user"
import { WorkspaceNotificationPopover } from "@/components/layout/workspace-notification-popover"
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { cn } from "@/utils/cn"

const user = {
  name: "Timur MANDALI",
  email: "timur.mandali@lcwaikiki.com",
  avatar: "",
}

/**
 * Global top bar right of the workspace icon rail, structurally fixed in the
 * viewport-locked shell: pathname breadcrumb, centered search, notifications
 * + user on the right.
 */
export function AppHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "relative z-20 flex h-(--header-height) shrink-0 items-center gap-2 px-2 text-xs",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <AppBreadcrumb />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <WorkspaceSearchTrigger />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <WorkspaceNotificationPopover />
        <NavUser user={user} />
      </div>
    </header>
  )
}
