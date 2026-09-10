"use client";

import type { ReactNode } from "react";
import { Info, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/utils/cn";

export type DetailAsideFile = {
  key: string;
  name: string;
  title?: string;
  /** Tip rengi noktası (fileDotClass çıktısı) */
  dotClassName?: string;
  /** Nokta yerine özel ikon (örn. item ekleri) */
  icon?: ReactNode;
};

type DetailAsideProps = {
  /** Görsel kutusu slot'u (AgentImageUpload / ItemImageUpload vb.) */
  image?: ReactNode;
  /** Dosya ekleme kontrolü (buton + gizli input, çağıranda) */
  addControl?: ReactNode;
  /** Dosya satırları (item aside deseni) */
  files?: DetailAsideFile[];
  /** Silme izni (view modda kapalı) */
  onRemoveFile?: (key: string) => void;
  className?: string;
};

/**
 * Detay sağ aside'ı (item/agent deseni): görsel kutusu + ek dosya satırları.
 * Ekranlar yalnızca slot içeriklerini ve dosya verisini verir.
 */
export function DetailAside({
  image,
  addControl,
  files = [],
  onRemoveFile,
  className,
}: DetailAsideProps) {
  return (
    <aside className={cn("min-w-0 space-y-3", className)}>
      {image}
      {(addControl || files.length > 0) && (
        <div>
          {addControl}
          {files.length > 0 ? (
            <div className="mt-1 space-y-1">
              {files.map((file) => (
                <div
                  key={file.key}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/60"
                >
                  {file.icon ?? (file.dotClassName ? (
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        file.dotClassName,
                      )}
                    />
                  ) : null)}
                  <span
                    className="truncate flex-1"
                    title={file.title ?? file.name}
                  >
                    {file.name}
                  </span>
                  {onRemoveFile ? (
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                      onClick={() => onRemoveFile(file.key)}
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

export type DetailMetaRow = {
  key: string;
  /** Koyu başlık satırı (örn. oluşturan / kaynak) */
  title: string;
  /** Açıklama satırı (örn. tarih) */
  detail: string;
};

/**
 * Sağ panel bileşimi (aside + meta): boş-panel kuralının tek evi.
 * Ekranlar `showEmpty` gibi UI koşulu hesaplamaz; yalnızca veriyi
 * (`files`, `metaRows`, `isNew`) verir. "Henüz bilgi yok" ipucu yalnızca
 * gerçekten boş yeni formda basılır — kayıtlı kayıtlarda ya da dosyası
 * olanlarda basılmaz.
 */
export function DetailAsidePanel({
  image,
  addControl,
  files = [],
  onRemoveFile,
  metaRows = [],
  metaBare = false,
  emptyTitle,
  emptyDescription,
  isNew = false,
  className,
}: {
  /** Görsel kutusu slot'u (AgentImageUpload vb.) */
  image?: ReactNode;
  /** Dosya ekleme kontrolü (buton + gizli input, çağıranda) */
  addControl?: ReactNode;
  /** Dosya satırları */
  files?: DetailAsideFile[];
  /** Silme izni (view modda kapalı) */
  onRemoveFile?: (key: string) => void;
  /** Meta satırları (boşsa ve kayıt yeni değilse meta basılmaz) */
  metaRows?: DetailMetaRow[];
  /** Meta tek başına kullanıldığında baştaki ayraç atlanır */
  metaBare?: boolean;
  /** Boş meta ipucu (yalnızca yeni kayıtta gösterilir) */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Yeni (henüz kaydedilmemiş) kayıt */
  isNew?: boolean;
  className?: string;
}) {
  const hasAside = image != null || addControl != null || files.length > 0;
  const showMetaEmpty = metaRows.length === 0 && isNew && files.length === 0;
  if (!hasAside && metaRows.length === 0 && !showMetaEmpty) return null;
  return (
    <>
      {hasAside ? (
        <DetailAside
          image={image}
          addControl={addControl}
          files={files}
          onRemoveFile={onRemoveFile}
          className={className}
        />
      ) : null}
      {metaRows.length > 0 || showMetaEmpty ? (
        <DetailMeta
          rows={metaRows}
          bare={metaBare}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          showEmpty={showMetaEmpty}
        />
      ) : null}
    </>
  );
}/**
 * Detay meta bilgi bloğu (item aside deseni): ayraç + başlık/açıklama
 * satırları. Tek başına kullanıldığında `bare` ile baştaki ayraç atlanır.
 * Satır yoksa `emptyTitle` verilmişse shadcn boş durumu basılır.
 */
export function DetailMeta({
  rows,
  bare = false,
  emptyTitle,
  emptyDescription,
  showEmpty = true,
}: {
  rows: DetailMetaRow[];
  bare?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  showEmpty?: boolean;
}) {
  if (rows.length === 0) {
    if (!emptyTitle || !showEmpty) return null;
    return (
      <Empty className="border-0 p-4">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          >
            <Info className="size-4" />
          </EmptyMedia>
          <EmptyTitle className="text-xs">{emptyTitle}</EmptyTitle>
          {emptyDescription ? (
            <EmptyDescription className="text-[11px]">
              {emptyDescription}
            </EmptyDescription>
          ) : null}
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      {bare ? null : <Separator />}
      <div className="space-y-3 text-[11px] text-muted-foreground">
        {rows.map((row) => (
          <div key={row.key}>
            <p className="font-medium text-foreground">{row.title}</p>
            <p>{row.detail}</p>
          </div>
        ))}
      </div>
    </>
  );
}
