/**
 * Login kullanıcı ↔ user DB köprüsü (server-only).
 *
 * Boilerplate'te kullanıcılar Clerk'in yönetilen DB'sinde yaşar; lokal
 * Postgres'e yalnız uygulama verisi düşer. Bizim projede user verisi
 * yerelde (drizzle → `app_users` / `user_settings`) olduğu için
 * oturum→DB bağlantısı bu modülle kurulur:
 *
 *   1. `auth()` (NextAuth v5) session'ını okur (sub + provider).
 *   2. `(provider, provider_id)` eşleşmesiyle `app_users` satırını
 *      upsert eder.
 *   3. Oturum yoksa tek kullanıcı moduna fallback: `usr_101`.
 *
 * KİMLİK MODELİ (design C):
 *   - `app_users.id` = UYGULAMANIN ürettiği stabil UUID (bir kez verildikten
 *     sonra asla değişmez; provider'dan bağımsız).
 *   - `provider` + `provider_id` = login kimliği (Keycloak sub / Google sub).
 *     Upsert eşleşmesi BU çift üzerine yapılır — bir provider kimliği
 *     en fazla 1 satır üretir (unique index).
 *   - `user_settings` FK'i uygulama GUID'ine bakar; provider değişse bile
 *     kişisel veri kaybolmaz.
 *
 * KURAL: Bu modül Node runtime'ında çalışır (`@/server/db/client`
 * bağımlılığı). Asla client bileşeninden import etme.
 */
import { and, eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { appUsersSchema } from "@/server/db/schema";
import { appRoleForSession } from "./realm-roles";
import { normalizeProvider, sessionIdentity } from "./session-identity";

export { appRoleForSession, normalizeProvider, sessionIdentity };

/** Tek kullanıcı modu fallback id'si (seed kullanıcı — usr_101). */
export const SINGLE_USER_ID = "usr_101";


/**
 * `(provider, provider_id)` ile satırı bulur (saf okuma — upsert YOK).
 */
async function findAppUserBySessionIdentity(identity: {
  provider: string;
  providerId: string;
}) {
  const [row] = await db
    .select()
    .from(appUsersSchema)
    .where(
      and(
        eq(appUsersSchema.provider, identity.provider),
        eq(appUsersSchema.providerId, identity.providerId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Oturum kullanıcısının `app_users` satırını garanti eder (upsert).
 * - Satır yok: uygulama GUID'i (randomUUID) ile yeni kayıt; profil
 *   bilgileri + rol + Active + "Now" yazar.
 * - Satır var: yalnız boş alanları doldurur + `lastActive = Now`;
 *   `role`/`status`/`id` ASLA ezilmez (System Users ekranı tek kaynak).
 * Dönüş: satırın uygulama GUID'i (`app_users.id`).
 * Hata → loglanıp yutulur (nav/ayar akışı DB hatasıyla kırılmaz).
 */
export async function upsertAppUserFromSession(
  session: Session,
): Promise<string | null> {
  const identity = sessionIdentity(session);
  if (!identity) return null;
  const u = session.user;
  try {
    const existing = await findAppUserBySessionIdentity(identity);

    if (existing) {
      await db
        .update(appUsersSchema)
        .set({
          // Boşsa session profilden doldur; doluysa mevcut değeri KORU:
          name: existing.name ?? (u.name ?? null),
          email: existing.email ?? (u.email ?? null),
          lastActive: "Now",
        })
        .where(eq(appUsersSchema.id, existing.id));
      return existing.id;
    }

    // Yeni kayıt: uygulama GUID'i — provider'dan bağımsız, stabil.
    const newId = crypto.randomUUID();
    await db
      .insert(appUsersSchema)
      .values({
        id: newId,
        provider: identity.provider,
        providerId: identity.providerId,
        name: u.name ?? null,
        email: u.email ?? null,
        role: appRoleForSession(session),
        status: "Active",
        lastActive: "Now",
      })
      .onConflictDoNothing({
        // Yarışta (parallel request) satır başka istek tarafından
        // oluşturulduysa sessizce geç — unique(provider, provider_id).
        target: [appUsersSchema.provider, appUsersSchema.providerId],
      });
    const [created] = await db
      .select({ id: appUsersSchema.id })
      .from(appUsersSchema)
      .where(
        and(
          eq(appUsersSchema.provider, identity.provider),
          eq(appUsersSchema.providerId, identity.providerId),
        ),
      )
      .limit(1);
    return created?.id ?? newId;
  } catch (error) {
    console.error(
      `[auth-sync] app_users upsert hatası (${identity.provider}/${identity.providerId}):`,
      error,
    );
    return null;
  }
}

/**
 * Session kullanıcısını `app_users`'a bağlıp **uygulama GUID'ini** döndürür
 * (upsert eder — `user_settings` FK'si için satırın varlığı şart).
 * - Oturum + geçerli provider/sub var → upsert → `app_users.id`.
 * - Yok (provider'sız tek kullanıcı modu) → `SINGLE_USER_ID` (usr_101).
 * Bu hımban YALNIZCA `ensure-user` + ayarlar PUT route kullanır.
 */
export async function resolveSessionDbUserId(): Promise<string> {
  try {
    const session = (await auth()) as Session | null;
    if (session) {
      const id = await upsertAppUserFromSession(session);
      if (id) return id;
    }
  } catch (error) {
    console.error("[auth-sync] session çözümlemede hata — fallback usr_101:", error);
  }
  return SINGLE_USER_ID;
}

/**
 * Saf resolver — DB'ye YAZMAZ (yalnız SELECT). `local` alias'ını session
 * kullanıcılarının uygulama GUID'ine çevirir; henüz satırı yoksa (ilk
 * giriş, ensure-user beklemede) null döner — çağıran taraf `local`
 * modunda kaldığı sürece usr_101 fallback'ine düşebilir.
 * Ayarlar GET rotası bunu kullanır (salt okuma).
 */
export async function resolveSessionUserId(): Promise<string | null> {
  try {
    const session = (await auth()) as Session | null;
    const identity = sessionIdentity(session);
    if (!identity) return null;
    const row = await findAppUserBySessionIdentity(identity);
    return row?.id ?? null;
  } catch {
    // session/DB okunamadı → fallback'e bırak
    return null;
  }
}
