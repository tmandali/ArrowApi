"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useAuthRoleStore } from "@/store/slices/auth-role-store";

const AUTH_ROUTES = ["/sign-in", "/login", "/sign-up"] as const;

/** Durum sorgulama sıklığı — ağ'a yük minimum: 60 sn + odaklanınca. */
const POLL_INTERVAL_MS = 60_000;

/**
 * Hesap durumu koruması (provider'dan bağımsız: Keycloak + Google).
 *
 * `GET /api/auth/account-status` route'u session kullanıcısının
 * `app_users.status` değerini okur. Yönetici System Users ekranında
 * hesabı `Inactive` yaptığında (aynı oturum hâlâ canlıyken) kullanıcı
 * otomatik sign-out edilir ve sign-in kartında "hesabınız devre dışı
 * alındı" mesajıyla karşılaşır.
 *
 * Fail-open: route DB hatasında `active:true` döner → login asla kırılmaz.
 * Tek kullanıcı / provider'sız modda guard ateşlemez (route `active:true`).
 */
export function AccountStatusGuard() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const signingOutRef = useRef(false);

  const isAuthRoute = pathname ? AUTH_ROUTES.some((route) => pathname.startsWith(route)) : false;

  useEffect(() => {
    // Auth ekranlarındayken (sign-in, login, sign-up vb.) guard ve signOut döngüsü çalıştırma
    if (isAuthRoute) {
      signingOutRef.current = false;
      return;
    }

    const user = session?.user as
      | (NonNullable<typeof session>["user"] & { accessToken?: string; provider?: string })
      | undefined;
    const isExpired =
      (session as { error?: string } | null)?.error === "RefreshTokenError" ||
      (status === "authenticated" && !!user && user.provider !== "sms" && !user.accessToken);

    if (isExpired) {
      if (!signingOutRef.current) {
        signingOutRef.current = true;
        void signOut({
          callbackUrl: "/sign-in?reason=session_expired",
        }).catch(() => {
          signingOutRef.current = false;
        });
      }
      return;
    }

    if (status !== "authenticated") {
      signingOutRef.current = false;
      return;
    }

    let disposed = false;
    let inFlight = false;

    // Yeni login olan kullanıcıyı ilk tam sayfa yüklemesinde app_users'a
    // düşür (upsert). Yalnız ayarlar sayfasında çalışmadığı için
    // /system/users listesi yeni kullanıcıları gösterebilsin. Fire-and-
    // forget: hata guard'ı engellemez (route fail-open 200 döner).
    void fetch("/api/auth/ensure-user", {
      method: "POST",
      cache: "no-store",
    }).catch(() => undefined);

    const check = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        const res = await fetch("/api/auth/account-status", {
          cache: "no-store",
        });
        if (disposed || !res.ok) return;
        const data = (await res.json()) as { active?: boolean; role?: string | null };
        // Etkin rol: guest ekran gating'i + admin nav filtrelemenin canlı kaynağı.
        // Yalnız gerçek değerleri yaz — `role` boş gelirse hazır rol ezmeyecek.
        if (data.role) useAuthRoleStore.getState().setRole(data.role);
        if (data.active === false) {
          // signOut Promise — asıl hata yönetimi sign-in kartında.
          if (!signingOutRef.current) {
            signingOutRef.current = true;
            void signOut({
              callbackUrl: "/sign-in?reason=deactivated",
            }).catch(() => {
              signingOutRef.current = false;
            });
          }
          // Tek seferlik: sign-out sonrası status "unauthenticated" olur.
          return;
        }
      } catch {
        // offline — son oturuma dokunma (fail-open)
      } finally {
        inFlight = false;
      }
    };

    void check();
    const interval = window.setInterval(check, POLL_INTERVAL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [status, session, isAuthRoute]);

  return null;
}
