import { Outlet } from "react-router-dom"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceAiChatProvider } from "@/context/workspace-ai-chat"
import { WorkspaceSearchProvider } from "@/context/workspace-search"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

type AppLayoutProps = {
  /** @deprecated All app shells are viewport-locked; kept for call-site compatibility. */
  fullHeight?: boolean
}

/**
 * Viewport-locked shell: header stays put, page/Yula scroll lives below it.
 * Prevents the main scrollbar from running through sticky header chrome.
 */
export function AppLayout({ fullHeight: _fullHeight = false }: AppLayoutProps) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <WorkspaceSearchProvider>
        <AppSidebar />
        <WorkspaceAiChatProvider>
          <SidebarInset className="min-h-0 overflow-hidden bg-background bg-gradient-to-b from-primary/[0.05] via-background to-orange-500/[0.06] dark:from-primary/15 dark:via-background dark:to-orange-500/10">
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </div>
          </SidebarInset>
        </WorkspaceAiChatProvider>
      </WorkspaceSearchProvider>
    </SidebarProvider>
  )
}
