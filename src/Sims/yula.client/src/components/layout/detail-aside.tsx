"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
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
 * Sağ panel bileşimi (aside + meta): ekranlar yalnızca veriyi
 * (`files`, `metaRows`) verir; içerik yoksa panel basılmaz.
 */
export function DetailAsidePanel({
  image,
  addControl,
  files = [],
  onRemoveFile,
  metaRows = [],
  metaBare = false,
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
  /** Meta satırları (boşsa meta basılmaz) */
  metaRows?: DetailMetaRow[];
  /** Meta tek başına kullanıldığında baştaki ayraç atlanır */
  metaBare?: boolean;
  className?: string;
}) {
  const hasAside = image != null || addControl != null || files.length > 0;
  if (!hasAside && metaRows.length === 0) return null;
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
      {metaRows.length > 0 ? (
        <DetailMeta rows={metaRows} bare={metaBare} />
      ) : null}
    </>
  );
}

/**
 * Detay meta bilgi bloğu (item aside deseni): ayraç + başlık/açıklama
 * satırları. Tek başına kullanıldığında `bare` ile baştaki ayraç atlanır.
 * Satır yoksa hiçbir şey basılmaz.
 */
export function DetailMeta({
  rows,
  bare = false,
}: {
  rows: DetailMetaRow[];
  bare?: boolean;
}) {
  if (rows.length === 0) return null;
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
