import { eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { appUsersSchema } from "@/server/db/schema";
import { isAccountStatusActive } from "@/features/auth/lib/account-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Login kullanıcıanın `app_users` durum sorgusu (SADECE OKUMA — upsert yok).
 *
 * Provider'dan bağımsız (Keycloak/Google): session `user.id`'si (sub) ile
 * DB row'una bakar. Yönetici System Users ekranında `Inactive` yaptığında
 * istemci (AccountStatusGuard) bunu okuyup otomatik sign-out eder.
 *
 * - Oturum yok / provider'sız mod → `active: true` (guard ateşlemez).
 * - Row henüz yok (ilk giriş, upsert beklemede) → `active: true`
 *   (varsayılan Active — app-user-sync sözleşmesiyle tutarlı).
 * - DB hatası → `active: true` (fail-open: ayar kontrolü login'i kırmaz).
 */
export async function GET() {
  let userId: string | null = null;
  let status: string | null = null;
  let active = true;

  try {
    const session = (await auth()) as Session | null;
    userId = session?.user?.id ?? null;
    if (userId && userId !== "unknown") {
      const [row] = await db
        .select({ status: appUsersSchema.status })
        .from(appUsersSchema)
        .where(eq(appUsersSchema.id, userId))
        .limit(1);
      status = row?.status ?? null;
      active = isAccountStatusActive(status);
    }
  } catch (error) {
    console.error("[account-status] sorgu hatası — fail-open Active:", error);
    active = true;
  }

  return Response.json({ userId, status, active });
}
