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
import { and, eq, isNull, ne } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import {
  appUsersSchema,
  identityAliasesSchema,
  userSettingsSchema,
  userIdentitiesSchema,
} from "@/server/db/schema";
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
/**
 * Otomatik GUEST DEDUP (bekleyen toplama): aynı provider + aynı e-postaya
 * sahip BEKLEYEN (`user_id IS NULL`) `user_identities` satırları, o ana
 * kadarki en güncel satıra (owner) toplanır — eski satırlar silinir
 * ("son gelen kalsın").
 *
 * Login upsert'i tarafından çağrılır; yalnız GUEST grubu işlenir:
 * linkli (`user_id` dolu) satırlara ASLA dokunulmaz (onlar için manuel
 * merge UI'ı var).
 * - Hedef login çifti → `identity_aliases` (owner): eski sub'larla
 *   yapılan login'ler artık alias-aware resolver üzerinden owner'a
 *   yönlenir.
 * - Ayarlar: owner'ın ayar satırı yoksa hedefininkiler taşınır,
 *   varsa hedefinkiler atılır.
 * - Hedef satırlar id ile silinir.
 * - Hedef login çifti zaten BAŞKA bir ana kimliğin alias'ı ise o hedef
 *   ATLANIR (manuel merge alanı). Yarış/kısıt hatasında sessiz geç —
 *   login akışı dedup yüzünden KESİNLİKLE KIRILMAZ.
 */
async function consolidateGuestDupes(
  owner: { id: string; name: string | null; email: string | null },
  dupes: Array<{ id: string; provider: string | null; providerId: string | null }>,
): Promise<void> {
  const targets = dupes.filter((d) => d.provider && d.providerId);
  if (targets.length === 0) return;
  try {
    await db.transaction(async (tx) => {
      for (const dupe of targets) {
        // Hedef login çifti başka bir owner'a alias ise çakışma —
        // manuel merge'a bırak (o hedefi atla).
        const [alias] = await tx
          .select({ ownerId: identityAliasesSchema.ownerId })
          .from(identityAliasesSchema)
          .where(
            and(
              eq(identityAliasesSchema.provider, dupe.provider!),
              eq(identityAliasesSchema.providerId, dupe.providerId!),
            ),
          )
          .limit(1);
        if (alias && alias.ownerId !== owner.id) continue;

        // Ayarlar: owner'da yoksa taşı, varsa hedefin satırını at.
        const [ownerSettings] = await tx
          .select({ userId: userSettingsSchema.userId })
          .from(userSettingsSchema)
          .where(eq(userSettingsSchema.userId, owner.id))
          .limit(1);
        if (ownerSettings) {
          await tx
            .delete(userSettingsSchema)
            .where(eq(userSettingsSchema.userId, dupe.id));
        } else {
          await tx
            .update(userSettingsSchema)
            .set({ userId: owner.id })
            .where(eq(userSettingsSchema.userId, dupe.id));
        }

        if (!alias) {
          await tx.insert(identityAliasesSchema).values({
            id: crypto.randomUUID(),
            ownerId: owner.id,
            provider: dupe.provider!,
            providerId: dupe.providerId!,
          });
        }
        // FK (identity_aliases.owner_id → user_identities.id, NO ACTION):
        // hedefe owner olarak bakan alias satırlarını silmeden ÖNCE ana
        // kimliğe taşı. unique(provider, provider_id) indeksi ÇİFT üzerinedir
        // (owner değil) → taşıma unique constraint'i asla çiğnemez.
        await tx
          .update(identityAliasesSchema)
          .set({ ownerId: owner.id })
          .where(eq(identityAliasesSchema.ownerId, dupe.id));
        await tx
          .delete(userIdentitiesSchema)
          .where(eq(userIdentitiesSchema.id, dupe.id));
      }
    });
    console.log(
      `[auth-sync] guest dedup: ${targets.length} bekleyen satır "${owner.email ?? owner.name ?? owner.id}" kimliğine toplandi.`,
    );
  } catch (error) {
    // Login akisi dedup yuzunden kirilmasin — logla, sessiz gec.
    console.error("[auth-sync] guest dedup hatasi:", error);
  }
}

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
      // Yeni kayıt çözümlemesi:
      // KURAL 1 (Aynı Sağlayıcı Koruması): Eğer giriş yapan kimlik, app_users tablosunda
      // AYNI provider (örn. 'keycloak') ve aynı doğrulanmış kurumsal e-posta ile zaten yetkilendirilmişse,
      // Keycloak test ortamının dynamic/ephemeral sub üretmesinden ötürü yetkisi kaybolmasın diye
      // yeni sub otomatik olarak mevcut katalog kullanıcısına bağlanır.
      //
      // KURAL 2 (Zero-Trust Cross-Provider İzolasyonu): Eğer giriş FARKLI bir sağlayıcıdan
      // (örn. Google OAuth, farklı LDAP realm) geliyorsa e-posta aynı olsa dahi userId NULL (Guest)
      // olarak açılır ve asla otomatik admin yapılmaz.
      let resolvedUserId: string | null = null;
      if (identity.provider && u.email) {
        const [existingSameProviderUser] = await db
          .select({ id: appUsersSchema.id })
          .from(appUsersSchema)
          .where(
            and(
              eq(appUsersSchema.provider, identity.provider),
              eq(appUsersSchema.email, u.email),
              ne(appUsersSchema.status, "Deleted"),
            ),
          )
          .limit(1);

        if (existingSameProviderUser) {
          resolvedUserId = existingSameProviderUser.id;
        }
      }

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
          userId: resolvedUserId,
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

    // Otomatik guest dedup ("son gelen kalsın"): aynı provider + aynı
    // e-postaya sahip BEKLEYEN satırlar bu (en güncel) satıra toplanır,
    // eskiler alias'a dönüp silinir. Linkli satırlar asla hedef olmaz.
    if (!row.userId && row.email && identity.provider) {
      const dupes = await db
        .select()
        .from(userIdentitiesSchema)
        .where(
          and(
            eq(userIdentitiesSchema.provider, identity.provider),
            eq(userIdentitiesSchema.email, row.email),
            isNull(userIdentitiesSchema.userId),
            ne(userIdentitiesSchema.providerId, identity.providerId),
            ne(userIdentitiesSchema.id, row.id),
          ),
        );
      await consolidateGuestDupes(row, dupes);
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
