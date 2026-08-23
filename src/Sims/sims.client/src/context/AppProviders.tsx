import { ThemeProvider } from "@/context/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { WorkspaceNotificationsProvider } from "@/context/workspace-notifications"
import { JobSyncProvider } from "@/context/job-sync-provider"
import { CompanySwitchOverlay } from "@/components/layout/company-switch-overlay"
import { useCompanyStore } from "@/store/slices/company-store"

export function AppProviders({ children }: { children: React.ReactNode }) {
  const activeCompanyId = useCompanyStore((state) => state.activeCompanyId)

  return (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster richColors closeButton position="bottom-right" />
        <CompanySwitchOverlay />
        <div key={activeCompanyId ?? "no-company"} className="contents">
          <WorkspaceNotificationsProvider>
            <JobSyncProvider>
              {children}
            </JobSyncProvider>
          </WorkspaceNotificationsProvider>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  )
}
