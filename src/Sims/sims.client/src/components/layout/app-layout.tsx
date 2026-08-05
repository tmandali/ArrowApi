import { Outlet } from "react-router-dom"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceAiChatProvider } from "@/context/workspace-ai-chat"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

type AppLayoutProps = {
  fullHeight?: boolean
}

export function AppLayout({ fullHeight = false }: AppLayoutProps) {
  return (
    <SidebarProvider
      className={fullHeight ? "h-svh overflow-hidden" : undefined}
    >
      <AppSidebar />
      <WorkspaceAiChatProvider>
        <SidebarInset
          className={
            fullHeight
              ? "min-h-0 overflow-hidden bg-background"
              : "bg-background"
          }
        >
          <div
            className={
              fullHeight
                ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                : "flex min-h-0 min-w-0 flex-1 flex-col"
            }
          >
            <Outlet />
          </div>
        </SidebarInset>
      </WorkspaceAiChatProvider>
    </SidebarProvider>
  )
}
