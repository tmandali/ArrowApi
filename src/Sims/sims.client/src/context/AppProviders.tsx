import { ThemeProvider } from "@/context/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkspaceNotificationsProvider } from "@/context/workspace-notifications"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <WorkspaceNotificationsProvider>
          {children}
        </WorkspaceNotificationsProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
