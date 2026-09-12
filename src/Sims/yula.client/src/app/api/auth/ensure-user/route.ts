import { resolveSessionDbUserId } from "@/features/auth/lib/app-user-sync";
import { languageToLocale } from "@/server/locale-sync";

/**
 * `POST /api/auth/ensure-user` — oturum sahibini `user_identities`'te
 * garantile (server-only, auth gerektirir).
 *
 * Katmanlı kimlik modelinde her provider login'inde YALNIZ identity
 * katmanı otomatik açılır:
 * - (provider, provider_id) eşleşmede → yeni satır: uygulama GUID'i,
 *   session profili, `lastActive = Now`.
 * - `language`: **yalnız ilk kayıtta** istek HTTP header'ındaki
 *   `Accept-Language` değerinden ("tr"/"en"); satır varken ASLA EZİLMEZ.
 * - `app_users` (yönetici katalogu) burada KESİNLİKLE dokunulmaz —
 *   yetkilendirme yalnız sistem admini System Users'ta açar;
 *   linki olmayan kimlik GUEST moddadadır.
 *
 * Yanıt: `{ userId: string | null }` — `user_identities.id` GUID'i.
 * Oturumsuz istekte (guard'ın istisna yutması) `{ userId: null }`
 * döner ve hata kodu vermez.
 */
export async function POST(req: Request) {
  let userId: string | null = null;
  try {
    // İlk kayıt dili: `Accept-Language`'ın birincil etiketi ("tr-TR" → "tr").
    const primaryTag =
      req.headers.get("accept-language")?.split(",")[0]?.trim().toLowerCase() ??
      "";
    userId = await resolveSessionDbUserId(languageToLocale(primaryTag));
  } catch (error) {
    // Beklenmeyen hata — istek başarılı olsun: session yoksa
    // resolveSessionDbUserId zaten null döner, burası yalnız safety net'ti.
    console.error("[ensure-user] upsert hatası:", error);
  }
  return Response.json({ userId });
}
