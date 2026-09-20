"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { GlobalNavDrawer } from "@/components/layout/global-nav-drawer";
import { ModuleSidebar } from "@/components/layout/module-sidebar";
import { RouteTransitionIndicator } from "@/components/layout/route-transition-indicator";
import { YulaFullscreenHost } from "@/components/layout/fullscreen-overlay/yula-fullscreen-host";
import { WorkspaceSearchProvider } from "@/context/workspace-search";
import { useCompanyStore } from "@/store/slices/company-store";
import { SidebarProvider } from "@/components/ui/sidebar";
import { isDomainWorkspacePath } from "@/lib/workspace-registry";
import { cn } from "@/utils/cn";

/**
 * Google Cloud Console style viewport-locked shell:
 * 1. Top: Full-width AppHeader with hamburger, brand, workspace dropdown, search, and user tools.
 * 2. Hamburger Drawer: GlobalNavDrawer (overlay sheet with all workspaces & system tools).
 * 3. Below header: Contextual ModuleSidebar (rendered only for domain workspaces)
 *    and main content area with WorkspaceAiChatProvider.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const hasSubNav = isDomainWorkspacePath(pathname);
  const activeCompanyId = useCompanyStore((state) => state.activeCompanyId);

  return (
    <div
      className="flex h-svh w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-colors duration-200"
      style={{ "--header-height": "3rem" } as React.CSSProperties}
    >
      <WorkspaceSearchProvider>
        {/* Full-width Shell Header across top */}
        <AppHeader />
        {/* Global Mega Drawer triggered by hamburger */}
        <GlobalNavDrawer />

        {/* Below Shell Header: Contextual Module Sidebar + Content Box */}
        <SidebarProvider
          defaultOpen={true}
          className="flex min-h-0 flex-1 w-full overflow-hidden bg-sidebar"
        >
          <div className="flex min-h-0 min-w-0 flex-1 w-full overflow-hidden bg-sidebar">
            {hasSubNav && <ModuleSidebar />}
            {/* Content Frame: Üst köşeleri kavisli (rounded-t-2xl), alttan tam boy uzanan tuval */}
            <main
              className={cn(
                "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-t-2xl border-t border-l border-r border-border dark:border-[#232734] bg-background [background-image:var(--app-bg-gradient)] shadow-xs transition-colors duration-200",
                hasSubNav ? "mr-2" : "mx-2"
              )}
            >
              {/*
                Şirket geçiş ANAHTARI yalnızca SAYFA İÇERİĞİNDE yaşar:
                header (search kutusu, bildirimler, NavUser), WorkspaceSearch/AiChat
                provider'ları ve küresel job/bildirim altyapısı HAYATTA KALIR —
                kutu remount edilmez, open/query durumu sıfırlanmaz (zıplama yok).
                Anahtar değişince yalnız paneller yeniden mount olup kendi
                verisini (X-Company-Id) yeniler; 180ms fade-in sert
                veri→iskelet değişimini yumuşatır.
              */}
              <div
                key={activeCompanyId ?? "no-company"}
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden animate-page-swap"
              >
                {children}
              </div>
              {/* Rotalı geçişte ince üst şerit — boş alan flaşı yerine geçiş sinyali */}
              <RouteTransitionIndicator />
              {/* Tam ekran overlay: Sol nav ile AppHeader arasında kalıp tüm içeriğe yayılır */}
              <YulaFullscreenHost />
            </main>
          </div>
        </SidebarProvider>
      </WorkspaceSearchProvider>
    </div>
  );
}
