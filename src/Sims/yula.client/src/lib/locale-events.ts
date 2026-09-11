import * as React from "react";

export type AppLocale = "tr" | "en";

/**
 * Locale değişimi yayını — tek kaynak: User Settings dil kaydı
 * (`MySettingsForm.applyLanguageChange`). Dinleyiciler, reload ÖNCESİ
 * senkron kalıcılık gereksinimleri için abone olur (localStorage yazarı,
 * DOM nitelik güncelleyici vb.).
 *
 * Sözleşme: listener'lar YALNIZCA senkron kalıcılık işlemleri yapar
 * (`localStorage` yazımı, `document` nitelik güncellemesi). `setState`
 * YASAK — yayın anından kısa bir süre (~150 ms) sonra sayfa yenilenir.
 */
export const LOCALE_CHANGED_EVENT = "yula:locale-changed" as const;

export function emitLocaleChange(locale: AppLocale): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ locale: AppLocale }>(LOCALE_CHANGED_EVENT, {
      detail: { locale },
    }),
  );
}

/**
 * React aboneliği: mount'ta bir kez listen, unmount'ta detach.
 * En son handler'ı izler (latest-ref) — inline arrow'lı çağrıranlar
 * her render'da yeniden abone olmaz.
 */
export function useLocaleChange(handler: (locale: AppLocale) => void): void {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = (event: Event) =>
      handlerRef.current(
        (event as CustomEvent<{ locale: AppLocale }>).detail.locale
      );
    window.addEventListener(LOCALE_CHANGED_EVENT, fn);
    return () => window.removeEventListener(LOCALE_CHANGED_EVENT, fn);
  }, []);
}
