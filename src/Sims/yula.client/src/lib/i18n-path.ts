/**
 * Locale-önekli path yardımcısı (örnek proje `getI18nPath` uyarlaması).
 * Varsayılan dil öneksiz (`/login`), diğer diller önekli (`/en/login`).
 * `next-intl` yok; saf string yardımcıları — TR/EN'e geçince kullanılır.
 */

export const DEFAULT_LOCALE = "tr";
export const SUPPORTED_LOCALES = ["tr", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value.toLowerCase())
  );
}

export function getI18nPath(url: string, locale: string): string {
  const base = url.startsWith("/") ? url : `/${url}`;
  if (!locale || locale.toLowerCase() === DEFAULT_LOCALE) return base;
  return `/${locale.toLowerCase()}${base}`;
}

export function getLocaleFromPathname(pathname: string): AppLocale {
  const first = pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  return isAppLocale(first) ? first : DEFAULT_LOCALE;
}
