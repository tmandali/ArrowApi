/**
 * Login kullanıcı ↔ `user_identities` köprüsü (server-only).
 *
 * Katmanlı kimlik modeli:
 * - `user_identities`: LOGIN KİMLİĞİ. Her provider login'inde
 *   ensure-user akışıyla otomatik açılır (upsert). `id` = UYGULAMANIN
 *   ürettiği stabil GUID (`user_settings`'in tek referansı).
 *   - `provider` + `provider_id` = login kimliği (Keycloak sub / Google sub);
 *     upsert eşleşmesi bu çift üzerine yapılır (unique index).
 *   - `language`: YALNIZ ilk kayıtta (Accept-Language) yazılır, sonra
 *     ASLA EZİLMEZ — ilk izlenim kalıcıdır.
 *   - `user_id` (nullable): admin yetkilendirme linki. NULL → GUEST;
 *     YALNIZCA admin akışı (System Users) yazar.
 *
 * `app_users` ise SALT YÖNETİCİ KATALOGUDUR — login akışı ASLA
 * yazmaz. Yönetici yetkilendirme gerektiğinde System Users'ta
 * guest (user_id NULL) kimliği seçip kayıt açar.
 *
 * KURAL: Bu modül Node runtime'ında çalışır (`@/server/db/client`
 * bağımlılığı). Asla client bileşeninden import etme.
 */
