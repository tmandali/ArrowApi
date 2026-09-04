"use client";

import type { ReactNode } from "react"
import { ModuleNavMenu } from "@/components/layout/module-nav-menu"
import {
  pageContentGutterClass,
  panelResizeHandleClass,
} from "@/components/layout/panel-chrome"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { usePagePanel } from "@/hooks/use-page-panel"
import { usePersistedPanelLayout } from "@/lib/use-persisted-panel-layout"
import { cn } from "@/utils/cn"

type ModuleNavPaneProps = {
  /** Page content rendered to the right of the nav menu. */
  children: ReactNode
  className?: string
}

/**
 * Aktif modülün nav menüsünü page header'ın ALTINA yerleştiren paylaşımlı
 * pane: `[ModuleNavMenu | children]` yatay split. Page header'lı tüm
 * scaffold'lar (WorkspacePageShell, ReportCriteriaShell, JobView'ler, item,
 * system) AiDock'larını bu pane ile sarmalar — davranış tüm sayfalarda aynı.
 *
 * - Kayıt: `module-nav` — pane'in olduğu sayfalarda PagePanelTrigger görünür
 *   ve bu pane'i toggle eder.
 * - Kalıcılık: genişlik + açık/kapalı durumu tüm sayfalarda ortak (`module-nav`
 *   tek anahtar; F5 sonrası geri yüklenir).
 * - Gutter sahipliği: grup `pageContentGutterClass` taşır (page header'ın
 *   px-2 inset'iyle hizalı); kartlar gruba flush durur ve kart arası boşluk
 *   yalnızca resize handle (tek gutter birimi) olur — içerik tarafları kendi
 *   dış gutter'larını eklemez, yoksa çift boşluk oluşur.
 */
export function ModuleNavPane({ children, className }: ModuleNavPaneProps) {
  const { open: navOpen } = usePagePanel({
    id: "module-nav",
    title: "Menu",
    defaultOpen: true,
  })
  const { groupRef, onLayoutChanged } = usePersistedPanelLayout(
    `module-nav:${navOpen ? "nav" : "full"}`
  )

  return (
    <ResizablePanelGroup
      key={navOpen ? "nav" : "full"}
      orientation="horizontal"
      groupRef={groupRef}
      onLayoutChanged={onLayoutChanged}
      className={cn(pageContentGutterClass, "min-h-0 min-w-0 flex-1", className)}
    >
      {navOpen ? (
        <ResizablePanel
          id="module-nav"
          defaultSize="20%"
          minSize="14%"
          maxSize="32%"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <ModuleNavMenu />
        </ResizablePanel>
      ) : null}
      {navOpen ? (
        <ResizableHandle withHandle className={panelResizeHandleClass} />
      ) : null}
      <ResizablePanel
        id="module-content"
        defaultSize={navOpen ? "80%" : "100%"}
        minSize="68%"
        className="flex min-h-0 min-w-0 flex-col"
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
