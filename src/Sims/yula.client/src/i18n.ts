import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { routing } from "./lib/i18n-routing";
import { resolveSessionUserLanguageLocale } from "./server/locale-sync";

/**
 * Örnek proje `I18n.ts` uyarlaması. `next.config.ts`'teki
 * `createNextIntlPlugin('./src/i18n.ts')` burayı gösterir.
 * Mesaj dosyaları: `src/messages/<locale>.json` (tr = kaynak dil).
 *
 * Çözüm sırası:
 *   1. `NEXT_LOCALE` cookie'si — en yüksek öncelik (User Settings dil
 *      kartı / Save akışı yazar; kullanıcı tercihi hep korunur).
 *   2. Cookie yoksa → kullanıcı kaydı: `user_settings.language` (oturum
 *      kullanıcısının son kaydetmiş olduğu dil) — DB'de de kayıtlıysa
 *      cookie'ye sabitlenir. Ayarlar sayfasını açmadan da geçer.
 *   3. O da yoksa → `Accept-Language` tespit edilir ve cookie'ye sabitlenir
 *      (1 yıl) — sonraki istekler ve tarayıcı dil değişiklikleri etkilemez.
 *   4. Fallback her zaman `en` (header okunamaz/uymuyorsa).
 *   Kullanıcı yeniden tespit istiyorsa: cookie silinir + settings'ten
 *   dil değişir (Save cookie yazar).
 *
 * next-intl middleware'i KULLANILMIYOR — `localePrefix:'never'` modunda
 * 404'e çevirdiği için dil burada çözülüyor (deterministik, URL sabit).
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get("NEXT_LOCALE")?.value;
  if (hasLocale(routing.locales, fromCookie)) {
    return {
      locale: fromCookie,
      messages: (await import(`./messages/${fromCookie}.json`)).default,
    };
  }

  // Cookie yok → 1. katman: kullanıcı kaydı (`user_settings.language`).
  // Yalnız cookie yokken sorgulanır; cookie bir kez sabitlenince bu katman
  // (auth + DB okuması) hiç çalışmaz. Hata/offline → 2. katmana düşer.
  const dbLocale = await resolveSessionUserLanguageLocale();
  if (dbLocale) {
    try {
      await store.set("NEXT_LOCALE", dbLocale, { path: "/", maxAge: 31536000 });
    } catch {
      // cookie yazılamadı → sonraki istekte yeniden denenebilir
    }
    return {
      locale: dbLocale,
      messages: (await import(`./messages/${dbLocale}.json`)).default,
    };
  }

  // 2. katman → tarayıcının dili (ilk değer: `tr-TR` / `en-US` vb).
  // Okunamaz veya locales içinde değilse fallback her zaman İngilizce.
  let locale: string = "en";
  try {
    const accept = (await headers()).get("accept-language") ?? "";
    const primary = (accept.split(",")[0] ?? "").trim().toLowerCase().split("-")[0];
    if (primary && hasLocale(routing.locales, primary)) locale = primary;
  } catch {
    // headers erişilemedi → fallback kalır
  }

  // İlk tespiti cookie'ye sabla (1 yıl, path=/ — settings `syncLocaleCookie`
  // ile birebir aynı sözleşme). Sonraki istekler cookie okur; tarayıcı dili
  // değişse bile site dili takla yapmaz. Kullanıcının settings'ten Save
  // etmesi bu cookie'yi ezer — tercih hep en üstte.
  try {
    await store.set("NEXT_LOCALE", locale, { path: "/", maxAge: 31536000 });
  } catch {
    // cookie yazılamadı (özel ortam) → yalnız bu istek etkilenir
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
