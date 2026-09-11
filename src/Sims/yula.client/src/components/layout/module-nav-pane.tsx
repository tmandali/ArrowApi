"use client";

import * as React from "react"
import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { PanelLeftOpen } from "lucide-react"
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
   * @deprecated Menüyü kapat butonu kaldırıldı — yoksayılır, geriye uyumluluk için tutulur.
   * Menü kapatma PagePanelTrigger / Ctrl+B / overlay backdrop ile yapılır.
   */
  navMenuHeaderVisible?: boolean
  /**
   * Menü kapalıyken sol üstte açma butonu gösterilip gösterilmeyeceği.
   * Belirtilmezse navMenuHeaderVisible ile aynı değeri alır.
   */
  floatingOpenButton?: boolean
  /**
   * Overlay modu: menü içeriği itmez, solda kart olarak üstte açılır.
   * İçerik genişliği sabit kalır — aç/kapa ekranı sağa kaydırmaz.
   * Ortalanmış ana ekranlar (ajan oturumu) için kullanılır.
   */
  overlay?: boolean
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
  floatingOpenButton,
  overlay = false,
}: ModuleNavPaneProps) {
  const t = useTranslations("ModuleNav")
  const showOpenButton = floatingOpenButton ?? navMenuHeaderVisible

  const { open: navOpen } = usePagePanel({
    id: "module-nav",
    title: "Menu",
    defaultOpen: false,
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

  // Overlay'de Escape ile kapatma
  React.useEffect(() => {
    if (!overlay || !navOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen("module-nav", false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [overlay, navOpen, setOpen])

  // Overlay modu: menü içerik genişliğini değiştirmez — solda üstte açılır.
  // Çekmece her zaman mounted kalır (translate ile gizlenir), böylece
  // aç/kapa ortalanmış içeriği sağa kaydırmaz.
  if (overlay) {
    return (
      <div
        className={cn(
          pageContentGutterClass,
          "relative min-h-0 min-w-0 flex-1",
          className
        )}
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col">{children}</div>
        {!navOpen && showOpenButton && (
          <div className="absolute left-2 top-2 z-20">
            <button
              type="button"
              onClick={() => setOpen("module-nav", true)}
              title={t("open_menu")}
              className="flex size-7 items-center justify-center rounded-md border border-border/50 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground shadow-2xs backdrop-blur-xs transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="size-3.5" />
              <span className="sr-only">{t("open_menu_short")}</span>
            </button>
          </div>
        )}
        {navOpen && (
          <button
            type="button"
              aria-label={t("close_menu")}
            onClick={() => setOpen("module-nav", false)}
            className="absolute inset-0 z-30 cursor-default bg-background/40 backdrop-blur-[1px]"
          />
        )}
        <div
          className={cn(
            "absolute bottom-2 left-2 top-0 z-40 w-60 transition-transform duration-200 ease-out",
            navOpen
              ? "translate-x-0"
              : "pointer-events-none -translate-x-[110%]"
          )}
          aria-hidden={!navOpen}
          inert={!navOpen}
        >
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border/60 bg-card/80 shadow-lg backdrop-blur-md">
            <ModuleNavMenu />
          </div>
        </div>
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
      {navOpen ? (
        <ResizablePanel
          id="module-nav"
          defaultSize={190}
          minSize={160}
          maxSize={300}
          groupResizeBehavior="preserve-pixel-size"
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
        minSize="50%"
        className={cn("flex min-h-0 min-w-0 flex-col", showOpenButton && !navOpen && "relative")}
      >
        {/* Menü kapalıyken ve bu görünümde izin verilmişse sol üstte zarif açma butonu */}
        {!navOpen && showOpenButton && (
          <div className="absolute left-2 top-2 z-20">
            <button
              type="button"
              onClick={() => setOpen("module-nav", true)}
              title={t("open_menu")}
              className="flex size-7 items-center justify-center rounded-md border border-border/50 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground shadow-2xs backdrop-blur-xs transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="size-3.5" />
              <span className="sr-only">{t("open_menu_short")}</span>
            </button>
          </div>
        )}
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
