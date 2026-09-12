/**
 * Dil kaynağı senkronu (server-only) — tek doğruluk katmanı.
 *
 * Öncelik: cookie (`NEXT_LOCALE`) > DB (ayarlar → ilk kayıt dil snapshot'ı) >
 * Accept-Language. `i18n.ts` cookie yokken DB katmanını buradan çözer;
 * sonuç cookie'ye sabitlenir ve sonraki istekler tekrar sorgulamaz.
 *
 * DB katman içi öncelik:
 * 1. `user_settings.language` — kullanıcının AYARLAR'da BELLİ BAŞI seçimi
 * 2. `user_identities.language` — ilk login'de Accept-Language'dan
 *    snapshot'lanan dil (Settings'e hiç uğramamış kullanıcılar için de tutarlı).
 *
 * KURAL: Bu modül Node runtime'ında çalışır (`@/server/db/client`,
 * `auth()` bağımlılığı). Asla client bileşeninden import etme.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { userSettingsSchema, userIdentitiesSchema } from "@/server/db/schema";
import { resolveSessionUserId } from "@/features/auth/lib/app-user-sync";

/** Dil metni → UI locale ("turkish"/"tr"/"türkçe" → "tr", "english"/"en" → "en"). */
export function languageToLocale(value: unknown): "tr" | "en" | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (v === "turkish" || v === "tr" || v === "türkçe") return "tr";
  if (v === "english" || v === "en") return "en";
  return undefined;
}

/**
 * Oturum kullanıcısının DB'de kayıtlı dilini döndürür (SAF OKUMA — upsert
 * YOK). Hiç kayıt/oturum/DB yoksa veya hata → null (çağrılan taraf
 * Accept-Language katmanına düşer; fail-open).
 */
export async function resolveSessionUserLanguageLocale(): Promise<"tr" | "en" | null> {
  try {
    // Saf resolver: session (provider + provider_id) → user_identities GUID'i.
    const userId = await resolveSessionUserId();
    if (!userId) return null;

    // 1) İlk kayıt dil snapshot'ı (identity — ensure-user her login'de açar).
    const [identityRow] = await db
      .select({ language: userIdentitiesSchema.language })
      .from(userIdentitiesSchema)
      .where(eq(userIdentitiesSchema.id, userId))
      .limit(1);
    const fromIdentity = languageToLocale(identityRow?.language);

    // 2) Açık ayar seçimi (settings) — varsa onu kazanır.
    const [settingsRow] = await db
      .select({ language: userSettingsSchema.language })
      .from(userSettingsSchema)
      .where(eq(userSettingsSchema.userId, userId))
      .limit(1);
    return languageToLocale(settingsRow?.language) ?? fromIdentity ?? null;
  } catch {
    // DB/oturum okunamadı → fallback katmanına bırak
    return null;
  }
}
