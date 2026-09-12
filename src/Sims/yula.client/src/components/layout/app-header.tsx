"use client";

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { NavUser } from "@/components/layout/nav-user"
import { WorkspaceNotificationPopover } from "@/components/layout/workspace-notification-popover"
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  workspaceRootPathByWorkspace,
} from "@/lib/workspace-nav"
import { YULA } from "@/components/layout/yula-brand-data"
import { cn } from "@/utils/cn"
import type { WorkspaceId } from "@/types"

/**
 * Global top bar right of the workspace icon rail, structurally fixed in the
 * viewport-locked shell: brand + active workspace on the left, centered
 * search, notifications + user on the right.
 */
export function AppHeader({ className }: { className?: string }) {
  const t = useTranslations("AppHeader")
  const router = useRouter()
  const activeWorkspaceId = useActiveWorkspaceId()
  // Workspace adı dil takımla çözülür (`AppHeader.workspace_<id>`) —
  // registry `name`'i (English) header için yerini almıştır.
  const workspaceName = activeWorkspaceId
    ? t(`workspace_${activeWorkspaceId}` as `workspace_${WorkspaceId}`)
    : undefined

  // "Yula <Workspace>" marka satırı → her zaman workspace ana sayfası (landing).
  // Aktif workspace yoksa Yula ana ekranına döner.
  const handleBrandClick = () => {
    router.push(
      activeWorkspaceId
        ? workspaceRootPathByWorkspace[activeWorkspaceId] ?? "/"
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
        title={t("module_home")}
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
        <NavUser />
      </div>
    </header>
  )
}
