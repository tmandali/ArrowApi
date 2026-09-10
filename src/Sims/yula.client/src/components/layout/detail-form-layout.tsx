"use client";

import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * Kayıt detay kapları (Tailwind taraması için literal tutulur; yeni kap
 * eklendiğinde buraya satır eklenir).
 */
const GRID_CLASS: Record<string, string> = {
  "skill-detail":
    "@[40rem]/skill-detail:grid-cols-[minmax(0,1fr)_11rem]",
  "agent-detail":
    "@[40rem]/agent-detail:grid-cols-[minmax(0,1fr)_11rem]",
};

const ASIDE_CLASS: Record<string, string> = {
  "skill-detail":
    "@[40rem]/skill-detail:border-l @[40rem]/skill-detail:border-t-0",
  "agent-detail":
    "@[40rem]/agent-detail:border-l @[40rem]/agent-detail:border-t-0",
};

type DetailFormLayoutProps = {
  /** Kayıt detay kabı (ızgara + aside çizgisi buradan çözülür) */
  containerName: string;
  /** Orta içerik: form alanları (sayfa doldurur) */
  content: ReactNode;
  /** Sağ panel: görsel + dosyalar + meta (sayfa doldurur) */
  aside?: ReactNode;
  /** Altta tam genişlik zaman çizgisi (sayfa doldurur) */
  timeline?: ReactNode;
  className?: string;
};

/**
 * Sekmeli detay form gövdesi: 3 alanlı standart yerleşim — ortada içerik,
 * sağda çizgili panel, altta timeline. Kullanan sayfalar alanları kendi
 * doldurur, yerleşimi yönetmez.
 */
export function DetailFormLayout({
  containerName,
  content,
  aside,
  timeline,
  className,
}: DetailFormLayoutProps) {
  return (
    <div className={cn("min-w-0 space-y-5", className)}>
      {aside ? (
        <div className={cn("grid grid-cols-1 gap-5", GRID_CLASS[containerName])}>
          <div className="min-w-0 space-y-5">{content}</div>
          <div
            className={cn(
              "w-full space-y-4 border-t bg-muted/10 p-3",
              ASIDE_CLASS[containerName],
            )}
          >
            {aside}
          </div>
        </div>
      ) : (
        <div className="min-w-0 space-y-5">{content}</div>
      )}
      {timeline}
    </div>
  );
}
