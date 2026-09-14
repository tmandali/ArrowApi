"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import { NavUser } from "@/components/layout/nav-user"
import { WorkspaceNotificationPopover } from "@/components/layout/workspace-notification-popover"
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { usePagePanelContext } from "@/context/page-panel-context"
import { Menu } from "lucide-react"
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
  const tMenu = useTranslations("ModuleNav")
  const activeWorkspaceId = useActiveWorkspaceId()
  // Ana nav menü çekmecesi (overlay) — global "module-nav" paneli.
  // Hamburger kaldırıldı; menüyü AppHeader'daki başlık açıp kapatır.
  const { openById, setOpen } = usePagePanelContext()
  const navOpen = openById["module-nav"] ?? false
  const menuLabel = navOpen ? tMenu("close_menu") : tMenu("open_menu_short")
  // Workspace adı dil takımla çözülür (`AppHeader.workspace_<id>`) —
  // registry `name`'i (English) header için yerini almıştır.
  const workspaceName = activeWorkspaceId
    ? t(`workspace_${activeWorkspaceId}` as `workspace_${WorkspaceId}`)
    : undefined

  // "Yula <Workspace>" marka satırı ana nav menüyü açıp kapatır.
  const handleBrandClick = () => {
    setOpen("module-nav", !navOpen)
  }

  return (
    <header
      className={cn(
        "relative z-20 flex h-(--header-height) shrink-0 items-center gap-2 px-2 text-xs",
        className
      )}
    >
      {/* Başlık: ana nav menüyü overlay çekmece olarak açıp kapatır. */}
      <button
        type="button"
        data-slot="nav-menu-toggle"
        onClick={handleBrandClick}
        title={menuLabel}
        aria-label={menuLabel}
        aria-pressed={navOpen}
        aria-expanded={navOpen}
        className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-hidden text-left transition-opacity hover:opacity-80 cursor-pointer"
      >
        <Menu className="size-4 shrink-0 text-primary dark:text-sidebar-primary" aria-hidden />
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
      <div className="flex shrink-0 items-center justify-end gap-2">
        <WorkspaceNotificationPopover />
        <NavUser />
      </div>
    </header>
  )
}
