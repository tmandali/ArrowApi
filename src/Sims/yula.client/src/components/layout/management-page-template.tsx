"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { usePagePanelContext } from "@/context/page-panel-context";
import { MasterDetailPage } from "@/components/layout/master-detail-page";
import {
  TabbedDetail,
  type TabbedDetailTab,
} from "@/components/layout/tabbed-detail";
import {
  RecordModeChip,
  type RecordMode,
} from "@/components/layout/record-mode-chip";

type ManagementPageTemplateProps = {
  /** Sayfa başlığı (sol küme) */
  title: ReactNode;
  /** Sayfa modu — başlık yanında rozet olarak basılır */
  mode: RecordMode | null;
  /** Sayfa toolbar aksiyonları (sağ küme) */
  actions?: ReactNode;
  /** Sol (liste) panel başlığı */
  listHeader: ReactNode;
  /** Sol panel kaydırılabilir içeriği (liste / boş durum) */
  list: ReactNode;
  /** Detay sekme tanımları */
  tabs: TabbedDetailTab[];
  /** Seçim değişince sekmeyi başa döndüren anahtar */
  tabResetKey: string | number;
  /** Detayda sekme şeridi gösterilsin mi */
  showTabs: boolean;
  /** Detay başlık aksiyonları (Kaydet/Vazgeç vb.) */
  tabActions?: ReactNode;
  /** Detay başlık alt bilgisi */
  tabSubtitle?: ReactNode;
  /** Detay içerik kapsayıcı sınıfı (çağıranda literal) */
  containerClass: string;
  /** Seçim yokken detay gövdesi */
  empty?: ReactNode;
  /** Detay sekme içerikleri */
  children?: ReactNode;
  listPanelId?: string;
  detailPanelId?: string;
  /** Detay kutusunda maksimize düğmesi (rapor ızgarasındaki desen) */
  maximizable?: boolean;
};

/**
 * Yönetim sayfası şablonu (skills/agents deseni): sayfa başlığı + mod
 * rozeti + master-detail + sekmeli detay tek pakette. Ekranlar yalnızca
 * liste/içerik slot'larını verir.
 */
export function ManagementPageTemplate({
  title,
  mode,
  actions,
  listHeader,
  list,
  tabs,
  tabResetKey,
  showTabs,
  tabActions,
  tabSubtitle,
  containerClass,
  empty,
  children,
  listPanelId,
  detailPanelId,
  maximizable = true,
}: ManagementPageTemplateProps) {
  // Detay maksimize: örnekteki (rapor sonucu) desen — liste paneli gizlenir,
  // detay %100'e açılır; her şey WorkspaceAiDock içinde kalır, Yula kapanmaz.
  // Nav menü de dahil: açılırken kapatılır, çıkarken önceki durumuna döner.
  const [detailMaximized, setDetailMaximized] = React.useState(false);
  const { openById, setOpen: setPagePanelOpen } = usePagePanelContext();
  const navOpen = openById["module-nav"] ?? false;
  const prevNavOpenRef = React.useRef(false);

  const restoreNav = React.useCallback(() => {
    if (prevNavOpenRef.current) {
      setPagePanelOpen("module-nav", true);
      prevNavOpenRef.current = false;
    }
  }, [setPagePanelOpen]);

  const handleToggleDetailMaximize = React.useCallback(() => {
    if (!detailMaximized) {
      prevNavOpenRef.current = navOpen;
      if (navOpen) setPagePanelOpen("module-nav", false);
    } else {
      restoreNav();
    }
    setDetailMaximized((v) => !v);
  }, [detailMaximized, navOpen, restoreNav, setPagePanelOpen]);

  // Esc tuşu ile genişletilmiş moddan çıkış (örnekteki davranış).
  React.useEffect(() => {
    if (!detailMaximized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        restoreNav();
        setDetailMaximized(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailMaximized, restoreNav]);

  // Maksimizede sayfadan çıkılırsa nav'ı önceki durumuna döndür.
  React.useEffect(
    () => () => {
      if (prevNavOpenRef.current) {
        setPagePanelOpen("module-nav", true);
      }
    },
    [setPagePanelOpen],
  );

  return (
    <MasterDetailPage
      title={title}
      titleExtra={mode != null ? <RecordModeChip mode={mode} /> : null}
      actions={actions}
      listHeader={listHeader}
      list={list}
      listPanelId={listPanelId}
      detailPanelId={detailPanelId}
      detailMaximized={detailMaximized}
    >
      <TabbedDetail
        resetKey={tabResetKey}
        tabs={tabs}
        showTabs={showTabs}
        headerActions={tabActions}
        subtitle={tabSubtitle}
        containerClass={containerClass}
        empty={empty}
        maximizable={maximizable}
        detailMaximized={detailMaximized}
        onToggleDetailMaximize={handleToggleDetailMaximize}
      >
        {children}
      </TabbedDetail>
    </MasterDetailPage>
  );
}
