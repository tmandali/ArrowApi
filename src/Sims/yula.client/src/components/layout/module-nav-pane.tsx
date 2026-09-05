"use client";

import * as React from "react"
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
import { usePagePanelContext } from "@/context/page-panel-context"
import { usePersistedPanelLayout } from "@/lib/use-persisted-panel-layout"
import { cn } from "@/utils/cn"

type ModuleNavPaneProps = {
  /** Page content rendered to the right of the nav menu. */
  children: ReactNode
  className?: string
  /**
   * Nav menü tepesindeki kapatma butonu / başlık alanının görünürlüğü.
   * Varsayılan: false (header ve buton gösterilmez).
   */
  navMenuHeaderVisible?: boolean
}

/**
 * Aktif modülün nav menüsünü page header'ın ALTINA yerleştiren paylaşımlı
 * pane: `[ModuleNavMenu | children]` yatay split. Page header'lı tüm
 * scaffold'lar (WorkspacePageShell, ReportCriteriaShell, JobView'ler, item,
 * system) AiDock'larını bu pane ile sarmalar — davranış tüm sayfalarda aynı.
 *
 * - Açma / Kapama: Page header'daki PagePanelTrigger butonu veya Ctrl+B / ⌘B kısayolu.
 * - Kalıcılık: genişlik + açık/kapalı durumu tüm sayfalarda ortak (`module-nav`
 *   tek anahtar; F5 sonrası geri yüklenir).
 */
export function ModuleNavPane({
  children,
  className,
  navMenuHeaderVisible = false,
}: ModuleNavPaneProps) {
  const { open: navOpen } = usePagePanel({
    id: "module-nav",
    title: "Menu",
    defaultOpen: true,
  })
  const { setOpen } = usePagePanelContext()

  const { groupRef, onLayoutChanged } = usePersistedPanelLayout(
    `module-nav:${navOpen ? "nav" : "full"}`
  )

  // Ctrl+B / ⌘B ile klavyeden menü açıp kapama
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        setOpen("module-nav", !navOpen)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [navOpen, setOpen])

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
          defaultSize="13%"
          minSize="10%"
          maxSize="20%"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <ModuleNavMenu headerVisible={navMenuHeaderVisible} />
        </ResizablePanel>
      ) : null}
      {navOpen ? (
        <ResizableHandle withHandle className={panelResizeHandleClass} />
      ) : null}
      <ResizablePanel
        id="module-content"
        defaultSize={navOpen ? "87%" : "100%"}
        minSize="75%"
        className="flex min-h-0 min-w-0 flex-col"
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
