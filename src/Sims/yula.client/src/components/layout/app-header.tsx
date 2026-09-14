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
        "relative z-30 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-3 text-xs backdrop-blur-md",
        className
      )}
    >
      {/* Sol: Hamburger + Logo + Workspace Seçici */}
      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          data-slot="global-nav-toggle"
          onClick={handleHamburgerClick}
          title={menuLabel}
          aria-label={menuLabel}
          aria-pressed={drawerOpen}
          aria-expanded={drawerOpen}
          className="flex size-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <Menu className="size-4.5 shrink-0" aria-hidden />
        </button>

        <Link
          href="/"
          className="flex items-center gap-1.5 transition-opacity hover:opacity-85"
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-primary dark:text-sidebar-primary">
            <YulaMarkIcon />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {YULA.name}
          </span>
        </Link>

        {/* GCP project picker tarzı workspace dropdown */}
        <WorkspaceSelectorDropdown />
      </div>

      {/* Orta: Global Arama Çubuğu */}
      <div className="flex min-w-0 max-w-xl flex-1 items-center justify-center px-2">
        <WorkspaceSearchTrigger />
      </div>

      {/* Sağ: Bildirimler + Kullanıcı Menüsü */}
      <div className="flex shrink-0 items-center justify-end gap-2">
        <WorkspaceNotificationPopover />
        <NavUser />
      </div>
    </header>
  );
}
