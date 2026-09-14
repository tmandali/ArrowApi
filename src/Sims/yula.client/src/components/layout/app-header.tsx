"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { NavUser } from "@/components/layout/nav-user";
import { WorkspaceNotificationPopover } from "@/components/layout/workspace-notification-popover";
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger";
import { WorkspaceSelectorDropdown } from "@/components/layout/workspace-selector-dropdown";
import { usePagePanelContext } from "@/context/page-panel-context";
import { YULA } from "@/components/layout/yula-brand-data";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { cn } from "@/utils/cn";

/**
 * Shell Header: Full-width top bar across the top of the viewport (Google Cloud Console pattern).
 * Left: Hamburger button (opens Global Nav Drawer) + Yula Brand + Workspace Selector dropdown.
 * Center: Global Search trigger.
 * Right: Notifications + NavUser.
 */
export function AppHeader({ className }: { className?: string }) {
  const tMenu = useTranslations("ModuleNav");
  const { openById, setOpen } = usePagePanelContext();
  const drawerOpen = openById["global-drawer"] ?? false;
  const menuLabel = drawerOpen ? tMenu("close_menu") : tMenu("open_menu_short");

  const handleHamburgerClick = () => {
    setOpen("global-drawer", !drawerOpen);
  };

  return (
    <header
      className={cn(
        "relative z-30 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-3 bg-sidebar text-sidebar-foreground pl-0 pr-3 text-xs transition-colors duration-200",
        className
      )}
    >
      {/* Sol: Hamburger + Logo + Workspace Seçici */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Hamburger butonu: Sol rail ikon sütunuyla (48px / w-12) kusursuz dikey hizada */}
        <div className="flex size-12 shrink-0 items-center justify-center">
          <button
            type="button"
            data-slot="global-nav-toggle"
            onClick={handleHamburgerClick}
            title={menuLabel}
            aria-label={menuLabel}
            aria-pressed={drawerOpen}
            aria-expanded={drawerOpen}
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
          >
            <Menu className="size-4.5 shrink-0" aria-hidden />
          </button>
        </div>

        <Link
          href="/"
          className="flex items-center gap-1.5 transition-opacity hover:opacity-85 mr-1.5"
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-primary dark:text-sidebar-primary">
            <YulaMarkIcon />
          </span>
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            {YULA.name}
          </span>
        </Link>

        {/* GCP project picker tarzı workspace dropdown */}
        <WorkspaceSelectorDropdown />
      </div>

      {/* Orta: Global Arama Çubuğu */}
      <div className="flex min-w-0 max-w-xl flex-1 items-center justify-center px-2">
        <WorkspaceSearchTrigger className="max-w-md border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground placeholder:text-muted-foreground focus-within:border-ring focus-within:ring-ring/20 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/50" />
      </div>

      {/* Sağ: Bildirimler + Kullanıcı Menüsü */}
      <div className="flex shrink-0 items-center justify-end gap-2 text-sidebar-foreground/80">
        <WorkspaceNotificationPopover />
        <NavUser />
      </div>
    </header>
  );
}
