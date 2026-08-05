import { Outlet } from "react-router-dom"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

type AppLayoutProps = {
  fullHeight?: boolean
}

export function AppLayout({ fullHeight = false }: AppLayoutProps) {
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
      </SidebarInset>
    </SidebarProvider>
  )
}
