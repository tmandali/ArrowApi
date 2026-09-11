"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { useLocaleChange } from "@/lib/locale-events";

/**
 * `<html lang>` senkronu:
 * - Mount'ta mevcut locale'den ayarlanır (SSR `lang={locale}` yazar; bu
 *   no-op bir güvenliktir).
 * - `yula:locale-changed` yayınında DOM niteliği reload penceresi içinde
 *   SENKRON güncellenir (`locale-events.ts` sözleşmesi: yalnız senkron
 *   DOM yazarı — `setState` YASAK, arkadan sayfa yenilemesi geliyor).
 */
export function DocLangSync() {
  const locale = useLocale();

  useLocaleChange((next) => {
    document.documentElement.lang = next;
  });

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return null;
}
