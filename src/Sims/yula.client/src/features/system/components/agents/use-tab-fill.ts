import * as React from "react";

/**
 * Sekme gövdesini ScrollArea paneline yüksekliğe kilitler.
 *
 * Neden gerekli: Radix ScrollArea, viewport içeriğini ölçüm için
 * `display: table` anonim bir sarmalayıcıya koyar. Table shrink-to-fit
 * çalıştığı için yüzde yükseklikler (`h-full`, `min-h-full`, `flex-1`)
 * tablo boyuna (yani içeriğe) göre çözülür — panel yüksekliğine göre
 * değil. Sonuç: kısa içerikli sekmeler paneli doldurmaz, altta boşluk kalır.
 *
 * Bu hook, elemente ScrollArea viewport'unun o anki yüksekliğini (üst
 * ebeveynin padding'i düşülmüş) inline `min-height` olarak yazar ve
 * ResizeObserver ile canlı tutar. Yüzde zincirine bel bağlamaz.
 * Paylaşılan tek ref birden çok TabsContent'te kullanılabilir (Radix
 * pasif sekmeleri unmount ettiği için aynı anda biri bağlıdır).
 * skills + agents editörlerinde kullanılır.
 */
export function useTabFill<T extends HTMLElement>() {
  const roRef = React.useRef<ResizeObserver | null>(null);

  const ref = React.useCallback((el: T | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const viewport = el.closest('[data-slot="scroll-area-viewport"]');
    if (!(viewport instanceof HTMLElement)) return;
    const sync = () => {
      const parent = el.parentElement;
      const ps = parent ? getComputedStyle(parent) : null;
      const pad =
        (ps ? Number.parseFloat(ps.paddingTop) || 0 : 0) +
        (ps ? Number.parseFloat(ps.paddingBottom) || 0 : 0);
      el.style.minHeight = `${Math.max(0, viewport.clientHeight - pad)}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(viewport);
    roRef.current = ro;
  }, []);

  React.useEffect(() => () => roRef.current?.disconnect(), []);

  return ref;
}
