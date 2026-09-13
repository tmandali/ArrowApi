"use client";

import { useRouter } from "next/navigation";

/**
 * Rotalı geçiş göstergesi (Next App Router `isPending`): sayfa/rapor
 * değişirken içerik yeniden kurulmadan İNCE üst şerit yüklenme belirtisi
 * gösterir — boş alan "flaşı" yerine bilinçli bir geçiş sinyali verir.
 * AppLayout'da `main` alanının üst kenarında render edilir; görünüm
 * RouteTopBar'ın indeterminate deseniyle aynı dili kullanır.
 */
export function RouteTransitionIndicator() {
  const router = useRouter();
  // Next 16 runtime `isPending` (App Router transition sinyali) — tip
  // tanımları henüz yayınlamadığı için defansif erişim.
  const pending =
    (router as unknown as { isPending?: boolean }).isPending ?? false;

  if (!pending) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-50"
    >
      <div className="h-0.5 overflow-hidden bg-transparent">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-gradient-to-r from-primary to-orange-500" />
      </div>
    </div>
  );
}
