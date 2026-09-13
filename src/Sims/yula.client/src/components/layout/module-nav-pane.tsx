"use client";

import * as React from "react"
import type { ReactNode } from "react"
import {
  pageContentGutterClass,
  panelResizeHandleClass,
} from "@/components/layout/panel-chrome"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { usePagePanelContext } from "@/context/page-panel-context"
import { usePersistedPanelLayout } from "@/lib/use-persisted-panel-layout"
import { cn } from "@/utils/cn"

type ModuleNavPaneProps = {
  /** Page content rendered to the right of the pane. */
  children: ReactNode
  className?: string
  /**
   * Pane'nin SOL tarafındaki bağımsız içerik — ana nav menüden AYRI
   * (ana menü AppHeader başlığı ile açılan overlay çekmece'dedir).
   * Verilmezse resizable pane hiç render edilmez, yalnız içerik paneli
   * gösterilir.
   */
  paneContent?: ReactNode
  /**
   * Register edilen sayfa panelinin id'si (page header trigger'ı bu paneli
   * hedefler). Varsayılan: "page-pane".
   */
  panelId?: string
  /** Page header trigger'ı tooltip'indeki panel başlığı. */
  paneTitle?: string
  /**
   * Pane'nin F5 / ilk yüklemede varsayılan durumu (durum in-memory olduğu
   * için yeniden yüklemede sabit kalmak isteyen ekranlar true verir).
   */
  defaultOpen?: boolean
}

/**
 * Sayfa bazlı bağımsız resizable pane: `[paneContent | children]` yatay
 * split (içerik itme/push modu — overlay değil).
 *
 * - Pane yalnız `paneContent` verildiklerinde render edilir; kapalıyken
   * yalnız `children` (içerik) paneli görünür.
 * - Açma / Kapama: Page header'daki PagePanelTrigger butonu (bu pane
   * register olduğunda).
 * - Ana nav menü buradan ayrıştırılmıştır: AppHeader seviyesindeki
   * `MainNavDrawer` (overlay) tarafından yönetilir.
 */
export function ModuleNavPane({
  children,
  className,
  paneContent,
  panelId = "page-pane",
  paneTitle,
  defaultOpen = false,
}: ModuleNavPaneProps) {
  const hasPane = paneContent != null
  const { openById, register, unregister } = usePagePanelContext()

  // Pane mount süresince sayfa paneli olarak register edilir — page
  // header'ındaki trigger bu paneli hedefler. useLayoutEffect: register
  // ilk paint ÖNCESİNDE olur, böylece raporlar arası geçişte trigger /
  // pane paint sonrası gecikmeli belirmez (flicker).
  React.useLayoutEffect(() => {
    if (!hasPane) return
    register({ id: panelId, title: paneTitle ?? "Panel", defaultOpen })
    return () => unregister(panelId)
  }, [hasPane, panelId, paneTitle, defaultOpen, register, unregister])

  const open = hasPane ? openById[panelId] ?? defaultOpen : false

  const { groupRef, onLayoutChanged } = usePersistedPanelLayout(
    hasPane ? panelId : undefined
  )

  if (!hasPane) {
    return (
      <div className={cn(pageContentGutterClass, "min-h-0 min-w-0 flex-1", className)}>
        <div className="flex h-full min-h-0 min-w-0 flex-col">{children}</div>
      </div>
    )
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      groupRef={groupRef}
      onLayoutChanged={onLayoutChanged}
      className={cn(pageContentGutterClass, "min-h-0 min-w-0 flex-1", className)}
    >
      {open ? (
        <ResizablePanel
          id={panelId}
          defaultSize={190}
          minSize={160}
          maxSize={300}
          groupResizeBehavior="preserve-pixel-size"
          className="flex min-h-0 min-w-0 flex-col"
        >
          {paneContent}
        </ResizablePanel>
      ) : null}
      {open ? <ResizableHandle withHandle className={panelResizeHandleClass} /> : null}
      <ResizablePanel
        id="module-content"
        minSize="50%"
        className="flex min-h-0 min-w-0 flex-col"
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
