type GreetingTranslator = (
  key: "night" | "morning" | "afternoon" | "evening",
) => string;

/** Hour-of-day greeting key (caller resolves it via the `Greeting` namespace). */
export function greetingFor(date: Date, t: GreetingTranslator) {
  const h = date.getHours();
  if (h < 6) return t("night");
  if (h < 12) return t("morning");
  if (h < 18) return t("afternoon");
  return t("evening");
}

/** Locale-aware long date ("Salı, 21 Ocak" / "Tuesday, 21 January"). */
export function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
