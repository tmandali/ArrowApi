"use client";

import { useRouter } from "next/navigation"
import { NavUser } from "@/components/layout/nav-user"
import { WorkspaceNotificationPopover } from "@/components/layout/workspace-notification-popover"
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  workspaceDashboardPathByWorkspace,
  workspaceNameById,
} from "@/lib/workspace-nav"
import { YULA } from "@/components/layout/yula-brand-data"
import { cn } from "@/utils/cn"

const user = {
  name: "Timur MANDALI",
  email: "timur.mandali@lcwaikiki.com",
  avatar: "",
}

/**
 * Global top bar right of the workspace icon rail, structurally fixed in the
 * viewport-locked shell: brand + active workspace on the left, centered
 * search, notifications + user on the right.
 */
export function AppHeader({ className }: { className?: string }) {
  const router = useRouter()
  const activeWorkspaceId = useActiveWorkspaceId()
  const workspaceName = activeWorkspaceId
    ? workspaceNameById[activeWorkspaceId]
    : undefined

  // "Yula <Workspace>" marka satırı → modül ana sayfası (dashboard).
  // Aktif workspace yoksa Yula ana ekranına döner.
  const handleBrandClick = () => {
    router.push(
      activeWorkspaceId
        ? workspaceDashboardPathByWorkspace[activeWorkspaceId]
        : "/"
    )
  }

  return (
    <header
      className={cn(
        "relative z-20 flex h-(--header-height) shrink-0 items-center gap-2 px-2 text-xs",
        className
      )}
    >
      <button
        type="button"
        onClick={handleBrandClick}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left transition-opacity hover:opacity-80"
        title="Modül ana sayfası"
      >
        <span
          className="shrink-0 text-sm font-semibold tracking-tight text-primary dark:text-sidebar-primary"
        >
          {YULA.name}
        </span>
        {workspaceName ? (
          <span
            className="min-w-0 truncate text-sm font-semibold tracking-tight text-orange-600 dark:text-orange-400"
          >
            {workspaceName}
          </span>
        ) : null}
      </button>
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
