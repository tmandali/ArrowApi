/**
 * Yönetici doğrulama kapısı (server-only) — `app_users` yazma uçları.
 *
 * Katmanlı kimlik modelinde yetki TEK KAYNAK:
 * 1. DB kataloğu: session → `user_identities` (login kimliği) →
 *    `user_id` linki → `app_users.role === "System Administrator"`
 *    (admin yetkilendirme akışı linki açar).
 * 2. Bootstrap katmanı: Keycloak realm claim'i `app-admin` — katalog
 *    linki hiç açılmamış ilk yöneticiyi kilit dışı bırakmamak için
 *    (kataloğa ilk satırı kimin açacağı sorunu).
 *
 * KURAL: Bu modül Node runtime'ında çalışır (`@/server/db/client`,
 * `auth()` bağımlılığı). Asla client bileşeninden import etme.
 * Client karşılığı `use-effective-role.ts` (aynı iki kaynağı session
 * rolleriyle birleştirir; DB linki account-status API'sinden gelir).
 */
import { eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { appUsersSchema } from "@/server/db/schema";
import { APP_ADMIN_ROLE, APP_ROLE_ADMIN, hasRealmRole } from "./realm-roles";
import { findIdentityRowForLogin } from "./app-user-sync";
import { sessionIdentity } from "./session-identity";

export type AdminCheckResult =
  | { ok: true; reason: "catalog" | "realm" }
  | { ok: false; reason: "no-session" | "guest" | "no-role" };

/**
 * Oturum kullanıcısı yönetim rollerine sahip mi?
 *
 * - Realm claim `app-admin` var → `realm` (bootstrap).
 * - Yoksa DB linki: identity → app_users.role = "System Administrator".
 * - Hiçbiri değil → `ok: false` (guest / yetkisiz / oturumsuz).
 */
export async function assertSessionAdmin(): Promise<AdminCheckResult> {
  let session: Session | null = null;
  try {
    session = (await auth()) as Session | null;
  } catch {
    return { ok: false, reason: "no-session" };
  }
  if (!session?.user?.id || session.user.id === "unknown") {
    return { ok: false, reason: "no-session" };
  }

  // Bootstrap: realm claim (Keycloak admini; kataloğa linkli olmasa bile).
  if (hasRealmRole(session, APP_ADMIN_ROLE)) {
    return { ok: true, reason: "realm" };
  }

  const identity = sessionIdentity(session);
  if (!identity) return { ok: false, reason: "guest" };

  try {
    // Alias-aware login çözümü: birleştirilmiş kimliklerde hedef satır
    // silinmiştir, login çifti alias üzerinden ana kimliğe bakar.
    const identityRow = await findIdentityRowForLogin(identity.provider, identity.providerId);
    // Guest (link yok) → katalog yetkisi yok.
    if (!identityRow?.userId) return { ok: false, reason: "guest" };

    const [row] = await db
      .select({ role: appUsersSchema.role })
      .from(appUsersSchema)
      .where(eq(appUsersSchema.id, identityRow.userId))
      .limit(1);
    if (row?.role === APP_ROLE_ADMIN) return { ok: true, reason: "catalog" };
    return { ok: false, reason: "no-role" };
  } catch {
    // DB okunamadı → fail-CLOSED (yazma ucu güvenli tarafta kalsın).
    console.error("[admin-guard] DB doğrulama hatası — fail-closed:", new Date().toISOString());
    return { ok: false, reason: "no-role" };
  }
}
