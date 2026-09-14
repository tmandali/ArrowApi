"use client";

import * as React from "react";
import { AppHeader } from "@/components/layout/app-header";
import { GlobalNavDrawer } from "@/components/layout/global-nav-drawer";
import { ModuleSidebar } from "@/components/layout/module-sidebar";
import { RouteTransitionIndicator } from "@/components/layout/route-transition-indicator";
import { WorkspaceAiChatProvider } from "@/context/workspace-ai-chat";
import { WorkspaceSearchProvider } from "@/context/workspace-search";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * Google Cloud Console style viewport-locked shell:
 * 1. Top: Full-width AppHeader with hamburger, brand, workspace dropdown, search, and user tools.
 * 2. Hamburger Drawer: GlobalNavDrawer (overlay sheet with all workspaces & system tools).
 * 3. Below header: SidebarProvider wrapping contextual ModuleSidebar (collapsible="icon")
 *    and main content area with WorkspaceAiChatProvider.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="flex h-svh w-full flex-col overflow-hidden bg-background bg-gradient-to-b from-primary/[0.05] via-background to-orange-500/[0.06] dark:from-primary/15 dark:via-background dark:to-orange-500/10"
      style={{ "--header-height": "3rem" } as React.CSSProperties}
    >
      <WorkspaceSearchProvider>
        {/* Full-width Shell Header across top */}
        <AppHeader />
        {/* Global Mega Drawer triggered by hamburger */}
        <GlobalNavDrawer />

        {/* Below Shell Header: Contextual Module Sidebar + Content */}
        <SidebarProvider
          defaultOpen={true}
          className="flex min-h-0 flex-1 w-full overflow-hidden"
        >
          <WorkspaceAiChatProvider>
            <div className="flex min-h-0 min-w-0 flex-1 w-full overflow-hidden">
              <ModuleSidebar />
              <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
