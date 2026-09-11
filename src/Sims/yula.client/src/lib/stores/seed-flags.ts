/**
 * Seed flag locale kümesi: localStorage değimi virgülle ayrılmış locale
 * listesi ("tr", "tr,en"). Eski tek-flag değeri "1" → TR kaynak locale
 * olarak yorumlanır; eski kullanıcılar yeni locale'de bir sonraki
 * bağlanışta (yalnız liste boşken) seed alır.
 */
export function parseSeededLocales(raw: string | null): string[] {
  if (!raw || raw === "1") return ["tr"];
  return raw.split(",").filter(Boolean);
}

/** `locale` hâlen işaretli değilse listeye ekleyip yeni flag değerini verir. */
export function withSeededLocale(raw: string | null, locale: string): string {
  const list = parseSeededLocales(raw);
  return list.includes(locale) ? list.join(",") : [...list, locale].join(",");
}
