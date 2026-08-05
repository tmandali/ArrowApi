import { Outlet } from "react-router-dom"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

type AppLayoutProps = {
  fullHeight?: boolean
  showChat?: boolean
}

export function AppLayout({
  fullHeight = false,
  showChat = true,
}: AppLayoutProps) {
  return (
    <SidebarProvider className={fullHeight ? "h-svh overflow-hidden" : undefined}>
      <AppSidebar />
      <SidebarInset
        className={
          fullHeight
            ? "min-h-0 overflow-hidden bg-background"
            : "bg-background"
        }
      >
        <Outlet />
        {showChat ? <AIChatAssistant /> : null}
      </SidebarInset>
    </SidebarProvider>
  )
}
