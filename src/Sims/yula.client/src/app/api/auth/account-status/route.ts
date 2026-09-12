import { and, eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { appUsersSchema } from "@/server/db/schema";
import { isAccountStatusActive } from "@/features/auth/lib/account-status";
import { sessionIdentity } from "@/features/auth/lib/app-user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Login kullanıcıının `app_users` durum sorgusu (SADECE OKUMA — upsert yok).
 *
 * Provider'dan bağımsız (Keycloak/Google): session `(provider, sub)` çifti
 * ile DB row'una bakar (design C: `id` uygulama GUID'i, `provider_id` ham
 * sub). Yönetici System Users ekranında `Inactive` yaptığında istemci
 * (AccountStatusGuard) bunu okuyup otomatik sign-out eder.
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
    const identity = sessionIdentity(session);
    if (userId && userId !== "unknown" && identity) {
      const [row] = await db
        .select({ status: appUsersSchema.status })
        .from(appUsersSchema)
        .where(
          and(
            eq(appUsersSchema.provider, identity.provider),
            eq(appUsersSchema.providerId, identity.providerId),
          ),
        )
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
