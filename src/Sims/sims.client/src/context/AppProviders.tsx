import { ThemeProvider } from "@/context/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkspaceNotificationsProvider } from "@/context/workspace-notifications"
import { StockAnalyticsReportProvider } from "@/context/stock-analytics-report"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <WorkspaceNotificationsProvider>
          <StockAnalyticsReportProvider>
            {children}
          </StockAnalyticsReportProvider>
        </WorkspaceNotificationsProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
