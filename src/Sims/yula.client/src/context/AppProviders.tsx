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
        Provider'lar (iş takibi SSE'leri, bildirim kutusu) KÜRESELDİR —
        company'den bağımsız, bu yüzden key'in DIŞINDA kalır: şirket
        geçişinde çalışan job'ların akışları kesilmez, bildirim kutusu
        sıfırlanmaz. (Eski hâllerinde key ile birlikte remount ediliyor,
        tüm SSE akışları abort edilip yeniden açılıyordu — "flaş").

        Şirket geçişi anlık + optimistiktir: key yalnızca SAHİFELERİ
        yeniden mount eder; her panel kendi verisini (X-Company-Id)
        yeniden çeker ve kendi loading state'ini gösterir. Kısa
        fade-in (animate-page-swap) sert veri→iskelet geçişini yumuşatır.
        Tam ekran bir "geçiş" gate'i yoktur.
      */}
      <WorkspaceNotificationsProvider>
        <JobSyncProvider>
          <div
            key={activeCompanyId ?? "no-company"}
            className="contents animate-page-swap"
          >
            {children}
          </div>
        </JobSyncProvider>
      </WorkspaceNotificationsProvider>
    </TooltipProvider>
  )
}
