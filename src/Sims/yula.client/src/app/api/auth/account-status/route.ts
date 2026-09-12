import { eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { appUsersSchema } from "@/server/db/schema";
import { isAccountStatusActive } from "@/features/auth/lib/account-status";
import { findIdentityRowForLogin, sessionIdentity } from "@/features/auth/lib/app-user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Login kullanıcının hesap durum sorgusu (SADECE OKUMA — upsert yok).
 *
 * Katmanlı kimlik modeli: session `(provider, sub)` önce `user_identities`
 * satırına bağlanır; durum yalnızca admin yetkilendirmesi (link) varsa
 * `app_users.status` üzerinden kontrol edilir.
 *
 * - Oturum yok → `active: true` (guard ateşlemez).
 * - GUEST (identity'de `user_id` NULL — yönetici linki yok) → `active: true`
 *   (yönetici kataloğa eklemediği kimliği kilitleyemez).
 * - Linkli kullanıcıda Yönetici `Inactive` yaptığında istemci
 *   (AccountStatusGuard) bunu okuyup otomatik sign-out eder.
 * - Identity satırı henüz yok (ilk giriş, ensure-user beklemede) →
 *   `active: true` (fail-open: durum kontrolü login'i kırmaz).
 *
 * Yanıt `role` alanı guest ekran gating'inin verisidir:
 * - link yok → `"Guest"`; linkli → `app_users.role` değeri.
 * - Oturum yok → `role: null`.
 * (Realm claim `app-admin` bootstrap'i client tarafında session rolleriyle
 * birleştirilir — bu route salt DB katmanıdır.)
 */
export async function GET() {
  let userId: string | null = null;
  let status: string | null = null;
  let role: string | null = null;
  let active = true;

  try {
    const session = (await auth()) as Session | null;
    userId = session?.user?.id ?? null;
    const identity = sessionIdentity(session);
    if (userId && userId !== "unknown" && identity) {
      // 1) Login kimliği → identity satırı (alias-aware: birleştirilmiş
      //    kimliklerde login çifti ana kimliğe yönlenir) + admin linki.
      const idRow = await findIdentityRowForLogin(identity.provider, identity.providerId);

      // Guest (link yok) → kilitleme imkânsız; active kalır, rol guesttir.
      if (idRow?.userId) {
        // 2) Yönetici katalog satırı → durum + rol.
        const [row] = await db
          .select({ status: appUsersSchema.status, role: appUsersSchema.role })
          .from(appUsersSchema)
          .where(eq(appUsersSchema.id, idRow.userId))
          .limit(1);
        status = row?.status ?? null;
        role = row?.role ?? "Guest";
        active = isAccountStatusActive(status);
      } else {
        role = "Guest";
      }
    }
  } catch (error) {
    console.error("[account-status] sorgu hatası — fail-open Active:", error);
    active = true;
  }

  return Response.json({ userId, status, role, active });
}
