"use client";

import * as React from "react"
import { AppHeader } from "@/components/layout/app-header"
import { WorkspaceIconRail } from "@/components/layout/workspace-icon-rail"
import { WorkspaceAiChatProvider } from "@/context/workspace-ai-chat"
import { WorkspaceSearchProvider } from "@/context/workspace-search"

/**
 * Viewport-locked shell: workspace icon rail spans the full viewport height
 * (Yula mark on top); header, page/Yula scroll live to the right of it.
 * Next karşılığı: Outlet yerine children — içerik catch-all sayfadan gelir.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="flex h-svh overflow-hidden bg-background bg-gradient-to-b from-primary/[0.05] via-background to-orange-500/[0.06] dark:from-primary/15 dark:via-background dark:to-orange-500/10"
      style={{ "--header-height": "3rem" } as React.CSSProperties}
    >
      <WorkspaceSearchProvider>
        <WorkspaceIconRail />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader />
          <WorkspaceAiChatProvider>
            <main className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
            </main>
          </WorkspaceAiChatProvider>
        </div>
      </WorkspaceSearchProvider>
    </div>
  )
}
