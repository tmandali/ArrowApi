import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "./lib/i18n-routing";

/**
 * Örnek proje `I18n.ts` uyarlaması. `next.config.ts`'teki
 * `createNextIntlPlugin('./src/i18n.ts')` burayı gösterir.
 * Mesaj dosyaları: `src/messages/<locale>.json` (tr = kaynak dil).
 *
 * Dil `NEXT_LOCALE` çerezinden okunur (`LocaleSwitcher` yazar);
 * yoksa `Accept-Language`, o da yoksa varsayılan (tr).
 * next-intl middleware'i KULLANILMIYOR — `localePrefix:'never'` modunda
 * 404'e çevirdiği için dil burada çözülüyor (deterministik, URL sabit).
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, fromCookie) ? fromCookie : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
