"use client";

import type { ReactNode } from "react";
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock";
import { ModuleNavPane } from "@/components/layout/module-nav-pane";
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  panelCardClass,
  panelHeaderClass,
  panelResizeHandleClass,
} from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";

type MasterDetailPageProps = {
  /** Sayfa başlığı (sol küme) */
  title: ReactNode;
  /** Başlık yanı rozet/içerik (örn. sayfa mod chip'i) */
  titleExtra?: ReactNode;
  /** Başlık toolbar aksiyonları (sağ küme) */
  actions?: ReactNode;
  showSearch?: boolean;
  /** Sol (liste) panel başlığı */
  listHeader: ReactNode;
  /** Sol panel kaydırılabilir içeriği (liste / boş durum) */
  list: ReactNode;
  /** Sağ (detay) panel içeriği */
  children: ReactNode;
  listPanelId?: string;
  detailPanelId?: string;
  /** Detay tam genişlikte (liste paneli gizli) — Yula dock'u etkilenmez */
  detailMaximized?: boolean;
  listDefaultSize?: number;
  listMinSize?: number | string;
  listMaxSize?: number | string;
  detailMinSize?: number | string;
};

/**
 * Master-detail sayfa kabuğu (skills/agents deseni): sayfa başlığı +
 * aksiyonlar, solda liste, sağda detay; yeniden boyutlanabilir paneller.
 * Ekranlar yalnızca slot içeriklerini verir, tasarımı yönetmez.
 */
export function MasterDetailPage({
  title,
  titleExtra,
  actions,
  showSearch = false,
  listHeader,
  list,
  children,
  listPanelId = "master-list",
  detailPanelId = "master-detail",
  detailMaximized = false,
  listDefaultSize = 360,
  listMinSize = 320,
  listMaxSize = 520,
  detailMinSize = "30%",
}: MasterDetailPageProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={showSearch}
        actions={actions}
        startExtra={titleExtra}
      >
        <PageHeaderTitle>{title}</PageHeaderTitle>
      </WorkspacePageHeader>

      <WorkspaceAiDock>
        <ModuleNavPane>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1 overflow-hidden"
            >
              {!detailMaximized ? (
                <>
                  <ResizablePanel
                    id={listPanelId}
                    defaultSize={listDefaultSize}
                    minSize={listMinSize}
                    maxSize={listMaxSize}
                    groupResizeBehavior="preserve-pixel-size"
                    className="min-h-0 min-w-0"
                  >
                    <section className={cn(panelCardClass, "h-full")}>
                      <div className={panelHeaderClass}>{listHeader}</div>
                      {/* data-tabbed-detail: globals.css table kilidi (liste yatay taşmasın) */}
                      <ScrollArea data-tabbed-detail className="h-0 min-h-0 w-full flex-1">
                        {list}
                      </ScrollArea>
                    </section>
                  </ResizablePanel>

                  <ResizableHandle
                    withHandle
                    className={panelResizeHandleClass}
                  />
                </>
              ) : null}

              <ResizablePanel
                id={detailPanelId}
                minSize={detailMaximized ? "100%" : detailMinSize}
                className="min-h-0 min-w-0 flex-1"
              >
                <section className={cn(panelCardClass, "h-full min-w-0")}>
                  {children}
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ModuleNavPane>
      </WorkspaceAiDock>
    </div>
  );
}
