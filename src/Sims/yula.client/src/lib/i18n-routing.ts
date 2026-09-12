import { defineRouting } from "next-intl/routing";

/**
 * Örnek proje `I18nRouting.ts` uyarlaması — URL önekİ YOK (`never`).
 * Rotalar taşınmaz (`/system/users` aynen kalır); dil `NEXT_LOCALE`
 * cookie'si + `Accept-Language` ile çözülür, fallback her zaman `en`
 * (bkz. `src/i18n.ts`). Ekranlar kademeli geçer.
 */
export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  localePrefix: "never",
});

export type AppLocale = (typeof routing.locales)[number];
