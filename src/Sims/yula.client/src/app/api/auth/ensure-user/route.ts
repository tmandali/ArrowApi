import { resolveSessionDbUserId } from "@/features/auth/lib/app-user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Login kullanıcısını `app_users`'a garanti eder (upsert).
 *
 * `/api/my/settings` yalnız ayarlar sayfası açılınca çalıştığı için,
 * yeni bir Google/Keycloak kullanıcı login olup ayarları açmadan
 * System Users ekranına bakarsa satırı oluşmazdı. Bu route guard
 * (AccountStatusGuard) tarafından authenticated geçişinde tek sefer
 * tetiklenir → ilk tam sayfa yüklemesinde kullanıcı DB'ye düşer.
 *
 * Fail-open: hata durumunda 500 değil, fallback id ile 200 — login
 * asla DB hatasıyla kırılmaz.
 */
export async function POST() {
  let userId: string;
  try {
    userId = await resolveSessionDbUserId();
  } catch (error) {
    console.error("[ensure-user] upsert hatası:", error);
    userId = "usr_101";
  }
  return Response.json({ userId });
}
