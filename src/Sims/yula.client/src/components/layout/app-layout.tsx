"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { GlobalNavDrawer } from "@/components/layout/global-nav-drawer";
import { ModuleSidebar } from "@/components/layout/module-sidebar";
import { RouteTransitionIndicator } from "@/components/layout/route-transition-indicator";
import { WorkspaceAiChatProvider } from "@/context/workspace-ai-chat";
import { WorkspaceSearchProvider } from "@/context/workspace-search";
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
          <WorkspaceAiChatProvider>
            <div className="flex min-h-0 min-w-0 flex-1 w-full overflow-hidden bg-sidebar">
              {hasSubNav && <ModuleSidebar />}
              {/* Content Frame: Üst köşeleri kavisli (rounded-t-2xl), alttan tam boy uzanan tuval */}
              <main
                className={cn(
                  "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-t-2xl border-t border-l border-r border-border dark:border-[#232734] bg-background shadow-xs transition-colors duration-200",
                  hasSubNav ? "mr-2" : "mx-2"
                )}
              >
                <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  {children}
                </div>
                {/* Rotalı geçişte ince üst şerit — boş alan flaşı yerine geçiş sinyali */}
                <RouteTransitionIndicator />
              </main>
            </div>
          </WorkspaceAiChatProvider>
        </SidebarProvider>
      </WorkspaceSearchProvider>
    </div>
  );
}
