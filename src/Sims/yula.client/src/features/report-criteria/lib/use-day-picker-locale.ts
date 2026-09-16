"use client";

import { useLocale } from "next-intl";
import { tr, type Locale } from "react-day-picker/locale";

/**
 * next-intl locale kodu → `react-day-picker` Locale eşlemesi.
 * İngilizce gün/ay adları react-day-picker'ın yerleşik varsayılanıdır
 * (harita dışındaki kodlar → `undefined` → default EN).
 */
const DAY_PICKER_LOCALES: Record<string, Locale> = { tr };

/** Uygulama diline göre `Calendar` (react-day-picker) bileşeni locale'i döner. */
export function useDayPickerLocale(): Locale | undefined {
  const code = useLocale();
  return DAY_PICKER_LOCALES[code];
}
