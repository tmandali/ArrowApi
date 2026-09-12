/**
 * Login kullanıcı ↔ user DB köprüsü (server-only).
 *
 * Boilerplate'te kullanıcılar Clerk'in yönetilen DB'sinde yaşar; lokal
 * Postgres'e yalnız uygulama verisi düşer. Bizim projede user verisi
 * yerelde (drizzle → `app_users` / `user_settings`) olduğu için
 * oturum→DB bağlantısı bu modülle kurulur:
 *
 *   1. `auth()` (NextAuth v5) session'ını okur.
 *   2. Login'li kullanıcı için `app_users` satırını upsert eder
 *      (ilk girişte otomatik hesap oluşur — /sign-in kartındaki
 *      "ilk girişte hesap otomatik oluşur" akışıyla aynı mantık).
 *   3. Oturum yoksa tek kullanıcı moduna fallback: `usr_101`.
 *
 * KURAL: Bu modül Node runtime'ında çalışır (`@/server/db/client`
 * bağımlılığı). Asla client bileşeninden import etme.
 */
import { eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { appUsersSchema } from "@/server/db/schema";
import { appRoleForSession } from "./realm-roles";

export { appRoleForSession };

/** Tek kullanıcı modu fallback id'si (seed kullanıcı — usr_101). */
export const SINGLE_USER_ID = "usr_101";

/**
 * Oturum kullanıcıını `app_users`'ta garanti eder (upsert).
 * - Yeni kayıt: profil bilgileri + rol + Active + "Now" yazar.
 * - Mevcut kayıt: yalnız boş alanları doldurur + `lastActive = Now`;
 *   `role`/`status` ASLA ezilmez (System Users ekranı tek kaynak).
 * Hata → loglanıp yutulur (nav/ayar akışı DB hatasıyla kırılmaz).
 */
async function upsertAppUserFromSession(session: Session): Promise<void> {
  const u = session.user;
  try {
    const [existing] = await db
      .select()
      .from(appUsersSchema)
      .where(eq(appUsersSchema.id, u.id))
      .limit(1);

    await db
      .insert(appUsersSchema)
      .values({
        id: u.id,
        name: u.name ?? null,
        email: u.email ?? null,
        role: appRoleForSession(session),
        status: "Active",
        lastActive: "Now",
      })
      .onConflictDoUpdate({
        target: appUsersSchema.id,
        set: {
          // Boşsa session profilden doldur; doluysa mevcut değeri KORU:
          name: existing ? (u.name ?? existing.name) : (u.name ?? null),
          email: existing ? (u.email ?? existing.email) : (u.email ?? null),
          lastActive: "Now",
        },
      });
  } catch (error) {
    console.error(`[auth-sync] app_users upsert hatası (${u.id}):`, error);
  }
}

/**
 * Session kullanıcıını `app_users`'a bağlıp DB id'sini döndürür.
 * - Oturum + geçerli sub var → upsert + `session.user.id`.
 * - Yok (provider'sız tek kullanıcı modu) → `SINGLE_USER_ID` (usr_101).
 * Bu hımban YALNIZCA `ensure-user` route kullanır — ayarlar akmında
 * upsert tetiklenmez (ensure-user, authenticated geçışinde tetiklenir).
 */
export async function resolveSessionDbUserId(): Promise<string> {
  try {
    // NextAuth v5 base Session tipine döner; extended alanlar (roles vb.)
    // lib/auth'un session callback'inde garanti edilir — runtime güvenli cast.
    const session = (await auth()) as Session | null;
    if (session?.user?.id && session.user.id !== "unknown") {
      await upsertAppUserFromSession(session);
      return session.user.id;
    }
  } catch (error) {
    console.error("[auth-sync] session çözümlemede hata — fallback usr_101:", error);
  }
  return SINGLE_USER_ID;
}

/**
 * Saf resolver — DB'ye yazmaz (upsert YOK). `local` alias'ını session
 * kullanıcısına çevirir; satır yoksa da id'yi döndürür (create edilebilir).
 * Ayarlar rotaları (GET/PUT /api/my/settings) bunu kullanır.
 */
export async function resolveSessionUserId(): Promise<string> {
  try {
    const session = (await auth()) as Session | null;
    if (session?.user?.id && session.user.id !== "unknown") {
      return session.user.id;
    }
  } catch {
    // session okunamadı → fallback
  }
  return SINGLE_USER_ID;
}
