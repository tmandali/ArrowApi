"use client";

import type { ReactNode } from "react";
import { History, Maximize2, Minimize2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { panelHeaderClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";

export type TabbedDetailTab = {
  value: string;
  /** Sekme etiketi (nokta + metin gibi zengin içerik olabilir) */
  label: ReactNode;
  title?: string;
  /** Sekme tetikleyici ek sınıfı (varsayılan: "max-w-48") */
  className?: string;
};

type TabbedDetailProps = {
  /** Seçim değişince sekmeyi başa döndüren anahtar */
  resetKey: string | number;
  tabs: TabbedDetailTab[];
  /** Sekme şeridi gösterilsin mi (seçim yoksa boş başlık basılır) */
  showTabs: boolean;
  /** Başlık sağ kümesi (Kaydet/Vazgeç vb.) */
  headerActions?: ReactNode;
  /** Başlık alt bilgisi (sayı özeti vb.) */
  subtitle?: ReactNode;
  /**
   * İçerik kapsayıcı sınıfı — Tailwind taraması için çağıran tarafta
   * literal yazılır (örn. `"@container/skill-detail p-3"`).
   */
  containerClass: string;
  /** Seçim yokken gövdede gösterilen boş durum */
  empty?: ReactNode;
  /** Sekme içerikleri (çağıranın TabsContent'leri) */
  children?: ReactNode;
  /** Detay başlığında maksimize düğmesi gösterilsin mi */
  maximizable?: boolean;
  /** Detay tam genişlikte (liste paneli gizli) */
  detailMaximized?: boolean;
  /** Maksimize aç/kapa */
  onToggleDetailMaximize?: () => void;
};

/**
 * Sekmeli detay panel kabuğu (skills/agents deseni): başlıkta sekme şeridi
 * + aksiyonlar, gövdede kaydırılabilir sekme içerikleri. Ekranlar yalnızca
 * sekme tanımlarını ve içerikleri verir.
 */
export function TabbedDetail({
  resetKey,
  tabs,
  showTabs,
  headerActions,
  subtitle,
  containerClass,
  empty,
  children,
  maximizable = false,
  detailMaximized = false,
  onToggleDetailMaximize,
}: TabbedDetailProps) {
  return (
    <Tabs
      key={resetKey}
      defaultValue="genel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className={panelHeaderClass}>
        {showTabs ? (
          <TabsList
            variant="line"
            className="min-w-0 flex-1 justify-start overflow-x-auto no-scrollbar"
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                style={{ flex: "0 0 auto" }}
                className={t.className ?? "max-w-48"}
                title={t.title}
              >
                {typeof t.label === "string" ? (
                  <span className="truncate">{t.label}</span>
                ) : (
                  t.label
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {subtitle}
        {maximizable && (showTabs || detailMaximized) ? (
          <Button
            type="button"
            variant={detailMaximized ? "secondary" : "outline"}
            size="icon"
            className="size-7 shrink-0 self-center"
            onClick={() => onToggleDetailMaximize?.()}
            title={detailMaximized ? "Küçült (Esc)" : "Genişletilmiş Görünüm (Maximize)"}
            aria-label={detailMaximized ? "Küçült (Esc)" : "Genişletilmiş Görünüm (Maximize)"}
          >
            {detailMaximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
        ) : null}
        {headerActions ? (
          <div className="flex shrink-0 items-center gap-1 self-center">
            {headerActions}
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ScrollArea className="h-0 min-h-0 w-full flex-1">
          <div className={cn("h-full", containerClass)}>
            {showTabs ? children : empty}
          </div>
        </ScrollArea>
      </div>
    </Tabs>
  );
}

/**
 * Detay başlığı kayıt geçmişi aç/kapa düğmesi (timeline görünürlüğü).
 */
export function DetailHistoryToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-pressed={open}
      title={open ? "Kayıt geçmişini gizle" : "Kayıt geçmişini göster"}
      className={cn(
        "h-7 px-2.5 text-[11.5px]",
        open ? "bg-muted text-foreground" : "text-muted-foreground",
      )}
      onClick={onToggle}
    >
      <History className="size-3.5" />
      Geçmiş
    </Button>
  );
}
