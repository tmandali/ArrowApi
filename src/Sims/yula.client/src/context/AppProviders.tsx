"use client";

import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { WorkspaceNotificationsProvider } from "@/context/workspace-notifications"
import { JobSyncProvider } from "@/context/job-sync-provider"
import { useCompanyStore } from "@/store/slices/company-store"

export function AppProviders({ children }: { children: React.ReactNode }) {
  const activeCompanyId = useCompanyStore((state) => state.activeCompanyId)

  return (
    <TooltipProvider>
      <Toaster richColors closeButton position="bottom-right" />
      {/*
        Şirket geçişi anlık + optimistiktir: key değişimiyle workspace alt
        ağacı yeniden mount edilir; her panel kendi verisini (X-Company-Id)
        yeniden çeker ve kendi loading state'ini gösterir. Tam ekran bir
        "geçiş" gate'i yoktur.
      */}
      <div key={activeCompanyId ?? "no-company"} className="contents">
        <WorkspaceNotificationsProvider>
          <JobSyncProvider>
            {children}
          </JobSyncProvider>
        </WorkspaceNotificationsProvider>
      </div>
    </TooltipProvider>
  )
}
