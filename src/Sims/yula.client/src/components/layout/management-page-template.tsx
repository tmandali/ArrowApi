"use client";

import type { ReactNode } from "react";
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
}: ManagementPageTemplateProps) {
  return (
    <MasterDetailPage
      title={title}
      titleExtra={mode != null ? <RecordModeChip mode={mode} /> : null}
      actions={actions}
      listHeader={listHeader}
      list={list}
      listPanelId={listPanelId}
      detailPanelId={detailPanelId}
    >
      <TabbedDetail
        resetKey={tabResetKey}
        tabs={tabs}
        showTabs={showTabs}
        headerActions={tabActions}
        subtitle={tabSubtitle}
        containerClass={containerClass}
        empty={empty}
      >
        {children}
      </TabbedDetail>
    </MasterDetailPage>
  );
}