import { and, eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { identityAliasesSchema, userSettingsSchema, userIdentitiesSchema } from "@/server/db/schema";
import { appRoleForSession } from "./realm-roles";
import { normalizeProvider, sessionIdentity } from "./session-identity";

export { appRoleForSession, normalizeProvider, sessionIdentity };

/**
 * Alias-aware login çözümleyici (SAF OKUMA — upsert YOK).
 *
 * 1. `user_identities`'te `(provider, provider_id)` PRIMARY satırı var mı?
 * 2. Yoksa `identity_aliases`'ta eş var mı → `ownerId` ana kimliği döne.
 *    (cross-provider birleştirme: hedef kimlik silinmiş, login çifti
 *    alias üzerinden ana kimliğe bakıyor.)
 *
 * Tüm çözümler (upsert, GET, account-status, admin-guard) bu tek
 * yol üzerinden akar — alias ekleyince ek sorgu düzeltmesi gerekmez.
 */
export async function findIdentityRowForLogin(
  provider: string,
  providerId: string,
) {
  const [primary] = await db
    .select()
    .from(userIdentitiesSchema)
    .where(
      and(
        eq(userIdentitiesSchema.provider, provider),
        eq(userIdentitiesSchema.providerId, providerId),
      ),
    )
    .limit(1);
  if (primary) return primary;

  const [alias] = await db
    .select({ ownerId: identityAliasesSchema.ownerId })
    .from(identityAliasesSchema)
    .where(
      and(
        eq(identityAliasesSchema.provider, provider),
        eq(identityAliasesSchema.providerId, providerId),
      ),
    )
    .limit(1);
  if (!alias) return null;

  const [owner] = await db
    .select()
    .from(userIdentitiesSchema)
    .where(eq(userIdentitiesSchema.id, alias.ownerId))
    .limit(1);
  return owner ?? null;
}

/**
 * `(provider, provider_id)` ile identity satırını bulur (saf okuma —
 * upsert YOK; alias-aware, bkz. `findIdentityRowForLogin`).
 */
async function findIdentityBySessionIdentity(identity: {
  provider: string;
  providerId: string;
}) {
  return findIdentityRowForLogin(identity.provider, identity.providerId);
}

/**
 * `user_settings` SEED'i — identity satırı için ayar satırı yoksa
 * ilk girişte açılır (bir daha asla silinmez; mevcut satır KESİNLİKLE
 * ezilmez — onConflictDoNothing).
 *
 * Dil: identity'nin `language` snapshot'ı (ilk girişte Accept-Language);
 * o da yoksa param (`language`). Zaman dilimi locale form varsayılanlarıyla
 * aynı (tr → Europe/Istanbul, en → Asia/Kolkata).
 * `language` null kalırsa locale-sync zinciri (settings > identity >
 * Accept-Language > en) devreye girer — kullanıcıyı zorlamayız.
 */
async function ensureSettingsForIdentity(
  identityRow: {
    id: string;
    language: string | null;
  },
  language?: string | null,
) {
  const lang = identityRow.language ?? language ?? null;
  const timeZone = lang === "en" ? "Asia/Kolkata" : "Europe/Istanbul";
  await db
    .insert(userSettingsSchema)
    .values({
      userId: identityRow.id,
      language: lang,
      timeZone,
      systemFacts: {},
    })
    .onConflictDoNothing({ target: [userSettingsSchema.userId] });
}

/**
 * Oturum kullanıcısının `user_identities` satırını garanti eder (upsert).
 * - Satır yok: uygulama GUID'i (randomUUID) ile yeni kayıt; profil +
 *   `language` (yalnız ilk kayıtta verilen Accept-Language değeri) + "Now".
 * - Satır var: yalnız boş name/email alanları doldurulur + `lastActive = Now`;
 *   `language` VE `userId` ASLA EZİLMEZ (language ilk kayıt anının
 *   kalıcı yansımasıdır; userId'yı yalnız admin akışı yazar).
 * - Sonraki adım: `user_settings` SEED'i — ayar satırı yoksa login'de
 *   otomatik açılır (dil snapshot'undan), varsa dokunulmaz.
 * Dönüş: satırın uygulama GUID'i (`user_identities.id`).
 * Hata → loglanıp yutulur (login/ayar akışı DB hatasıyla kırılmaz).
 */
export async function upsertIdentityFromSession(
  session: Session,
  language?: string | null,
): Promise<string | null> {
  const identity = sessionIdentity(session);
  if (!identity) return null;
  const u = session.user;
  try {
    let row = await findIdentityBySessionIdentity(identity);
    let newId = "";

    if (row) {
      const [updated] = await db
        .update(userIdentitiesSchema)
        .set({
          // Boşsa session profilden doldur; doluysa mevcut değeri KORU:
          name: row.name ?? (u.name ?? null),
          email: row.email ?? (u.email ?? null),
          lastActive: "Now",
        })
        .where(eq(userIdentitiesSchema.id, row.id))
        .returning();
      row = updated ?? row;
    } else {
      // Yeni kayıt: uygulama GUID'i — provider'dan bağımsız, stabil.
      newId = crypto.randomUUID();
      await db
        .insert(userIdentitiesSchema)
        .values({
          id: newId,
          provider: identity.provider,
          providerId: identity.providerId,
          name: u.name ?? null,
          email: u.email ?? null,
          // İlk kayıtta Accept-Language snapshot'ı ("tr"|"en"); conflict'te
          // SET listesinde YOK → mevcut değer korunur (birleşme yarışında
          // diğer istek de aynı ilk kayıt dilini taşır — eş değer).
          language: language ?? null,
          userId: null,
          lastActive: "Now",
        })
        .onConflictDoNothing({
          // Yarışta (parallel request) satır başka istek tarafından
          // oluşturulduysa sessizce geç — unique(provider, provider_id).
          target: [userIdentitiesSchema.provider, userIdentitiesSchema.providerId],
        });
      // Alias-aware re-check: yarış esnasında admin bu login çiftini
      // birleştirmişse (alias + hedef silinmiş) ana kimliğe dön.
      row = await findIdentityRowForLogin(identity.provider, identity.providerId);
    }

    if (!row) {
      // Nadir yarış: insert yapıldı ama re-check satırı göremedi →
      // seed'i yeni GUID ile aç, kimlik GUID'i yine stabil döner.
      await ensureSettingsForIdentity({ id: newId, language: language ?? null }, language);
      return newId;
    }

    // user_settings seed'i: mevcut satırı EZMEZ (onConflictDoNothing).
    await ensureSettingsForIdentity(row, language);
    return row.id;
  } catch (error) {
    console.error(
      `[auth-sync] user_identities upsert hatası (${identity.provider}/${identity.providerId}):`,
      error,
    );
    return null;
  }
}

/**
 * Session kullanıcısını `user_identities`'e bağlıp **uygulama GUID'ini**
 * döndürür (upsert — `user_settings` FK'si için satırın varlığı şart).
 * - Oturum + geçerli provider/sub var → upsert → `user_identities.id`.
 * - Yok → null (fallback YOK; çağıran taraf session gerektirir).
 * `language`: YALNIZ ilk kayıtta (satır açılınca) kullanılan
 * Accept-Language değeridir.
 * Yan etki: `user_settings` seed'i — ayar satırı yoksa login'de açılır
 * (dil snapshot'undan), var ise asla ezilmez.
 *
 * `app_users` (yönetici katalogu) burada KESİNLİKLE açılmaz — yalnız
 * admin yetkilendirme akışı yazar; linki olmayan kullanıcı guest'tir.
 * Bu resolver YALNIZCA `ensure-user` + ayarlar PUT route kullanır.
 */
export async function resolveSessionDbUserId(
  language?: string | null,
): Promise<string | null> {
  try {
    const session = (await auth()) as Session | null;
    if (session) {
      const id = await upsertIdentityFromSession(session, language);
      if (id) return id;
    }
  } catch (error) {
    console.error("[auth-sync] session çözümlemede hata — session kullanılamadı:", error);
  }
  return null;
}

/**
 * Saf resolver — DB'ye YAZMAZ (yalnız SELECT). `local` alias'ını session
 * kullanıcılarının `user_identities` GUID'ine çevirir; henüz satırı yoksa
 * (ilk giriş, ensure-user beklemede) veya oturum yoksa null döner.
 * Ayarlar GET rotası bunu kullanır (salt okuma).
 */
export async function resolveSessionUserId(): Promise<string | null> {
  try {
    const session = (await auth()) as Session | null;
    const identity = sessionIdentity(session);
    if (!identity) return null;
    const row = await findIdentityBySessionIdentity(identity);
    return row?.id ?? null;
  } catch {
    // session/DB okunamadı → boş yanıt (fallback'i kalmadı)
    return null;
  }
}
