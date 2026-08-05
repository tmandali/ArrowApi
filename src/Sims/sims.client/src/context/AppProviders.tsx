import { ThemeProvider } from "@/context/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkspaceNotificationsProvider } from "@/context/workspace-notifications"
import { JobSyncProvider } from "@/context/job-sync-provider"
import { StockAnalyticsReportProvider } from "@/context/stock-analytics-report"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <WorkspaceNotificationsProvider>
          <JobSyncProvider>
            <StockAnalyticsReportProvider>
              {children}
            </StockAnalyticsReportProvider>
          </JobSyncProvider>
        </WorkspaceNotificationsProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
