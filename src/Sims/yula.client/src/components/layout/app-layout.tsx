"use client";

import * as React from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceAiChatProvider } from "@/context/workspace-ai-chat"
import { WorkspaceSearchProvider } from "@/context/workspace-search"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/**
 * Viewport-locked shell: header stays put, page/Yula scroll lives below it.
 * Next karşılığı: Outlet yerine children — içerik catch-all sayfadan gelir.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <WorkspaceSearchProvider>
        <AppSidebar />
        <WorkspaceAiChatProvider>
          <SidebarInset className="min-h-0 overflow-hidden bg-background bg-gradient-to-b from-primary/[0.05] via-background to-orange-500/[0.06] dark:from-primary/15 dark:via-background dark:to-orange-500/10">
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </SidebarInset>
        </WorkspaceAiChatProvider>
      </WorkspaceSearchProvider>
    </SidebarProvider>
  )
}
