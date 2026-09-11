"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { routing } from "@/lib/i18n-routing";

/**
 * `LocaleSwitcher` uyarlaması (shadcn Select).
 * `localePrefix:'never'` olduğu için URL değişmez — `NEXT_LOCALE`
 * çerezi yazılır ve sayfa yenilenir, proxy + provider yeni dili çözer.
 *
 * `defaultLocale` verildiğinde ayarlardaki kullanıcı tercihi öncelenir;
 * çerez bu değerle senkronize edilir.
 */
export function LocaleSwitcher({
  defaultLocale,
}: {
  defaultLocale: "tr" | "en" | null;
}) {
  const t = useTranslations("LocaleSwitcher");
  const cookieLocale = useLocale();
  const router = useRouter();

  const [value, setValue] = React.useState<string>(() => {
    if (defaultLocale) return defaultLocale;
    return cookieLocale ?? "tr";
  });

  React.useEffect(() => {
    if (defaultLocale && defaultLocale !== cookieLocale) {
      document.cookie = `NEXT_LOCALE=${defaultLocale}; path=/; max-age=31536000`;
      router.refresh();
    }
  }, [defaultLocale, cookieLocale, router]);

  const labelByLocale: Record<string, string> = {
    tr: t("turkish"),
    en: t("english"),
  };

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next === value) return;
        setValue(next);
        document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
        router.refresh();
      }}
    >
      <SelectTrigger
        className="h-7 w-auto gap-1 px-2 text-xs font-normal"
        aria-label={t("change_language")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {routing.locales.map((code) => (
          <SelectItem key={code} value={code} className="text-xs">
            {labelByLocale[code] ?? code.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
