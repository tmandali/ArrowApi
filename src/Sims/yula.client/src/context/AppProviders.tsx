"use client";

import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { WorkspaceNotificationsProvider } from "@/context/workspace-notifications"
import { JobSyncProvider } from "@/context/job-sync-provider"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Toaster richColors closeButton position="bottom-right" />
      {/*
        Provider'lar (iş takibi SSE'leri, bildirim kutusu) KÜRESELDİR —
        company'den bağımsız, şirket geçişinde remount EDELMELER:
        çalışan job'ların akışları kesilmez, bildirim kutusu
        sıfırlanmaz.

        Şirket geçişinin ANAHTARI buraya ait değil: key yalnızca SAYFA
        İÇERİĞİNİ yeniden mount eder — bkz. AppLayout'daki main içerik
        çerçevesi (key={activeCompanyId}). Shell (header/search/drawer)
        ve bu küresel provider'lar şirket geçişinde HAYATTA KALIR;
        yalnız panel verisi (X-Company-Id) yenilenir.
      */}
      <WorkspaceNotificationsProvider>
        <JobSyncProvider>
          {children}
        </JobSyncProvider>
      </WorkspaceNotificationsProvider>
    </TooltipProvider>
  )
}
